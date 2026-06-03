import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ATENDIMENTO",
    short_name: "ATENDIMENTO",
    description: "Chat de atendimento SuporteSync.",
    start_url: "/dashboard?tab=chats",
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
  };
}
