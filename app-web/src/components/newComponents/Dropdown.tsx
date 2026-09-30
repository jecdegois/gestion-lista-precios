"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent } from "react";
import Icon from "../Icon";

export type SelectValue = string;

export interface SelectOption {
  value: SelectValue;
  label: string;
  searchText?: string;
  disabled?: boolean;
}

export interface DropdownLoadParams {
  query: string;
  offset: number;
  maxRecords: number;
}

type DropdownLoadHandler = (params: DropdownLoadParams) => void | Promise<void>;

interface DropdownProps {
  id: string;
  modelValue: SelectValue;
  options: readonly SelectOption[];
  label: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  searchable?: boolean;
  disabled?: boolean;
  loading?: boolean;
  loadingMore?: boolean;
  maxRecords?: number;
  hasMore?: boolean;
  nextOffset?: number | null;
  debounceMs?: number;
  onSearch?: DropdownLoadHandler;
  onLoadMore?: DropdownLoadHandler;
  clearOnOptionsChange?: boolean;
  onChange: (value: SelectValue, option: SelectOption) => void;
  onBlur?: () => void;
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export default function Dropdown({
  id,
  modelValue,
  options,
  label,
  placeholder = "Seleccionar...",
  searchPlaceholder = "Buscar...",
  emptyText = "Sin resultados",
  searchable = true,
  disabled = false,
  loading = false,
  loadingMore = false,
  maxRecords = 50,
  hasMore = false,
  nextOffset = null,
  debounceMs = 500,
  onSearch,
  onLoadMore,
  clearOnOptionsChange = false,
  onChange,
  onBlur,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const listboxId = `${id}-listbox`;
  const labelId = `${id}-label`;
  const searchId = `${id}-search`;
  const safeMaxRecords = Number.isInteger(maxRecords) && maxRecords > 0 ? maxRecords : 50;
  const remoteSearch = Boolean(onSearch || onLoadMore);

  const selectedOption = options.find((option) => option.value === modelValue);
  const visibleOptions = useMemo(() => {
    if (remoteSearch) return [...options];
    const search = normalize(query);
    const filtered = !searchable || !search
      ? [...options]
      : options.filter((option) => normalize(`${option.label} ${option.searchText ?? ""}`).includes(search));
    return filtered.slice(0, safeMaxRecords);
  }, [options, query, remoteSearch, safeMaxRecords, searchable]);

  const firstSelectableIndex = (items: readonly SelectOption[] = visibleOptions): number => {
    const selectedIndex = items.findIndex((option) => option.value === modelValue && !option.disabled);
    if (selectedIndex >= 0) return selectedIndex;
    return items.findIndex((option) => !option.disabled);
  };

  function closeDropdown() {
    setOpen(false);
    setQuery("");
  }

  function openDropdown() {
    if (disabled) return;
    setHighlightedIndex(firstSelectableIndex());
    setQuery("");
    setOpen(true);
  }

  function selectHighlighted() {
    const option = visibleOptions[highlightedIndex];
    if (!option || option.disabled) return;
    onChange(option.value, option);
    closeDropdown();
  }

  function moveHighlight(direction: 1 | -1) {
    if (visibleOptions.length === 0) return;
    let next = highlightedIndex;
    for (let step = 0; step < visibleOptions.length; step += 1) {
      next = (next + direction + visibleOptions.length) % visibleOptions.length;
      if (!visibleOptions[next].disabled) {
        setHighlightedIndex(next);
        return;
      }
    }
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) openDropdown();
      else moveHighlight(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) openDropdown();
      else moveHighlight(-1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) openDropdown();
      else selectHighlighted();
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      closeDropdown();
    }
  }

  function handleListKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveHighlight(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setHighlightedIndex(firstSelectableIndex());
    } else if (event.key === "End") {
      event.preventDefault();
      for (let index = visibleOptions.length - 1; index >= 0; index -= 1) {
        if (!visibleOptions[index].disabled) {
          setHighlightedIndex(index);
          break;
        }
      }
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectHighlighted();
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeDropdown();
    } else if (event.key === "Tab") {
      closeDropdown();
    }
  }

  function handleContainerBlur(event: FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && containerRef.current?.contains(nextTarget)) return;
    closeDropdown();
    onBlur?.();
  }

  function handleListScroll(event: React.UIEvent<HTMLDivElement>) {
    if (!remoteSearch || !onLoadMore || !hasMore || loading || loadingMore) return;
    const element = event.currentTarget;
    const nearEnd = element.scrollHeight - element.scrollTop - element.clientHeight <= 80;
    if (!nearEnd) return;
    void onLoadMore({
      query,
      offset: nextOffset ?? options.length,
      maxRecords: safeMaxRecords,
    });
  }

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && !containerRef.current?.contains(target)) closeDropdown();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (highlightedIndex >= visibleOptions.length) {
      setHighlightedIndex(firstSelectableIndex());
    }
    const focusTimer = window.setTimeout(() => {
      if (searchable) searchRef.current?.focus();
      else optionRefs.current[highlightedIndex]?.focus();
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [open, searchable, visibleOptions.length, highlightedIndex]);

  useEffect(() => {
    if (!open || !searchable || !onSearch) return;
    const timer = window.setTimeout(() => {
      void onSearch({ query, offset: 0, maxRecords: safeMaxRecords });
    }, Math.max(0, debounceMs));
    return () => window.clearTimeout(timer);
  }, [debounceMs, onSearch, open, query, safeMaxRecords, searchable]);

  useEffect(() => {
    if (clearOnOptionsChange && !loading && modelValue && !options.some((option) => option.value === modelValue)) {
      onChange("", { value: "", label: "" });
    }
  }, [clearOnOptionsChange, loading, modelValue, onChange, options]);

  const activeDescendant = highlightedIndex >= 0 ? `${id}-option-${highlightedIndex}` : undefined;

  return (
    <div ref={containerRef} className="relative w-full" onBlur={handleContainerBlur}>
      <label id={labelId} htmlFor={id} className="mb-1.5 block text-xs font-medium text-zinc-500">
        {label}
      </label>
      <button
        id={id}
        type="button"
        className="flex min-h-[38px] w-full items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-[13px] outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
        disabled={disabled}
        role="combobox"
        aria-labelledby={labelId}
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-haspopup="listbox"
        aria-activedescendant={open && !searchable ? activeDescendant : undefined}
        onClick={() => (open ? closeDropdown() : openDropdown())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className={selectedOption ? "truncate text-zinc-900" : "truncate text-zinc-400"}>
          {selectedOption?.label ?? placeholder}
        </span>
        {loading ? <Icon name="loader" className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-400" /> : <Icon name="chevronDown" className="h-3.5 w-3.5 shrink-0 text-zinc-500" />}
      </button>

      {open && !disabled && (
        <div className="absolute left-0 right-0 top-full z-[9999] mt-1 rounded-lg border border-zinc-200 bg-white p-1 shadow-xl" role="presentation">
          {searchable && (
            <div className="flex items-center gap-2 border-b border-zinc-100 px-2 pb-1">
              <Icon name="search" className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              <input
                ref={searchRef}
                id={searchId}
                type="search"
                className="min-w-0 flex-1 border-0 bg-transparent px-1 py-2 text-xs text-zinc-800 outline-none"
                placeholder={searchPlaceholder}
                value={query}
                role="searchbox"
                aria-label={`${label}: ${searchPlaceholder}`}
                aria-controls={listboxId}
                aria-activedescendant={activeDescendant}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setHighlightedIndex(0);
                }}
                onKeyDown={handleListKeyDown}
              />
            </div>
          )}

          <div
            ref={listboxRef}
            id={listboxId}
            role="listbox"
            aria-labelledby={labelId}
            className="max-h-60 overflow-y-auto py-1"
            onScroll={handleListScroll}
          >
            {loading && <p className="px-3 py-2 text-xs text-indigo-600">Cargando opciones...</p>}
            {visibleOptions.map((option, index) => (
              <div
                key={option.value}
                id={`${id}-option-${index}`}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                role="option"
                tabIndex={-1}
                aria-selected={option.value === modelValue}
                aria-disabled={option.disabled || undefined}
                className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-[13px] outline-none ${
                  option.disabled ? "cursor-not-allowed text-zinc-300" : "text-zinc-700 hover:bg-zinc-100 focus:bg-zinc-100"
                } ${highlightedIndex === index ? "bg-zinc-100" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!option.disabled) {
                    onChange(option.value, option);
                    closeDropdown();
                  }
                }}
                onKeyDown={handleListKeyDown}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.value === modelValue && <Icon name="check" className="h-3.5 w-3.5 shrink-0 text-zinc-700" />}
              </div>
            ))}
            {loadingMore && <p className="px-3 py-2 text-xs text-zinc-500">Cargando más artículos...</p>}
            {!loading && !loadingMore && visibleOptions.length === 0 && <p className="px-3 py-2 text-xs text-zinc-400">{emptyText}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
