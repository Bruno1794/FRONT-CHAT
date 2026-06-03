import type { Metadata } from "next";

export const metadata: Metadata = {
  manifest: "/api/pwa-manifest?start_url=/chat",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ATENDIMENTO",
  },
};

export default function ChatLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
