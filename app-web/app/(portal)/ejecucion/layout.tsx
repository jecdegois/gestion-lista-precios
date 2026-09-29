export default function EjecucionLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <h1 className="text-xl font-bold text-zinc-900 mb-4">Ejecución de SPs</h1>
      {children}
    </>
  );
}
