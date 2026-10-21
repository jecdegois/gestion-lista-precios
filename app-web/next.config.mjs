/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // Usuarios pasó a ser una sección de Configuración; se conservan los enlaces viejos.
  async redirects() {
    return [{ source: "/usuarios/:path*", destination: "/configuracion/usuarios/:path*", permanent: true }];
  },
  // mssql es un paquete solo de servidor: se externaliza para que no entre al bundle cliente.
  serverExternalPackages: ["mssql"],
};

export default nextConfig;
