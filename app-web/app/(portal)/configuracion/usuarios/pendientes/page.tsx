import UsersView from "@/features/users/components/UsersView";

export const metadata = { title: "Usuarios pendientes — Gestión Masiva de Precios" };

export default function PendingUsersPage() {
  return <UsersView tab="pending" />;
}
