import { redirect } from "next/navigation";
import LoginForm from "@/features/auth/components/forms/LoginForm";
import { requireAuth } from "@/server/session";

export const metadata = { title: "Iniciar sesión — Gestión Masiva de Precios" };

export default async function LoginPage() {
  const { isAuth } = await requireAuth();
  if (isAuth) redirect("/");

  return <LoginForm />;
}
