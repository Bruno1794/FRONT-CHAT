import type { Attachment } from "@/types";

function toLocalFileUrl(filename?: string) {
  return filename ? `/api/files/${encodeURIComponent(filename)}` : "#";
}

export function getAttachmentUrl(attachment: Attachment) {
  const rawUrl = attachment.url ?? attachment.path ?? attachment.filename;
  const filename = attachment.filename || rawUrl?.split(/[\\/]/).pop();

  if (!rawUrl) {
    return "#";
  }

  if (
    rawUrl.includes("/uploads/") ||
    rawUrl.includes("\\uploads\\") ||
    rawUrl.includes("src/uploads/") ||
    rawUrl.includes("src\\uploads\\")
  ) {
    return toLocalFileUrl(filename);
  }

  if (rawUrl.startsWith("blob:") || rawUrl.startsWith("data:")) {
    return rawUrl;
  }

  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    const fileFromUrl = rawUrl.split("/").pop();
    return rawUrl.includes("/files/")
      ? toLocalFileUrl(fileFromUrl ?? filename)
      : rawUrl;
  }

  if (rawUrl.startsWith("/files/")) {
    const fileFromUrl = rawUrl.split("/").pop();
    return toLocalFileUrl(fileFromUrl ?? filename);
  }

  if (
    rawUrl.includes("uploads/") ||
    rawUrl.includes("uploads\\") ||
    rawUrl.startsWith("/uploads/")
  ) {
    const fileFromPath = rawUrl.split(/[\\/]/).pop();
    return toLocalFileUrl(fileFromPath ?? filename);
  }

  if (filename && rawUrl.startsWith("/")) {
    return toLocalFileUrl(filename);
  }

  if (rawUrl.startsWith("/")) {
    return rawUrl;
  }

  return toLocalFileUrl(filename);
}

export function getAttachmentFileUrl(attachment: Attachment) {
  const filename =
    attachment.filename ||
    attachment.url?.split(/[\\/]/).pop() ||
    attachment.path?.split(/[\\/]/).pop();

  if (attachment.url?.startsWith("blob:") || attachment.url?.startsWith("data:")) {
    return attachment.url;
  }

  return toLocalFileUrl(filename);
}
