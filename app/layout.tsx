import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: "AI First-Responder · assistente do projeto",
  description:
    "Assistente de IA sobre o projeto AI First-Responder, preparado por Bruno Sousa para a entrevista na Medicare.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : undefined,
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B1F3A",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT" className={inter.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
