import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flash Creator — tu agenda de contenido, en control",
  description:
    "Organiza tu contenido de TikTok Studio con un agente local. Tus videos permanecen en tu equipo.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
