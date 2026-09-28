/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // mssql es un paquete solo de servidor: se externaliza para que no entre al bundle cliente.
  experimental: {
    serverComponentsExternalPackages: ["mssql"],
  },
};

export default nextConfig;
