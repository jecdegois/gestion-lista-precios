"use client";

import { useMemo, useState } from "react";
import type { SelectOption } from "@/components/newComponents/Dropdown";
import type { ArticuloCapturaManualRow } from "@/components/newComponents/TablaArticulosCapturaManual";
import TablaImpactoDescuentoManual from "@/components/newComponents/TablaImpactoDescuentoManual";
import { useCurrentUser } from "@/shared/components/layout/PortalProviders";
import { calcularVariacion, redondeoPreview } from "@/lib/preview";
import { esFilaMargen, type FilaPrecio, type FilaResultado } from "@/lib/domain-types";
import { simularManual } from "../../../api/solicitudes-api";
import type { SolicitudInput } from "../../../schemas/solicitud-schema";
import type { EntryMode, ProcessFormProps, UploadedFile } from "../../../types";
import { draftFile, draftValues, EMPTY_FILE } from "../../../utils/draft-values";
import { useArticleSearch } from "../../../hooks/useArticleSearch";
import { useOnChange } from "../../../hooks/useOnChange";
import { useRequestCatalog } from "../../../hooks/useRequestCatalog";
import { useRequestSubmission } from "../../../hooks/useRequestSubmission";
import { useSimulationExport } from "../../../hooks/useSimulationExport";
import EntryModeTabs from "../shared/EntryModeTabs";
import ExcelUpload from "../shared/ExcelUpload";
import ProcessFormLayout from "../shared/ProcessFormLayout";
import RequestActions from "../shared/RequestActions";
import SimulationResult from "../shared/SimulationResult";
import DiscountManualCapture from "./DiscountManualCapture";

const BASE_LIST = "mayoreod";

function itemsFromRows(rows: FilaResultado[]): ArticuloCapturaManualRow[] {
  return rows
    .filter((r): r is FilaPrecio => !esFilaMargen(r))
    .map((r, i) => ({
      fila: i + 1,
      codigo: r.codigo,
      listaCodigo: r.listaCodigo ?? "",
      lista: r.lista ?? "",
      variacionPorcentaje: String(r.variacionPorcentaje ?? ""),
    }));
}

export default function DiscountForm({ readOnly, consultOnly, draft, onSubmitted, onDiscardDraft }: ProcessFormProps) {
  const company = useCurrentUser().compania ?? "";
  const lockInput = readOnly && !consultOnly;
  const initial = draftValues(draft, "DISMINUCION");
  const isManualDraft = draft?.modalidad === "manual";

  const [mode, setMode] = useState<EntryMode>(draft?.modalidad ?? "manual");
  const [level, setLevel] = useState(initial.level);
  const [factor, setFactor] = useState(isManualDraft ? "" : initial.factor);
  const [items, setItems] = useState<ArticuloCapturaManualRow[]>(
    isManualDraft && draft?.filas?.length ? itemsFromRows(draft.filas) : [],
  );
  const [rows, setRows] = useState<FilaResultado[] | null>(draft?.filas?.length ? draft.filas : null);
  const [simulated, setSimulated] = useState(Boolean(draft?.filas?.length));
  const [file, setFile] = useState<UploadedFile>(draftFile(draft));
  const [itemError, setItemError] = useState<string | null>(null);

  const isExcel = mode === "excel";
  const catalog = useRequestCatalog(level, false);
  const search = useArticleSearch(level, !isExcel);
  const { exporting, exportRows } = useSimulationExport("descuento_lista_precio", "Descuento %");
  const submission = useRequestSubmission({ draft, onSubmitted, onReset: () => selectMode(mode) });

  const conversion = useMemo(() => calcularVariacion("DISMINUCION", factor), [factor]);
  const invalidFactor = factor !== "" && !conversion.valido;
  const levelName = (code: string) => catalog.levels.find((l) => l.codigo === code)?.nombre || code;
  const levelMissing = !!level && !catalog.levels.some((l) => l.codigo === level);
  const levelOptions: SelectOption[] = catalog.levels
    .filter((l) => l.codigo.toLowerCase() !== BASE_LIST)
    .map((l) => ({ value: l.codigo, label: l.nombre || l.codigo }));
  const selected = search.selected;
  const preview = selected && conversion.valido && conversion.factor != null ? redondeoPreview(selected.precioActual * conversion.factor) : null;
  const canAdd = !lockInput && !!level && !!selected && !invalidFactor && factor !== "";
  const errorCount = rows ? rows.filter((r) => !r.validacion.valido).length : 0;

  const fieldsComplete = isExcel
    ? !!rows && rows.every((r) => r.validacion.valido) && !!company
    : items.length > 0 && !!level && !levelMissing;
  const canSubmit = simulated && fieldsComplete && !readOnly;

  // Cualquier cambio de parámetros invalida la simulación previa.
  useOnChange(JSON.stringify([level, factor, items]), () => {
    setSimulated(false);
    submission.setSent(false);
  });

  function selectMode(next: EntryMode) {
    setMode(next);
    setLevel("");
    setFactor("");
    setItems([]);
    setItemError(null);
    setSimulated(false);
    setRows(null);
    setFile(EMPTY_FILE);
  }

  function addItem() {
    if (!canAdd || !selected) return;
    if (items.some((it) => it.codigo === selected.codigo && it.listaCodigo === level)) {
      setItemError(`El artículo ${selected.codigo} ya fue agregado para la lista ${levelName(level)}.`);
      return;
    }
    setItemError(null);
    setItems((prev) =>
      prev.concat([{ fila: prev.length + 1, codigo: selected.codigo, listaCodigo: level, lista: levelName(level), variacionPorcentaje: factor }]),
    );
    search.setSelected(null);
    setFactor("");
  }

  function removeItem(code: string, listCode: string) {
    setItems((prev) => prev.filter((it) => !(it.codigo === code && it.listaCodigo === listCode)).map((it, i) => ({ ...it, fila: i + 1 })));
  }

  /** Marca inválidas las filas con la lista base o con listas inexistentes en Softland. */
  function handleFileParsed(parsed: FilaResultado[], name: string, s3Key: string) {
    const adjusted = parsed.map((r) => {
      const listCode = (r as { listaCodigo?: string | null }).listaCodigo?.trim().toLowerCase();
      if (listCode === BASE_LIST) {
        return { ...r, validacion: { ...r.validacion, valido: false, causa: "La Lista Base (MAYOREOD) no se gestiona desde Descuento por Artículo." } };
      }
      if (listCode && !catalog.levels.some((l) => l.codigo.toLowerCase() === listCode)) {
        return { ...r, validacion: { ...r.validacion, valido: false, causa: "La lista no existe en los maestros de Softland." } };
      }
      return r;
    }) as FilaResultado[];
    setRows(adjusted);
    setFile({ name, s3Key });
    setSimulated(adjusted.length > 0);
    submission.setSent(false);
  }

  async function simulate() {
    if (isExcel) {
      setSimulated(true);
      return;
    }
    const res = await simularManual({
      proceso: "DESCUENTO_LISTA_PRECIO",
      nivel: level,
      factor,
      tipoVariacion: "DISMINUCION",
      items: items.map((it) => ({
        codigo: it.codigo,
        listaCodigo: it.listaCodigo,
        tipoVariacion: "DISMINUCION",
        variacionPorcentaje: it.variacionPorcentaje,
      })),
    });
    if (!res.ok) {
      setItemError(res.error);
      setRows([]);
      setSimulated(false);
      return;
    }
    setItemError(null);
    setRows(res.data.filas);
    setSimulated(true);
  }

  function buildRequest(): SolicitudInput {
    return {
      proceso: "DESCUENTO_LISTA_PRECIO",
      modalidad: mode,
      parametros: {
        nivel: level,
        factor,
        multiplicador: conversion.factor,
        tipoVariacion: "DISMINUCION",
        variacionPorcentaje: factor,
        nivelPrecio: level || undefined,
        articulos: rows ?? [],
      },
      filas: (rows ?? []) as unknown as SolicitudInput["filas"],
      archivoNombre: file.name,
      archivoS3Key: file.s3Key,
    };
  }

  function handleSubmit() {
    if (!canSubmit) return;
    if (!isExcel && levelMissing) {
      setItemError("La lista seleccionada no existe en los maestros de Softland.");
      return;
    }
    void submission.submit(buildRequest());
  }

  return (
    <ProcessFormLayout
      process="DESCUENTO_LISTA_PRECIO"
      draftId={submission.draftId}
      onDiscardDraft={onDiscardDraft}
      catalogStatus={{ loading: catalog.loading, error: catalog.error ?? search.error, noLevels: catalog.levels.length === 0 }}
    >
      <EntryModeTabs mode={mode} onChange={selectMode} />

      {isExcel ? (
        <ExcelUpload
          process="DESCUENTO_LISTA_PRECIO"
          level={level}
          disabled={lockInput}
          instructions="Use las columnas Lista de Precio, Código Artículo y Descuento %."
          templateHref="/api/plantilla?proceso=DESCUENTO_LISTA_PRECIO"
          errorCount={errorCount}
          errorMessage="Corrija y cargue nuevamente."
          onParsed={handleFileParsed}
        />
      ) : (
        <DiscountManualCapture
          level={level}
          levelOptions={levelOptions}
          catalogReady={!catalog.loading && !catalog.error && catalog.levels.length > 0}
          loadingCatalog={catalog.loading}
          search={search}
          factor={factor}
          canAdd={canAdd}
          preview={preview}
          items={items}
          itemError={itemError}
          disabled={lockInput}
          onLevelChange={setLevel}
          onFactorChange={setFactor}
          onAdd={addItem}
          onRemove={removeItem}
        />
      )}

      <RequestActions
        simulateLabel={isExcel ? "Precalcular impacto" : "Simular impacto"}
        canSimulate={!lockInput && fieldsComplete}
        onSimulate={() => void simulate()}
        canSave={fieldsComplete && simulated && !!rows?.length}
        canSubmit={canSubmit}
        submission={submission}
        onSave={() => void submission.saveDraft(buildRequest())}
        onSubmit={handleSubmit}
      />

      {rows && rows.length > 0 && (
        <SimulationResult exporting={exporting} onExport={() => void exportRows(() => rows)}>
          <TablaImpactoDescuentoManual filas={rows as FilaPrecio[]} />
        </SimulationResult>
      )}
    </ProcessFormLayout>
  );
}
