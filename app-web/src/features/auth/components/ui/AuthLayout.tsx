/** Marco común de las pantallas de acceso: marca, tarjeta con título y pie opcional. */
export default function AuthLayout({
  title,
  subtitle,
  footer,
  children,
}: {
  title?: string;
  subtitle?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10 bg-white">
      <div className="relative w-full max-w-md">
        <div className="text-center mb-10">
          <div className="w-14 h-14 rounded-lg bg-zinc-900 flex items-center justify-center text-white font-bold text-lg mx-auto mb-4 shadow-md">
            GP
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 mb-1">Gestión Masiva de Precios</h1>
          <p className="text-zinc-500 text-sm">Sistema de automatización de listas de precio</p>
        </div>

        <div className="card p-8 shadow-lg border border-zinc-100">
          {title && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-zinc-900 mb-1">{title}</h2>
              {subtitle && <p className="text-zinc-500 text-sm">{subtitle}</p>}
            </div>
          )}
          {children}
        </div>

        {footer && (
          <div className="mt-6 text-center space-y-1">
            <p className="text-zinc-500 text-xs">{footer}</p>
          </div>
        )}
      </div>
    </div>
  );
}
