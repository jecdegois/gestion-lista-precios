import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { NotificationHost } from "@/shared/notifications/notify";
import "./globals.css";

// next/font descarga las fuentes en el build y las sirve desde la app: sin CDN de terceros en runtime (SRI).
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], display: "swap", variable: "--font-jetbrains-mono" });

export const metadata: Metadata = {
  title: "Gestion Masiva de Precios - MV26020",
  description: "Portal web full-stack Next.js para la gestion masiva de precios y margen minimo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        {children}
        <NotificationHost />
      </body>
    </html>
  );
}
