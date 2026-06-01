import type { Attachment } from "@/types";
import { getAttachmentUrl } from "@/utils/attachments";
import { formatFileSize } from "@/utils/formatters";
import styles from "./FilePreview.module.css";

type Props = {
  attachment: Attachment;
};

export function FilePreview({ attachment }: Props) {
  const href = getAttachmentUrl(attachment);
  const rawName = attachment.original_name ?? attachment.filename;
  const extension = rawName.split(".").pop()?.toUpperCase() ?? "DOC";
  const type = getFileType(extension, attachment.mime_type);
  const label = attachment.original_name ?? `${type.label} enviado`;

  return (
    <div className={styles.preview}>
      <span className={`${styles.icon} ${styles[type.variant]}`}>{type.badge}</span>
      <div className={styles.content}>
        <strong>{label}</strong>
        <small>
          {extension} - {formatFileSize(attachment.size)}
        </small>
        {!attachment.original_name ? <em>{attachment.filename}</em> : null}
      </div>
      <div className={styles.actions}>
        <a href={href} target="_blank" rel="noreferrer">
          Abrir
        </a>
        <a href={href} download>
          Baixar
        </a>
      </div>
    </div>
  );
}

function getFileType(extension: string, mimeType: string) {
  if (mimeType === "application/pdf" || extension === "PDF") {
    return { badge: "PDF", label: "PDF", variant: "pdf" };
  }

  if (extension === "APK") {
    return { badge: "APK", label: "APK", variant: "apk" };
  }

  if (["ZIP", "RAR", "7Z"].includes(extension)) {
    return { badge: "ZIP", label: "Arquivo compactado", variant: "zip" };
  }

  if (mimeType.startsWith("audio/")) {
    return { badge: "AUD", label: "Audio", variant: "audio" };
  }

  if (mimeType.startsWith("image/")) {
    return { badge: "IMG", label: "Imagem", variant: "image" };
  }

  return { badge: extension.slice(0, 4), label: "Arquivo", variant: "file" };
}
