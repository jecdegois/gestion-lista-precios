"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/shared/components/layout/PortalProviders";
import type { ApiResult } from "@/shared/api/api-types";
import {
  approveUser,
  createUser,
  deactivateUser,
  getUsers,
  reactivateUser,
  resetUserPassword,
  updateUser,
} from "../api/users-api";
import type { ApproveUserInput, CreateUserInput, UpdateUserInput } from "../schemas/user-schema";
import type { Catalogs, UserView } from "../types";

export type TemporaryPassword = { email: string; password: string };

/** Estado del listado de usuarios y sus acciones; cada acción notifica y refresca. */
export function useUsers() {
  const pushToast = useToast();
  const [users, setUsers] = useState<UserView[]>([]);
  const [catalogs, setCatalogs] = useState<Catalogs>({ companies: [], roles: [] });
  const [loading, setLoading] = useState(true);
  const [temporaryPassword, setTemporaryPassword] = useState<TemporaryPassword | null>(null);

  const refresh = useCallback(async () => {
    const res = await getUsers();
    if (res.ok) {
      setUsers(res.data.users);
      setCatalogs({ companies: res.data.companies, roles: res.data.roles });
    } else pushToast(res.error, "error");
    setLoading(false);
  }, [pushToast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Devuelve si la acción tuvo éxito. */
  async function run<T>(action: Promise<ApiResult<T>>, onSuccess?: (data: T) => void) {
    const res = await action;
    if (!res.ok) {
      pushToast(res.error, "error");
      return false;
    }
    pushToast(res.message ?? "Operación realizada", "success");
    onSuccess?.(res.data);
    await refresh();
    return true;
  }

  return {
    users,
    catalogs,
    loading,
    temporaryPassword,
    dismissTemporaryPassword: () => setTemporaryPassword(null),
    create: (input: CreateUserInput) =>
      run(createUser(input), (d) => setTemporaryPassword({ email: input.email, password: d.temporaryPassword })),
    update: (id: string, input: UpdateUserInput) => run(updateUser(id, input)),
    approve: (id: string, input: ApproveUserInput) => run(approveUser(id, input)),
    deactivate: (u: UserView) => run(deactivateUser(u.id)),
    reactivate: (u: UserView) => run(reactivateUser(u.id)),
    resetPassword: (u: UserView) =>
      run(resetUserPassword(u.id), (d) => setTemporaryPassword({ email: u.email, password: d.temporaryPassword })),
  };
}
