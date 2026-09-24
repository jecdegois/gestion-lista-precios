export default function NuevaSolicitudLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <h1 className="text-xl font-bold text-zinc-900 mb-4">Nueva solicitud de cambio de precio</h1>
      {children}
    </>
  );
}
