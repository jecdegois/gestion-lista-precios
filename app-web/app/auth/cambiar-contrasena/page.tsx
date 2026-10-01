import { redirect } from "next/navigation";
import ChangePasswordForm from "@/features/auth/components/forms/ChangePasswordForm";
import { requireAuth } from "@/server/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cambiar contraseña — Gestión Masiva de Precios" };

export default async function ChangePasswordPage() {
  const { isAuth, session } = await requireAuth();
  if (!isAuth) redirect("/auth/login");

  return <ChangePasswordForm forced={session.mustChangePassword} />;
}
