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

function getStartUrlFromReferer(request: NextRequest) {
  const referer = request.headers.get("referer");

  if (!referer) {
    return null;
  }

  try {
    const url = new URL(referer);

    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

export function GET(request: NextRequest) {
  const requestedStartUrl =
    request.nextUrl.searchParams.get("start_url") ?? getStartUrlFromReferer(request);
  const startUrl = sanitizeStartUrl(requestedStartUrl);
  const manifest: MetadataRoute.Manifest = {
    name: "ATENDIMENTO",
    short_name: "ATENDIMENTO",
    description: "Chat de atendimento SuporteSync.",
    start_url: startUrl,
    scope: "/",
    display: "standalone",
    background_color: "#e8dfd5",
    theme_color: "#075e54",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/atendimento-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/atendimento-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/atendimento-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/atendimento-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    share_target: {
      action: "/chat/share",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [
          {
            name: "files",
            accept: [
              "image/*",
              "application/pdf",
              "application/zip",
              "application/x-zip-compressed",
              "application/vnd.android.package-archive",
              "audio/*",
            ],
          },
        ],
      },
    },
  };

  return Response.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "no-store",
    },
  });
}
