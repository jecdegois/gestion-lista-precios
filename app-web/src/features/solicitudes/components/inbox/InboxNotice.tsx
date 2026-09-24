export default function InboxNotice() {
  return (
    <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-3 text-sm text-indigo-900">
      <p className="font-semibold">Procesamiento no bloqueante</p>
      <p className="text-xs mt-1 text-indigo-800">
        Al autorizar una solicitud, el proceso se ejecuta en segundo plano (estado <b>En proceso</b>) y usted puede seguir
        trabajando. Consulte el avance en cualquier momento.
      </p>
    </div>
  );
}
