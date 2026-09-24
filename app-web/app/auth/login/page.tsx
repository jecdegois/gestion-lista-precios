import { redirect } from "next/navigation";
import LoginForm from "@/features/auth/components/LoginForm";
import { getSessionContext } from "@/server/auth-guard";

export const metadata = { title: "Iniciar sesión — Gestión Masiva de Precios" };

export default async function LoginPage() {
  if (await getSessionContext()) redirect("/");

  return <LoginForm />;
}
