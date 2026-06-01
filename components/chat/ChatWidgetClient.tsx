"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChatInput } from "@/components/chat/ChatInput";
import { EditMessageModal } from "@/components/chat/EditMessageModal";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { useSocket } from "@/hooks/useSocket";
import {
  createConversation,
  deleteMessage,
  deleteMessageReaction,
  getClientMessages,
  markMessageAsRead,
  reactToMessage,
  sendMessage,
  updateMessage,
  uploadFile,
} from "@/services/chatApi";
import type {
  Attachment,
  Conversation,
  ConversationPresence,
  Message,
  MessageReactionUpdate,
  MessageReadReceipt,
  MessageType,
} from "@/types";
import { formatMessageDateLabel, getDateKey } from "@/utils/formatters";
import styles from "@/app/chat/chat.module.css";

const CLIENT_CHAT_SESSION_KEY = "suportesync.clientChat";

type WindowWithAudioContext = Window & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

type StoredClientChat = {
  code: string;
  conversation: Conversation;
};

function buildStartedMessage(conversationId: number): Message {
  return {
    id: -1,
    conversation_id: conversationId,
    sender_type: "SISTEMA",
    message: "Conversa iniciada. Envie sua mensagem para o suporte.",
    message_type: "TEXT",
    created_at: new Date().toISOString(),
  };
}

function isRunningInstalledPwa() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as NavigatorWithStandalone).standalone)
  );
}

function readStoredClientChat(initialCode: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const stored =
    localStorage.getItem(CLIENT_CHAT_SESSION_KEY) ??
    sessionStorage.getItem(CLIENT_CHAT_SESSION_KEY);

  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored) as StoredClientChat;

    if (initialCode && parsed.code !== initialCode) {
      localStorage.removeItem(CLIENT_CHAT_SESSION_KEY);
      sessionStorage.removeItem(CLIENT_CHAT_SESSION_KEY);
      return null;
    }

    return parsed;
  } catch {
    localStorage.removeItem(CLIENT_CHAT_SESSION_KEY);
    sessionStorage.removeItem(CLIENT_CHAT_SESSION_KEY);
    return null;
  }
}

export function ChatWidgetClient() {
  const searchParams = useSearchParams();
  const initialCode = searchParams.get("code") ?? "";
  const [codigoAcesso, setCodigoAcesso] = useState(
    () => readStoredClientChat(initialCode)?.code ?? initialCode,
  );
  const [conversation, setConversation] = useState<Conversation | null>(
    () => readStoredClientChat(initialCode)?.conversation ?? null,
  );
  const [presence, setPresence] = useState<ConversationPresence | null>(null);
  const [messages, setMessages] = useState<Message[]>(() => {
    const stored = readStoredClientChat(initialCode);

    if (stored) {
      return [buildStartedMessage(stored.conversation.id)];
    }

    return [
      {
        id: -1,
        conversation_id: 0,
        sender_type: "SISTEMA",
        message: "Informe seu ID de cliente para iniciar o atendimento.",
        message_type: "TEXT",
        created_at: new Date().toISOString(),
      },
    ];
  });
  const [error, setError] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isThreadSearchOpen, setIsThreadSearchOpen] = useState(false);
  const [threadSearch, setThreadSearch] = useState("");
  const [activeThreadMatchIndex, setActiveThreadMatchIndex] = useState(0);
  const [deferredInstallPrompt, setDeferredInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isPwaInstalled, setIsPwaInstalled] = useState(isRunningInstalledPwa);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [isEditingMessage, setIsEditingMessage] = useState(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const messageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const audioContextRef = useRef<AudioContext | null>(null);
  const hasAutoStartedRef = useRef(false);
  const socket = useSocket();
  const isAttendantOnline = Boolean(presence?.atendentes);
  const shouldShowInstallPrompt = !isPwaInstalled;

  const normalizeSearchValue = (value?: string | number | null) =>
    String(value ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const threadMatches = useMemo(() => {
    const term = normalizeSearchValue(threadSearch.trim());

    if (!term) {
      return [];
    }

    return messages.filter((message) =>
      [
        message.message,
        message.sender_type,
        message.attachments
          ?.map(
            (attachment) =>
              `${attachment.original_name ?? ""} ${attachment.filename ?? ""} ${
                attachment.mime_type ?? ""
              }`,
          )
          .join(" "),
      ].some((value) => normalizeSearchValue(value).includes(term)),
    );
  }, [messages, threadSearch]);

  const markAttendantMessagesAsRead = useCallback((nextMessages: Message[]) => {
    nextMessages
      .filter(
        (message) =>
          message.id > 0 &&
          message.sender_type === "ATENDENTE" &&
          !message.read &&
          !message.read_at,
      )
      .forEach((message) => {
        void markMessageAsRead(message.id).catch(() => undefined);
      });
  }, []);

  const loadClientMessages = useCallback(
    async (conversationId: number, code: string) => {
      const history = await getClientMessages(conversationId, code);
      const nextMessages =
        history.length > 0 ? history : [buildStartedMessage(conversationId)];

      setMessages(nextMessages);
      markAttendantMessagesAsRead(nextMessages);
    },
    [markAttendantMessagesAsRead],
  );

  const startConversation = useCallback(async (code: string) => {
    setError("");
    setIsStarting(true);

    try {
      const nextConversation = await createConversation(code);
      setConversation(nextConversation);
      await loadClientMessages(nextConversation.id, code);
      localStorage.setItem(
        CLIENT_CHAT_SESSION_KEY,
        JSON.stringify({ code, conversation: nextConversation }),
      );
    } catch (err) {
      localStorage.removeItem(CLIENT_CHAT_SESSION_KEY);
      sessionStorage.removeItem(CLIENT_CHAT_SESSION_KEY);
      setConversation(null);
      setError(err instanceof Error ? err.message : "Falha ao iniciar conversa.");
    } finally {
      setIsStarting(false);
    }
  }, [loadClientMessages]);

  const playNotificationSound = useCallback(() => {
    try {
      const browserWindow = window as WindowWithAudioContext;
      const AudioContextClass =
        browserWindow.AudioContext || browserWindow.webkitAudioContext;

      if (!AudioContextClass) {
        return;
      }

      const audioContext = audioContextRef.current ?? new AudioContextClass();
      audioContextRef.current = audioContext;

      const beep = () => {
        const now = audioContext.currentTime;
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(880, now);
        oscillator.frequency.setValueAtTime(1175, now + 0.08);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(now);
        oscillator.stop(now + 0.24);
      };

      if (audioContext.state === "suspended") {
        void audioContext.resume().then(beep);
        return;
      }

      beep();
    } catch {
      // Audio support is optional.
    }
  }, []);

  const unlockNotificationSound = useCallback(() => {
    try {
      const browserWindow = window as WindowWithAudioContext;
      const AudioContextClass =
        browserWindow.AudioContext || browserWindow.webkitAudioContext;

      if (!AudioContextClass) {
        return;
      }

      const audioContext = audioContextRef.current ?? new AudioContextClass();
      audioContextRef.current = audioContext;

      if (audioContext.state === "suspended") {
        void audioContext.resume();
      }
    } catch {
      // Audio support is optional.
    }
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredInstallPrompt(event as BeforeInstallPromptEvent);
      setShowInstallHelp(false);
    };

    const handleAppInstalled = () => {
      setDeferredInstallPrompt(null);
      setIsPwaInstalled(true);
      setShowInstallHelp(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!initialCode || conversation || hasAutoStartedRef.current) {
      return;
    }

    hasAutoStartedRef.current = true;
    const timeoutId = window.setTimeout(() => {
      void startConversation(initialCode);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [conversation, initialCode, startConversation]);

  useEffect(() => {
    if (!conversation || !codigoAcesso) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadClientMessages(conversation.id, codigoAcesso).catch(() => undefined);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [codigoAcesso, conversation, loadClientMessages]);

  useEffect(() => {
    if (!socket || !conversation) {
      return;
    }

    const joinConversation = () => {
      socket.emit("join_conversation", {
        conversation_id: conversation.id,
        participant_type: "CLIENTE",
        actor_id: conversation.cliente_id_externo,
      });
    };

    const handleMessage = (message: Message) => {
      if (message.conversation_id !== conversation.id) {
        return;
      }

      setMessages((current) => {
        const alreadyExists = current.some((item) => {
          const sameId = item.id === message.id;
          const sameOutgoingMessage =
            item.sender_type === message.sender_type &&
            item.sender_id === message.sender_id &&
            item.conversation_id === message.conversation_id &&
            item.message === message.message &&
            item.message_type === message.message_type &&
            item.sender_type === "CLIENTE";

          return sameId || sameOutgoingMessage;
        });

        return alreadyExists ? current : [...current, message];
      });

      if (message.sender_type === "ATENDENTE" && !message.read && !message.read_at) {
        playNotificationSound();
        void markMessageAsRead(message.id).catch(() => undefined);
      }
    };

    const handleMessageRead = (receipt: Message | MessageReadReceipt | number) => {
      const messageId =
        typeof receipt === "number"
          ? receipt
          : "message_id" in receipt && receipt.message_id
            ? receipt.message_id
            : receipt.id;
      const readAt =
        typeof receipt === "number" ? new Date().toISOString() : receipt.read_at;

      if (!messageId) {
        return;
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? { ...message, read: true, read_at: readAt ?? new Date().toISOString() }
            : message,
        ),
      );
    };

    const handleMessageReaction = (update: MessageReactionUpdate) => {
      setMessages((current) =>
        current.map((message) =>
          message.id === update.message_id
            ? { ...message, reactions: update.reactions }
            : message,
        ),
      );
    };

    const handleMessageUpdated = (message: Message) => {
      setMessages((current) =>
        current.map((item) => (item.id === message.id ? message : item)),
      );
    };

    const handleConversationUpdated = (payload?: { conversation_id?: number }) => {
      if (
        payload?.conversation_id &&
        Number(payload.conversation_id) !== Number(conversation.id)
      ) {
        return;
      }

      void loadClientMessages(conversation.id, codigoAcesso).catch(() => undefined);
    };

    const handleConversationPresence = (nextPresence: ConversationPresence) => {
      if (nextPresence.conversation_id !== conversation.id) {
        return;
      }

      setPresence(nextPresence);
    };

    joinConversation();
    socket.on("connect", joinConversation);
    socket.on("message_received", handleMessage);
    socket.on("message_sent", handleMessage);
    socket.on("message_read", handleMessageRead);
    socket.on("message_reaction_updated", handleMessageReaction);
    socket.on("message_updated", handleMessageUpdated);
    socket.on("conversation_updated", handleConversationUpdated);
    socket.on("conversation_presence", handleConversationPresence);

    return () => {
      socket.emit("leave_conversation", { conversation_id: conversation.id });
      socket.off("connect", joinConversation);
      socket.off("message_received", handleMessage);
      socket.off("message_sent", handleMessage);
      socket.off("message_read", handleMessageRead);
      socket.off("message_reaction_updated", handleMessageReaction);
      socket.off("message_updated", handleMessageUpdated);
      socket.off("conversation_updated", handleConversationUpdated);
      socket.off("conversation_presence", handleConversationPresence);
    };
  }, [codigoAcesso, conversation, loadClientMessages, playNotificationSound, socket]);

  useEffect(() => {
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, conversation]);

  const scrollToThreadMatch = useCallback(
    (index: number) => {
      const match = threadMatches[index];

      if (!match) {
        return;
      }

      messageRefs.current[match.id]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    },
    [threadMatches],
  );

  useEffect(() => {
    if (threadMatches.length === 0) {
      return;
    }

    scrollToThreadMatch(activeThreadMatchIndex);
  }, [activeThreadMatchIndex, scrollToThreadMatch, threadMatches.length]);

  const handleStart = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = codigoAcesso.trim();

    if (!code) {
      setError("Informe o codigo de acesso.");
      return;
    }

    await startConversation(code);
  };

  const handleInstallApp = async () => {
    if (!deferredInstallPrompt) {
      setShowInstallHelp(true);
      return;
    }

    await deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;

    setDeferredInstallPrompt(null);
    setShowInstallHelp(choice.outcome !== "accepted");

    if (choice.outcome === "accepted") {
      setIsPwaInstalled(true);
    }
  };

  const getMessageType = (attachments: Attachment[], text: string): MessageType => {
    if (attachments.length === 0) {
      return "TEXT";
    }

    if (attachments.some((attachment) => attachment.mime_type.startsWith("audio/"))) {
      return "AUDIO";
    }

    if (attachments.some((attachment) => attachment.mime_type.startsWith("image/"))) {
      return "IMAGE";
    }

    return text ? "FILE" : "FILE";
  };

  const handleSend = async (text: string, files: File[] = []) => {
    if (!conversation) {
      return;
    }

    setError("");
    setIsSending(true);

    try {
      const uploadedFiles = await Promise.all(files.map((file) => uploadFile(file)));
      const attachments: Attachment[] = uploadedFiles.map((file) => ({
        filename: file.filename,
        original_name: file.original_name,
        path: file.path,
        url: file.url,
        mime_type: file.mime_type,
        size: file.size,
      }));
      const message = await sendMessage({
        conversation_id: conversation.id,
        sender_type: "CLIENTE",
        sender_id: conversation.cliente_id_externo,
        message: text,
        message_type: getMessageType(attachments, text),
        attachments,
      });
      setMessages((current) =>
        current.some((item) => item.id === message.id) ? current : [...current, message],
      );
      setPendingFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar mensagem.");
    } finally {
      setIsSending(false);
    }
  };

  const handleReactToMessage = async (message: Message, emoji: string) => {
    if (!conversation || message.id <= 0) {
      return;
    }

    const actorId = conversation.cliente_id_externo;
    const currentReaction = message.reactions?.find(
      (reaction) =>
        reaction.actor_type === "CLIENTE" &&
        String(reaction.actor_id) === String(actorId),
    );

    try {
      const updatedMessage =
        currentReaction?.emoji === emoji
          ? await deleteMessageReaction({
              messageId: message.id,
              actor_type: "CLIENTE",
              actor_id: actorId,
            })
          : await reactToMessage({
              messageId: message.id,
              emoji,
              actor_type: "CLIENTE",
              actor_id: actorId,
            });

      setMessages((current) =>
        current.map((item) => (item.id === message.id ? updatedMessage : item)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao reagir a mensagem.");
    }
  };

  const handleEditMessage = async (message: Message) => {
    if (!conversation || message.id <= 0 || message.deleted_at) {
      return;
    }

    setEditingMessage(message);
  };

  const handleSaveEditedMessage = async (nextText: string) => {
    if (!conversation || !editingMessage) {
      return;
    }

    setIsEditingMessage(true);
    try {
      const updatedMessage = await updateMessage({
        messageId: editingMessage.id,
        message: nextText,
        actor_type: "CLIENTE",
        actor_id: conversation.cliente_id_externo,
      });

      setMessages((current) =>
        current.map((item) =>
          item.id === editingMessage.id ? updatedMessage : item,
        ),
      );
      setEditingMessage(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao editar mensagem.");
    } finally {
      setIsEditingMessage(false);
    }
  };

  const handleDeleteMessage = async (message: Message) => {
    if (!conversation || message.id <= 0 || message.deleted_at) {
      return;
    }

    if (!window.confirm("Apagar esta mensagem?")) {
      return;
    }

    try {
      const updatedMessage = await deleteMessage({
        messageId: message.id,
        actor_type: "CLIENTE",
        actor_id: conversation.cliente_id_externo,
      });

      setMessages((current) =>
        current.map((item) => (item.id === message.id ? updatedMessage : item)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao apagar mensagem.");
    }
  };

  const handleDropFiles = (files: FileList | null) => {
    setIsDraggingFiles(false);

    if (!files || files.length === 0) {
      return;
    }

    setPendingFiles((current) => [...current, ...Array.from(files)]);
  };

  const installPrompt = shouldShowInstallPrompt ? (
    <aside className={styles.installPrompt}>
      <div>
        <strong>Instale o app no celular</strong>
        <p>Acesse este atendimento mais rapido direto pela tela inicial.</p>
        {showInstallHelp ? (
          <small>
            Se a instalacao nao abrir, use o menu do navegador e toque em
            &quot;Adicionar a tela inicial&quot;.
          </small>
        ) : null}
      </div>
      <button type="button" onClick={handleInstallApp}>
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
        Instalar
      </button>
    </aside>
  ) : null;

  return (
    <main
      className={styles.page}
      onClick={unlockNotificationSound}
      onKeyDown={unlockNotificationSound}
    >
      <section className={styles.chat}>
        <header className={styles.header}>
          <span className={styles.avatar}>SS</span>
          <div>
            <h1>Atendimento</h1>
            <p
              className={
                conversation
                  ? isAttendantOnline
                    ? styles.statusOnline
                    : styles.statusRecent
                  : undefined
              }
            >
              {conversation
                ? isAttendantOnline
                  ? "ONLINE"
                  : "Visto recentemente"
                : "SuporteSync online"}
            </p>
          </div>
          {conversation ? (
            <button
              className={styles.searchButton}
              type="button"
              aria-label="Buscar na conversa"
              onClick={() => setIsThreadSearchOpen((current) => !current)}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="m21 21-4.3-4.3" />
                <circle cx="11" cy="11" r="6" />
              </svg>
            </button>
          ) : null}
        </header>

        {error ? <p className={styles.error}>{error}</p> : null}
        {conversation ? installPrompt : null}

        {conversation && isThreadSearchOpen ? (
          <div className={styles.threadSearchBar}>
            <input
              autoFocus
              placeholder="Buscar nesta conversa"
              value={threadSearch}
              onChange={(event) => {
                setThreadSearch(event.target.value);
                setActiveThreadMatchIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setIsThreadSearchOpen(false);
                  setThreadSearch("");
                }
              }}
            />
            <span>
              {threadSearch
                ? `${threadMatches.length ? activeThreadMatchIndex + 1 : 0}/${
                    threadMatches.length
                  }`
                : "0/0"}
            </span>
            <button
              type="button"
              aria-label="Resultado anterior"
              disabled={threadMatches.length === 0}
              onClick={() =>
                setActiveThreadMatchIndex((current) =>
                  (current - 1 + threadMatches.length) % threadMatches.length,
                )
              }
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="m18 15-6-6-6 6" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Proximo resultado"
              disabled={threadMatches.length === 0}
              onClick={() =>
                setActiveThreadMatchIndex((current) =>
                  (current + 1) % threadMatches.length,
                )
              }
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Fechar busca"
              onClick={() => {
                setIsThreadSearchOpen(false);
                setThreadSearch("");
              }}
            >
              X
            </button>
          </div>
        ) : null}

        <div
          className={`${styles.messages} ${
            isDraggingFiles ? styles.draggingMessages : ""
          }`}
          ref={messagesRef}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDraggingFiles(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) {
              setIsDraggingFiles(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            handleDropFiles(event.dataTransfer.files);
          }}
        >
          {isDraggingFiles ? (
            <div className={styles.dropHint}>Solte os arquivos para anexar</div>
          ) : null}
          {!conversation ? (
            <div className={styles.startPanel}>
              <span className={styles.startIcon}>?</span>
              <h2>Como podemos ajudar?</h2>
              <p>Informe seu codigo de acesso para iniciar o suporte.</p>
              {installPrompt}
              <form className={styles.startForm} onSubmit={handleStart}>
                <label>
                  <span>Codigo de acesso</span>
                  <input
                    placeholder="Codigo recebido"
                    value={codigoAcesso}
                    onChange={(event) => setCodigoAcesso(event.target.value)}
                  />
                </label>
                <button disabled={isStarting} type="submit">
                  {isStarting ? "Iniciando..." : "Iniciar conversa"}
                </button>
              </form>
            </div>
          ) : (
            messages.map((message, index) => {
              const previousMessage = messages[index - 1];
              const shouldShowDate =
                !previousMessage ||
                getDateKey(previousMessage.created_at) !==
                  getDateKey(message.created_at);

              return (
                <div
                  className={
                    threadMatches[activeThreadMatchIndex]?.id === message.id
                      ? styles.highlightedMessage
                      : ""
                  }
                  key={`${message.id}-${index}`}
                  ref={(element) => {
                    messageRefs.current[message.id] = element;
                  }}
                >
                  {shouldShowDate ? (
                    <div className={styles.dateSeparator}>
                      {formatMessageDateLabel(message.created_at)}
                    </div>
                  ) : null}
                  <MessageBubble
                    message={message}
                    isMe={message.sender_type === "CLIENTE"}
                    onReact={handleReactToMessage}
                    onEdit={handleEditMessage}
                    onDelete={handleDeleteMessage}
                  />
                </div>
              );
            })
          )}
        </div>

        {conversation ? (
          <ChatInput
            disabled={conversation.status === "FINALIZADA"}
            files={pendingFiles}
            isSending={isSending}
            onFilesChange={setPendingFiles}
            onSend={handleSend}
          />
        ) : null}
        {editingMessage ? (
          <EditMessageModal
            initialMessage={editingMessage.message ?? ""}
            isSaving={isEditingMessage}
            onClose={() => setEditingMessage(null)}
            onSave={handleSaveEditedMessage}
          />
        ) : null}
      </section>
    </main>
  );
}
