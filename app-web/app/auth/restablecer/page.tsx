import { Suspense } from "react";
import SetPasswordForm from "@/features/auth/components/forms/SetPasswordForm";

export const metadata = { title: "Definir contraseña — Gestión Masiva de Precios" };

export default function SetPasswordPage() {
  return (
    <Suspense>
      <SetPasswordForm />
    </Suspense>
  );
}
