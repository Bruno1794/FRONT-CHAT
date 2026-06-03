import type { MetadataRoute } from "next";
import { NextRequest } from "next/server";

const DEFAULT_START_URL = "/dashboard?tab=chats";

function sanitizeStartUrl(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_START_URL;
  }

  if (value.startsWith("/chat")) {
    return value;
  }

  return DEFAULT_START_URL;
}

export function GET(request: NextRequest) {
  const startUrl = sanitizeStartUrl(request.nextUrl.searchParams.get("start_url"));
  const manifest: MetadataRoute.Manifest = {
    name: startUrl.startsWith("/chat") ? "SuporteSync Cliente" : "SuporteSync Painel",
    short_name: startUrl.startsWith("/chat") ? "Atendimento" : "SuporteSync",
    description: "Chat de atendimento SuporteSync.",
    start_url: startUrl,
    scope: "/",
    display: "standalone",
    background_color: "#e8dfd5",
    theme_color: "#075e54",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };

  return Response.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "no-store",
    },
  });
}
