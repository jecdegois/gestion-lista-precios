import { Suspense } from "react";
import SetPasswordForm from "@/features/auth/components/SetPasswordForm";

export const metadata = { title: "Definir contraseña — Gestión Masiva de Precios" };

export default function RestablecerPage() {
  return (
    <Suspense>
      <SetPasswordForm />
    </Suspense>
  );
}
