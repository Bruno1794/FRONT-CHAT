import type { MetadataRoute } from "next";

const SHARE_FILE_ACCEPT = [
  "image/*",
  "audio/*",
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.android.package-archive",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/octet-stream",
  ".pdf",
  ".zip",
  ".rar",
  ".7z",
  ".apk",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".csv",
];

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ATENDIMENTO",
    short_name: "ATENDIMENTO",
    description: "Chat de atendimento SuporteSync.",
    start_url: "/",
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
            accept: SHARE_FILE_ACCEPT,
          },
        ],
      },
    },
  };
}
