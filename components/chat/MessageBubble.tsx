"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import type { Attachment, Message } from "@/types";
import { getAttachmentFileUrl, getAttachmentUrl } from "@/utils/attachments";
import { formatTime } from "@/utils/formatters";
import { parseRichMessage } from "@/utils/richMessages";
import { FilePreview } from "./FilePreview";
import styles from "./MessageBubble.module.css";

const reactionEmojis = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

interface Props {
  message: Message;
  isMe: boolean;
  onReact?: (message: Message, emoji: string) => void;
  onEdit?: (message: Message) => void;
  onDelete?: (message: Message) => void;
}

export function MessageBubble({ message, isMe, onReact, onEdit, onDelete }: Props) {
  const [previewImage, setPreviewImage] = useState<{
    alt: string;
    url: string;
  } | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [copyFeedback, setCopyFeedback] = useState("");
  const [isReactionPickerOpen, setIsReactionPickerOpen] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const longPressTimeoutRef = useRef<number | null>(null);
  const isDeleted = Boolean(message.deleted_at);
  const hasAudioAttachment = Boolean(
    !isDeleted && message.attachments?.some((attachment) => attachment.mime_type.startsWith("audio/")),
  );
  const isRead = Boolean(message.read || message.read_at);
  const isDelivered = message.id > 0;
  const canManage = isMe && message.id > 0 && !isDeleted;
  const reactionGroups = Object.values(
    (message.reactions ?? []).reduce<Record<string, { emoji: string; count: number }>>(
      (groups, reaction) => {
        groups[reaction.emoji] = groups[reaction.emoji] ?? {
          emoji: reaction.emoji,
          count: 0,
        };
        groups[reaction.emoji].count += 1;

        return groups;
      },
      {},
    ),
  );
  const richMessage = parseRichMessage(message.message);

  const isImageAttachment = (attachment: Attachment) => {
    const name = `${attachment.original_name ?? attachment.filename}`.toLowerCase();

    return (
      attachment.mime_type.startsWith("image/") ||
      /\.(apng|avif|gif|jpe?g|png|webp|bmp|svg)$/i.test(name)
    );
  };

  useEffect(() => {
    if (!previewImage) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreviewImage(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [previewImage]);

  useEffect(() => {
    if (!isReactionPickerOpen && !isActionMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (bubbleRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsReactionPickerOpen(false);
      setIsActionMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsReactionPickerOpen(false);
        setIsActionMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isActionMenuOpen, isReactionPickerOpen]);

  const clearLongPressTimeout = () => {
    if (longPressTimeoutRef.current) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  };

  const copyRichMessageValue = async (value: string) => {
    setCopyFeedback("");

    try {
      await navigator.clipboard.writeText(value);
      setCopyFeedback("Copiado");
      window.setTimeout(() => setCopyFeedback(""), 1600);
    } catch {
      setCopyFeedback("Copie manualmente");
    }
  };

  return (
    <>
      <div
        className={`${styles.container} ${isMe ? styles.own : styles.other} ${
          reactionGroups.length > 0 ? styles.withReactions : ""
        }`}
      >
        <div
          ref={bubbleRef}
          className={`${styles.bubble} ${onReact && message.id > 0 ? styles.reactable : ""} ${
            isDeleted ? styles.deletedBubble : ""
          } ${hasAudioAttachment ? styles.audioBubble : ""
          }`}
          role={onReact && message.id > 0 ? "button" : undefined}
          tabIndex={onReact && message.id > 0 ? 0 : undefined}
          onContextMenu={(event) => {
            if (!canManage) {
              return;
            }

            event.preventDefault();
            setIsReactionPickerOpen(false);
            setIsActionMenuOpen(true);
          }}
          onClick={() => {
            if (onReact && message.id > 0) {
              setIsReactionPickerOpen((current) => !current);
            }
          }}
          onPointerDown={() => {
            if (!canManage) {
              return;
            }

            clearLongPressTimeout();
            longPressTimeoutRef.current = window.setTimeout(() => {
              setIsReactionPickerOpen(false);
              setIsActionMenuOpen(true);
            }, 520);
          }}
          onPointerLeave={clearLongPressTimeout}
          onPointerUp={clearLongPressTimeout}
          onPointerCancel={clearLongPressTimeout}
          onKeyDown={(event) => {
            if (!onReact || message.id <= 0) {
              return;
            }

            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setIsReactionPickerOpen((current) => !current);
            }
          }}
        >
          {isActionMenuOpen ? (
            <div className={styles.actionMenu}>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsActionMenuOpen(false);
                  onEdit?.(message);
                }}
              >
                Editar
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsActionMenuOpen(false);
                  onDelete?.(message);
                }}
              >
                Apagar
              </button>
            </div>
          ) : null}
          {onReact && message.id > 0 ? (
            <div className={styles.reactionArea}>
              {isReactionPickerOpen ? (
                <div className={styles.reactionPicker}>
                  {reactionEmojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      aria-label={`Reagir com ${emoji}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onReact(message, emoji);
                        setIsReactionPickerOpen(false);
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {isDeleted ? (
            <p className={`${styles.text} ${styles.deletedText}`}>Mensagem apagada</p>
          ) : richMessage?.type === "pix" ? (
            <div className={styles.pixCard}>
              <span className={styles.pixIcon}>PIX</span>
              <div className={styles.pixContent}>
                <strong>{richMessage.title}</strong>
                <p>{richMessage.body}</p>
                <code>{richMessage.copyValue}</code>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void copyRichMessageValue(richMessage.copyValue);
                }}
              >
                {copyFeedback || richMessage.copyLabel || "Copiar"}
              </button>
            </div>
          ) : message.message ? (
            <p className={styles.text}>{message.message}</p>
          ) : null}
          {!isDeleted && message.attachments?.map((attachment) => {
            const url = getAttachmentUrl(attachment);
            const label = attachment.original_name ?? attachment.filename;

            if (isImageAttachment(attachment)) {
              const fallbackUrl = getAttachmentFileUrl(attachment);
              const failedKey = `${message.id}-${attachment.filename}`;

              return (
                <button
                  className={`${styles.imageAttachment} ${
                    failedImages[failedKey] ? styles.imageFallback : ""
                  }`}
                  key={attachment.filename}
                  type="button"
                  onClick={() => setPreviewImage({ alt: label, url: fallbackUrl })}
                >
                  {failedImages[failedKey] ? (
                    <span>
                      <strong>Visualizar imagem</strong>
                      <small>{label}</small>
                    </span>
                  ) : (
                    <img
                      alt={label}
                      src={url}
                      onError={(event) => {
                        if (event.currentTarget.dataset.fallbackApplied) {
                          setFailedImages((current) => ({
                            ...current,
                            [failedKey]: true,
                          }));
                          return;
                        }

                        event.currentTarget.dataset.fallbackApplied = "true";
                        event.currentTarget.src = fallbackUrl;
                      }}
                    />
                  )}
                </button>
              );
            }

            if (attachment.mime_type.startsWith("audio/")) {
              return (
                <div className={styles.audioAttachment} key={attachment.filename}>
                  <span className={styles.audioIcon} aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M12 14c1.66 0 3-1.34 3-3V6c0-1.66-1.34-3-3-3S9 4.34 9 6v5c0 1.66 1.34 3 3 3Z" />
                      <path d="M17.3 11c0 3-2.14 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.52 2.55 6.28 6 6.75V21h2v-3.25c3.45-.47 6-3.23 6-6.75h-1.7Z" />
                    </svg>
                  </span>
                  <audio controls preload="metadata" src={url} />
                </div>
              );
            }

            return (
              <div className={styles.attachment} key={attachment.filename}>
                <FilePreview attachment={attachment} />
              </div>
            );
          })}
          <span className={styles.meta}>
            <span>{formatTime(message.created_at)}</span>
            {message.edited_at && !isDeleted ? <span>Editada</span> : null}
            <span
              aria-label={
                isRead ? "Mensagem lida" : isDelivered ? "Mensagem entregue" : "Mensagem enviada"
              }
              className={`${styles.receipt} ${
                isRead ? styles.read : isDelivered ? styles.delivered : ""
              }`}
              title={isRead ? "Lida" : isDelivered ? "Entregue" : "Enviada"}
            >
              {isDelivered ? "✓✓" : "✓"}
            </span>
          </span>
          {reactionGroups.length > 0 ? (
            <div className={styles.reactions}>
              {reactionGroups.map((reaction) => (
                <span key={reaction.emoji}>
                  {reaction.emoji}
                  {reaction.count > 1 ? <small>{reaction.count}</small> : null}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {previewImage ? (
        <div
          className={styles.lightbox}
          role="dialog"
          aria-modal="true"
          aria-label="Visualizar imagem"
          onClick={() => setPreviewImage(null)}
        >
          <button
            className={styles.closePreview}
            type="button"
            aria-label="Fechar imagem"
            onClick={() => setPreviewImage(null)}
          >
            X
          </button>
          <img
            alt={previewImage.alt}
            src={previewImage.url}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}
