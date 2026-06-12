"use client";

import { useEffect, useState } from "react";
import styles from "@/components/chat/ChatOpeningPopup.module.css";
import { getChatPopupConfig } from "@/services/chatApi";
import type { ChatPopupConfig } from "@/types";

const POPUP_STORAGE_PREFIX = "suportesync.chatOpeningPopup";

type StoredPopupState = {
  dismissedForever?: boolean;
  lastDismissedAt?: number;
};

type ChatOpeningPopupProps = {
  isConversationStarted: boolean;
};

function readBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "sim", "on"].includes(value.trim().toLowerCase());
}

function readNumber(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function readPopupState(storageKey: string): StoredPopupState {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? "{}") as StoredPopupState;
  } catch {
    localStorage.removeItem(storageKey);
    return {};
  }
}

function shouldShowPopup(config: ChatPopupConfig, storageKey: string) {
  if (!config.enabled || (!config.title && !config.message && !config.imageUrl)) {
    return false;
  }

  const stored = readPopupState(storageKey);

  if (stored.dismissedForever) {
    return false;
  }

  if (!stored.lastDismissedAt || config.dismissHours <= 0) {
    return true;
  }

  const dismissIntervalMs = config.dismissHours * 60 * 60 * 1000;

  return Date.now() - stored.lastDismissedAt >= dismissIntervalMs;
}

function savePopupDismiss(storageKey: string, dontShowAgain: boolean) {
  const nextState: StoredPopupState = {
    dismissedForever: dontShowAgain,
    lastDismissedAt: Date.now(),
  };

  localStorage.setItem(storageKey, JSON.stringify(nextState));
}

function buildPopupConfig(): ChatPopupConfig {
  const dismissDays = Math.max(
    0,
    readNumber(process.env.NEXT_PUBLIC_CHAT_OPENING_POPUP_DISMISS_DAYS, 1),
  );

  return {
    enabled: readBoolean(process.env.NEXT_PUBLIC_CHAT_OPENING_POPUP_ENABLED, false),
    id: process.env.NEXT_PUBLIC_CHAT_OPENING_POPUP_ID?.trim() || "default",
    title: process.env.NEXT_PUBLIC_CHAT_OPENING_POPUP_TITLE?.trim() || "",
    message:
      process.env.NEXT_PUBLIC_CHAT_OPENING_POPUP_MESSAGE?.replace(/\\n/g, "\n").trim() || "",
    imageUrl: process.env.NEXT_PUBLIC_CHAT_OPENING_POPUP_IMAGE_URL?.trim() || "",
    imageAlt:
      process.env.NEXT_PUBLIC_CHAT_OPENING_POPUP_IMAGE_ALT?.trim() ||
      "Imagem do aviso",
    ctaLabel: process.env.NEXT_PUBLIC_CHAT_OPENING_POPUP_CTA_LABEL?.trim() || "",
    ctaUrl: process.env.NEXT_PUBLIC_CHAT_OPENING_POPUP_CTA_URL?.trim() || "",
    dismissHours: Math.max(
      0,
      readNumber(
        process.env.NEXT_PUBLIC_CHAT_OPENING_POPUP_DISMISS_HOURS,
        dismissDays * 24,
      ),
    ),
    delayMs: Math.max(
      0,
      readNumber(process.env.NEXT_PUBLIC_CHAT_OPENING_POPUP_DELAY_MS, 500),
    ),
    allowMarkAsSeen: readBoolean(
      process.env.NEXT_PUBLIC_CHAT_OPENING_POPUP_ALLOW_MARK_AS_SEEN ??
        process.env.NEXT_PUBLIC_CHAT_OPENING_POPUP_ALLOW_DONT_SHOW_AGAIN,
      true,
    ),
    closeOnBackdrop: readBoolean(
      process.env.NEXT_PUBLIC_CHAT_OPENING_POPUP_CLOSE_ON_BACKDROP,
      true,
    ),
    requireConversation: readBoolean(
      process.env.NEXT_PUBLIC_CHAT_OPENING_POPUP_REQUIRE_CONVERSATION,
      false,
    ),
  };
}

export function ChatOpeningPopup({ isConversationStarted }: ChatOpeningPopupProps) {
  const [config, setConfig] = useState<ChatPopupConfig>(() => buildPopupConfig());
  const storageKey = `${POPUP_STORAGE_PREFIX}.${config.id}`;
  const [isVisible, setIsVisible] = useState(false);
  const [markAsSeen, setMarkAsSeen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    getChatPopupConfig()
      .then((nextConfig) => {
        if (isMounted) {
          setConfig(nextConfig);
        }
      })
      .catch(() => {
        // Keep the environment fallback when the local popup API is unavailable.
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (config.requireConversation && !isConversationStarted) {
      return;
    }

    if (!shouldShowPopup(config, storageKey)) {
      return;
    }

    const timeoutId = window.setTimeout(() => setIsVisible(true), config.delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [config, isConversationStarted, storageKey]);

  if (!isVisible) {
    return null;
  }

  const closePopup = (forceSeen = false) => {
    savePopupDismiss(storageKey, forceSeen || markAsSeen);
    setIsVisible(false);
  };

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={config.title || "Aviso do atendimento"}
      onClick={() => {
        if (config.closeOnBackdrop) {
          closePopup();
        }
      }}
    >
      <section
        className={styles.popup}
        onClick={(event) => event.stopPropagation()}
      >
        {config.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={styles.image}
            src={config.imageUrl}
            alt={config.imageAlt}
          />
        ) : null}
        <div className={styles.content}>
          <header className={styles.header}>
            {config.title ? <h2 className={styles.title}>{config.title}</h2> : <span />}
            <button
              className={styles.closeButton}
              type="button"
              aria-label="Fechar aviso"
              onClick={() => closePopup()}
            >
              X
            </button>
          </header>
          {config.message ? <p className={styles.message}>{config.message}</p> : null}
          <div className={styles.actions}>
            {config.ctaLabel && config.ctaUrl ? (
              <a
                className={styles.linkButton}
                href={config.ctaUrl}
                target="_blank"
                rel="noreferrer"
              >
                {config.ctaLabel}
              </a>
            ) : null}
            {config.allowMarkAsSeen ? (
              <label className={styles.dontShowLabel}>
                <input
                  checked={markAsSeen}
                  type="checkbox"
                  onChange={(event) => setMarkAsSeen(event.target.checked)}
                />
                Marcar como visto e nao aparecer mais
              </label>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
