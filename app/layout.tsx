import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PwaRegistration } from "@/components/common/PwaRegistration";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SuporteSync",
  description: "Atendimento em tempo real para equipes de suporte.",
  applicationName: "ATENDIMENTO",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ATENDIMENTO",
  },
  icons: {
    icon: [
      { url: "/icons/atendimento-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/atendimento-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/atendimento-192.png", sizes: "192x192", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#075e54",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PwaRegistration />
        {children}
      </body>
    </html>
  );
}
