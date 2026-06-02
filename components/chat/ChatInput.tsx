"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/common/Button";
import { getShortcutSuggestions } from "@/services/chatApi";
import type { Shortcut } from "@/types";
import { formatFileSize } from "@/utils/formatters";
import styles from "./ChatInput.module.css";

const quickEmojis = [
  "😀",
  "😁",
  "😂",
  "😊",
  "😍",
  "👍",
  "🙏",
  "👏",
  "✅",
  "❤️",
  "🔥",
  "🎉",
  "😢",
  "😡",
  "🤔",
  "👌",
];

type Props = {
  disabled?: boolean;
  files?: File[];
  isSending?: boolean;
  shortcutToken?: string;
  onCreateShortcutRequest?: () => void;
  onFilesChange?: (files: File[]) => void;
  onSend?: (message: string, files: File[]) => Promise<void> | void;
};

export function ChatInput({
  disabled = false,
  files = [],
  isSending = false,
  shortcutToken,
  onCreateShortcutRequest,
  onFilesChange,
  onSend,
}: Props) {
  const [message, setMessage] = useState("");
  const [recordingError, setRecordingError] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [isLoadingShortcuts, setIsLoadingShortcuts] = useState(false);
  const [shortcutError, setShortcutError] = useState("");
  const [activeShortcutIndex, setActiveShortcutIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<number | null>(null);
  const shouldDiscardRecordingRef = useRef(false);
  const shortcutQuery = message.startsWith("/") ? message.split(/\s/)[0] : "";
  const hasMessageContent = message.trim().length > 0 || files.length > 0;
  const shouldShowShortcuts = Boolean(
    shortcutToken && shortcutQuery.startsWith("/") && !disabled && !isSending,
  );

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 132)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 132 ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [message, resizeTextarea]);

  useEffect(() => {
    if (!shortcutToken || !shouldShowShortcuts) {
      return;
    }

    let isCurrent = true;
    const timeoutId = window.setTimeout(() => {
      setIsLoadingShortcuts(true);
      setShortcutError("");

      getShortcutSuggestions(shortcutToken, shortcutQuery)
        .then((data) => {
          if (!isCurrent) {
            return;
          }

          setShortcuts(data);
          setActiveShortcutIndex(0);
        })
        .catch(() => {
          if (!isCurrent) {
            return;
          }

          setShortcutError("Nao foi possivel buscar atalhos.");
          setShortcuts([]);
        })
        .finally(() => {
          if (isCurrent) {
            setIsLoadingShortcuts(false);
          }
        });
    }, 180);

    return () => {
      isCurrent = false;
      window.clearTimeout(timeoutId);
    };
  }, [shortcutQuery, shortcutToken, shouldShowShortcuts]);

  const addFiles = (fileList: FileList | File[]) => {
    const nextFiles = Array.from(fileList);
    onFilesChange?.([...files, ...nextFiles]);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      addFiles(event.target.files);
    }
    event.target.value = "";
  };

  const removeFile = (index: number) => {
    onFilesChange?.(files.filter((_, fileIndex) => fileIndex !== index));
  };

  const getKind = (file: File) => {
    if (file.type.startsWith("image/")) {
      return "Foto";
    }

    if (file.type.startsWith("audio/")) {
      return "Audio";
    }

    if (
      file.type.includes("zip") ||
      file.name.toLowerCase().endsWith(".zip") ||
      file.name.toLowerCase().endsWith(".rar")
    ) {
      return "ZIP";
    }

    if (file.name.toLowerCase().endsWith(".apk")) {
      return "APK";
    }

    return "Arquivo";
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitMessage();
  };

  const submitMessage = async () => {
    const trimmed = message.trim();

    if ((!trimmed && files.length === 0) || disabled || isSending) {
      return;
    }

    await onSend?.(trimmed, files);
    setMessage("");
    onFilesChange?.([]);
    setShortcuts([]);
    setIsEmojiPickerOpen(false);
    window.requestAnimationFrame(resizeTextarea);
  };

  const applyShortcut = (shortcut: Shortcut) => {
    setMessage(shortcut.message);
    setShortcuts([]);
    setShortcutError("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (shouldShowShortcuts && shortcuts.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveShortcutIndex((current) => (current + 1) % shortcuts.length);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveShortcutIndex(
          (current) => (current - 1 + shortcuts.length) % shortcuts.length,
        );
        return;
      }

      if (event.key === "Tab" || event.key === "Enter") {
        event.preventDefault();
        applyShortcut(shortcuts[activeShortcutIndex] ?? shortcuts[0]);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setShortcuts([]);
        return;
      }
    }

    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    void submitMessage();
  };

  const handleMessageChange = (value: string) => {
    setMessage(value);

    if (!value.startsWith("/")) {
      setShortcuts([]);
      setShortcutError("");
      setIsLoadingShortcuts(false);
    }

    window.requestAnimationFrame(resizeTextarea);
  };

  const insertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? message.length;
    const end = textarea?.selectionEnd ?? message.length;
    const nextMessage = `${message.slice(0, start)}${emoji}${message.slice(end)}`;
    const nextPosition = start + emoji.length;

    setMessage(nextMessage);
    setShortcuts([]);
    setShortcutError("");

    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextPosition, nextPosition);
    });
  };

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const clearRecordingTimer = useCallback(() => {
    if (recordingIntervalRef.current) {
      window.clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
  }, []);

  const formatRecordingTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const remainingSeconds = (seconds % 60).toString().padStart(2, "0");

    return `${minutes}:${remainingSeconds}`;
  };

  const startRecording = async () => {
    if (disabled || isSending || isRecording) {
      return;
    }

    setRecordingError("");
    shouldDiscardRecordingRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);

      streamRef.current = stream;
      audioChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const extension = mimeType.includes("mp4") ? "m4a" : "webm";

        clearRecordingTimer();
        setRecordingSeconds(0);
        setIsRecording(false);
        stopStream();

        if (!shouldDiscardRecordingRef.current && audioBlob.size > 0) {
          const audioFile = new File(
            [audioBlob],
            `audio-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`,
            { type: mimeType },
          );

          void onSend?.("", [audioFile]);
          setMessage("");
          onFilesChange?.([]);
          setShortcuts([]);
          setIsEmojiPickerOpen(false);
        }

        audioChunksRef.current = [];
        mediaRecorderRef.current = null;
        shouldDiscardRecordingRef.current = false;
      };

      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      clearRecordingTimer();
      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingSeconds((current) => current + 1);
      }, 1000);
    } catch {
      setRecordingError("Nao foi possivel acessar o microfone.");
      clearRecordingTimer();
      setRecordingSeconds(0);
      stopStream();
    }
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
      return;
    }

    mediaRecorderRef.current.stop();
  };

  const cancelRecording = () => {
    shouldDiscardRecordingRef.current = true;
    audioChunksRef.current = [];
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
    }
    mediaRecorderRef.current = null;
    setIsRecording(false);
    setRecordingSeconds(0);
    clearRecordingTimer();
    stopStream();
  };

  useEffect(() => {
    return () => {
      shouldDiscardRecordingRef.current = true;
      clearRecordingTimer();
      if (mediaRecorderRef.current?.state !== "inactive") {
        mediaRecorderRef.current?.stop();
      }
      stopStream();
    };
  }, [clearRecordingTimer, stopStream]);

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {files.length > 0 ? (
        <div className={styles.previews}>
          {files.map((file, index) => (
            <div className={styles.preview} key={`${file.name}-${index}`}>
              {file.type.startsWith("image/") ? (
                <img alt={file.name} src={URL.createObjectURL(file)} />
              ) : (
                <span>{getKind(file)}</span>
              )}
              <div>
                <strong>{file.name}</strong>
                <small>{formatFileSize(file.size)}</small>
              </div>
              <button
                aria-label={`Remover ${file.name}`}
                type="button"
                onClick={() => removeFile(index)}
              >
                x
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {isRecording ? (
        <div className={styles.recordingBar}>
          <button
            className={styles.cancelRecording}
            type="button"
            aria-label="Cancelar gravacao"
            onClick={cancelRecording}
          >
            x
          </button>
          <div className={styles.recordingStatus}>
            <span className={styles.recordingDot} />
            <strong>Gravando audio</strong>
            <small>{formatRecordingTime(recordingSeconds)}</small>
          </div>
          <div className={styles.recordingWave} aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <button
            className={styles.stopRecording}
            type="button"
            aria-label="Parar e enviar audio"
            onClick={stopRecording}
          >
            <span />
          </button>
        </div>
      ) : null}
      {recordingError ? <p className={styles.recordingError}>{recordingError}</p> : null}
      {isEmojiPickerOpen ? (
        <div className={styles.emojiPicker} aria-label="Escolher emoji">
          {quickEmojis.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={`Inserir emoji ${emoji}`}
              onClick={() => insertEmoji(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}
      {shouldShowShortcuts ? (
        <div className={styles.shortcuts} role="listbox">
          <div className={styles.shortcutsHeader}>
            <strong>Atalhos rapidos</strong>
            <small>{isLoadingShortcuts ? "Buscando..." : "Enter ou Tab para usar"}</small>
          </div>
          {shortcutError ? <p>{shortcutError}</p> : null}
          {!shortcutError && !isLoadingShortcuts && shortcuts.length === 0 ? (
            <p>Nenhum atalho encontrado.</p>
          ) : null}
          {shortcuts.map((shortcut, index) => (
            <button
              className={index === activeShortcutIndex ? styles.activeShortcut : ""}
              key={shortcut.id}
              role="option"
              type="button"
              aria-selected={index === activeShortcutIndex}
              onMouseEnter={() => setActiveShortcutIndex(index)}
              onClick={() => applyShortcut(shortcut)}
            >
              <span>/{shortcut.shortcut}</span>
              <div>
                <strong>{shortcut.title}</strong>
                <small>{shortcut.message}</small>
              </div>
            </button>
          ))}
          {onCreateShortcutRequest ? (
            <button
              className={styles.createShortcut}
              type="button"
              onClick={onCreateShortcutRequest}
            >
              <span>+</span>
              <div>
                <strong>Criar novo atalho</strong>
                <small>Cadastre uma resposta rapida para usar com /</small>
              </div>
            </button>
          ) : null}
        </div>
      ) : null}
      <input
        ref={fileInputRef}
        className={styles.fileInput}
        type="file"
        accept="image/*,audio/*,video/*,.pdf,.zip,.rar,.apk,.doc,.docx,.xls,.xlsx,.txt"
        multiple
        onChange={handleFileChange}
      />
      <button
        className={styles.attach}
        disabled={disabled || isSending}
        type="button"
        aria-label="Anexar arquivo"
        onClick={() => fileInputRef.current?.click()}
      >
        +
      </button>

      <button
        className={styles.attach}
        disabled={disabled || isSending}
        type="button"
        aria-label="Inserir emoji"
        onClick={() => setIsEmojiPickerOpen((current) => !current)}
      >
        🙂
      </button>
      <textarea
        ref={textareaRef}
        aria-label="Mensagem"
        disabled={disabled || isSending}
        placeholder={
          shortcutToken ? "Digite sua mensagem ou / para atalhos" : "Digite sua mensagem"
        }
        rows={1}
        value={message}
        onKeyDown={handleKeyDown}
        onChange={(event) => handleMessageChange(event.target.value)}
      />
      {hasMessageContent ? (
        <Button disabled={disabled || isSending} type="submit">
          <span className={styles.sendText}>
            {isSending ? "Enviando..." : files.length > 0 ? "Enviar anexos" : "Enviar"}
          </span>
          <svg
            aria-hidden="true"
            className={styles.sendIcon}
            viewBox="0 0 24 24"
          >
            <path d="M3.6 20.4 21 12 3.6 3.6 3 10l10 2-10 2 .6 6.4Z" />
          </svg>
        </Button>
      ) : (
        <button
          className={`${styles.voiceSendButton} ${isRecording ? styles.recording : ""}`}
          disabled={disabled || isSending}
          type="button"
          aria-label={isRecording ? "Parar gravacao" : "Gravar audio"}
          onClick={isRecording ? stopRecording : startRecording}
        >
          {isRecording ? (
            "Parar"
          ) : (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className={styles.micIcon}
            >
              <path d="M12 14c1.66 0 3-1.34 3-3V6c0-1.66-1.34-3-3-3S9 4.34 9 6v5c0 1.66 1.34 3 3 3Z" />
              <path d="M17.3 11c0 3-2.14 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.52 2.55 6.28 6 6.75V21h2v-3.25c3.45-.47 6-3.23 6-6.75h-1.7Z" />
            </svg>
          )}
        </button>
      )}
    </form>
  );
}
