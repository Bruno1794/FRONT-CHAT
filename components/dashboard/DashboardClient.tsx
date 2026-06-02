"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChatInput } from "@/components/chat/ChatInput";
import { EditMessageModal } from "@/components/chat/EditMessageModal";
import { ShortcutSettings } from "@/components/dashboard/ShortcutSettings";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { Sidebar } from "@/components/layout/Sidebar";
import { useSocket } from "@/hooks/useSocket";
import {
  clearAuthSession,
  getAccessToken,
  getStoredUser,
} from "@/services/authStorage";
import {
  closeConversation,
  deleteMessageReaction,
  deleteMessage,
  getConversations,
  getMessages,
  markMessageAsRead,
  reactToMessage,
  reopenConversation,
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
  User,
} from "@/types";
import {
  formatLastSeen,
  formatMessageDateLabel,
  formatTime,
  getDateKey,
} from "@/utils/formatters";
import styles from "@/app/dashboard/dashboard.module.css";

type WindowWithAudioContext = Window & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

export function DashboardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "dashboard";
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isMobileThreadOpen, setIsMobileThreadOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isThreadSearchOpen, setIsThreadSearchOpen] = useState(false);
  const [threadSearch, setThreadSearch] = useState("");
  const [activeThreadMatchIndex, setActiveThreadMatchIndex] = useState(0);
  const [conversationPresence, setConversationPresence] = useState<
    Record<number, ConversationPresence>
  >({});
  const [clientLastSeen, setClientLastSeen] = useState<Record<number, string>>({});
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [isEditingMessage, setIsEditingMessage] = useState(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const messageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const audioContextRef = useRef<AudioContext | null>(null);
  const unreadCountsRef = useRef<Record<number, number>>({});
  const conversationPreviewOverridesRef = useRef<
    Record<number, { ultima_interacao: string; ultima_mensagem: string }>
  >({});
  const selectedIdRef = useRef<number | null>(null);
  const messagesRequestRef = useRef(0);
  const socket = useSocket(token ?? undefined);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) ?? null,
    [conversations, selectedId],
  );
  const selectedPresence = selectedId ? conversationPresence[selectedId] : undefined;
  const isSelectedClientOnline = Boolean(selectedPresence?.clientes);
  const selectedClientLastSeen = selectedId ? clientLastSeen[selectedId] : undefined;

  const getClienteLabel = (conversation: Conversation) =>
    conversation.cliente?.referencia ??
    conversation.cliente?.usuario_referencia ??
    conversation.cliente?.nome ??
    conversation.cliente_id_externo ??
    `Cliente ${conversation.id}`;

  const getInitials = (value?: string | null) => {
    if (!value) {
      return "CL";
    }

    return value
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  };

  const getMessagePreview = useCallback((message: Message) => {
    if (message.deleted_at) {
      return "Mensagem apagada";
    }

    if (message.message?.trim()) {
      return message.message;
    }

    const firstAttachment = message.attachments?.[0];

    if (!firstAttachment) {
      return "Sem mensagem recente";
    }

    if (firstAttachment.mime_type.startsWith("image/")) {
      return "Imagem enviada";
    }

    if (firstAttachment.mime_type.startsWith("audio/")) {
      return "Audio enviado";
    }

    return firstAttachment.original_name ?? firstAttachment.filename ?? "Arquivo enviado";
  }, []);

  const patchConversationPreviewFromMessage = useCallback(
    (message: Message) => {
      conversationPreviewOverridesRef.current[message.conversation_id] = {
        ultima_interacao: message.created_at,
        ultima_mensagem: getMessagePreview(message),
      };

      setConversations((current) =>
        current.map((conversation) => {
          if (conversation.id !== message.conversation_id) {
            return conversation;
          }

          const isKnownLatest =
            !conversation.ultima_interacao ||
            new Date(conversation.ultima_interacao).getTime() <=
              new Date(message.created_at).getTime();

          if (!isKnownLatest) {
            return conversation;
          }

          return {
            ...conversation,
            ultima_mensagem: getMessagePreview(message),
            ultima_interacao: message.created_at,
          };
        }),
      );
    },
    [getMessagePreview],
  );

  const applyConversationPreviewOverrides = useCallback(
    (items: Conversation[]) =>
      items.map((conversation) => {
        const override = conversationPreviewOverridesRef.current[conversation.id];

        if (!override) {
          return conversation;
        }

        const canApplyOverride =
          !conversation.ultima_interacao ||
          new Date(override.ultima_interacao).getTime() >=
            new Date(conversation.ultima_interacao).getTime();

        return canApplyOverride ? { ...conversation, ...override } : conversation;
      }),
    [],
  );

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

  const matchesConversationSearch = useCallback(
    (conversation: Conversation) => {
      const term = normalizeSearchValue(search.trim());

      if (!term) {
        return true;
      }

      return [
        conversation.id,
        conversation.cliente_id_externo,
        conversation.status,
        conversation.ultima_mensagem,
        conversation.cliente?.id,
        conversation.cliente?.nome,
        conversation.cliente?.referencia,
        conversation.cliente?.usuario_referencia,
        conversation.cliente?.telefone,
        conversation.cliente?.email,
        conversation.cliente?.cidade,
        getClienteLabel(conversation),
      ].some((value) => normalizeSearchValue(value).includes(term));
    },
    [search],
  );

  const loadConversations = useCallback(
    async (accessToken: string, nextSelectedId?: number | null) => {
      const data = await getConversations(accessToken);
      const filteredData = applyConversationPreviewOverrides(
        data.filter(matchesConversationSearch),
      );
      unreadCountsRef.current = Object.fromEntries(
        filteredData.map((conversation) => [
          conversation.id,
          conversation.unread_count,
        ]),
      );
      setConversations(filteredData);

      if (nextSelectedId !== undefined) {
        setSelectedId(nextSelectedId);
        return;
      }

      setSelectedId((current) => current ?? filteredData[0]?.id ?? null);
    },
    [applyConversationPreviewOverrides, matchesConversationSearch],
  );

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const markConversationAsRead = useCallback(
    async (accessToken: string, conversationId: number, conversationMessages: Message[]) => {
      const unreadMessages = conversationMessages.filter(
        (message) =>
          message.sender_type !== "ATENDENTE" && !message.read && !message.read_at,
      );

      if (unreadMessages.length === 0) {
        return;
      }

      const readAt = new Date().toISOString();

      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, unread_count: 0 }
            : conversation,
        ),
      );
      setMessages((current) =>
        current.map((message) =>
          unreadMessages.some((unreadMessage) => unreadMessage.id === message.id)
            ? { ...message, read: true, read_at: readAt }
            : message,
        ),
      );

      await Promise.allSettled(
        unreadMessages.map((message) => markMessageAsRead(message.id, accessToken)),
      );

      const data = await getConversations(accessToken);
      const filteredData = applyConversationPreviewOverrides(
        data.filter(matchesConversationSearch),
      );
      unreadCountsRef.current = Object.fromEntries(
        filteredData.map((conversation) => [
          conversation.id,
          conversation.unread_count,
        ]),
      );
      setConversations(filteredData);
    },
    [applyConversationPreviewOverrides, matchesConversationSearch],
  );

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
      // Audio notification is optional.
    }
  }, []);

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

      if (audioContext.state === "suspended") {
        void audioContext.resume();
      }

      const beep = () => {
        const now = audioContext.currentTime;
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(880, now);
        oscillator.frequency.setValueAtTime(1175, now + 0.08);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
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
      // Browsers can block audio until user interaction.
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      const storedToken = getAccessToken();

      if (!storedToken) {
        router.replace("/login");
        return;
      }

      setToken(storedToken);
      setUser(getStoredUser());

      loadConversations(storedToken)
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Falha ao carregar conversas.");
          if (err instanceof Error && /401|403|Unauthorized/i.test(err.message)) {
            clearAuthSession();
            router.replace("/login");
          }
        })
        .finally(() => setIsLoading(false));
    });
  }, [loadConversations, router]);

  useEffect(() => {
    if (!token || selectedId === null) {
      return;
    }

    const requestId = messagesRequestRef.current + 1;
    messagesRequestRef.current = requestId;
    const conversationId = selectedId;

    getMessages(token, selectedId)
      .then((data) => {
        if (
          messagesRequestRef.current !== requestId ||
          selectedIdRef.current !== conversationId
        ) {
          return undefined;
        }

        setMessages(data);
        return markConversationAsRead(token, conversationId, data);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Falha ao carregar mensagens."),
      );
  }, [markConversationAsRead, selectedId, token]);

  useEffect(() => {
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, selectedId]);

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

  useEffect(() => {
    if (!socket || !token) {
      return;
    }

    const joinSelectedConversation = () => {
      if (selectedId !== null) {
        socket.emit("join_conversation", {
          conversation_id: selectedId,
          participant_type: "ATENDENTE",
          actor_id: user?.id,
        });
      }
    };

    const pingSelectedConversationPresence = () => {
      if (selectedId !== null) {
        socket.emit("conversation_presence_ping", {
          conversation_id: selectedId,
          participant_type: "ATENDENTE",
          actor_id: user?.id,
        });
      }
    };

    const reload = () => {
      getConversations(token)
        .then((data) => {
          const filteredData = applyConversationPreviewOverrides(
            data.filter(matchesConversationSearch),
          );
          const shouldNotify = data.some((conversation) => {
            const previousCount = unreadCountsRef.current[conversation.id] ?? 0;

            return (
              conversation.id !== selectedId &&
              conversation.unread_count > previousCount
            );
          });

          unreadCountsRef.current = Object.fromEntries(
            filteredData.map((conversation) => [
              conversation.id,
              conversation.unread_count,
            ]),
          );
          setConversations(filteredData);

          if (shouldNotify) {
            playNotificationSound();
          }
        })
        .catch(() => undefined);

      if (selectedId !== null) {
        getMessages(token, selectedId).then(setMessages).catch(() => undefined);
      }
    };

    const handleMessage = (message: Message) => {
      const isCurrentConversation = message.conversation_id === selectedId;

      if (isCurrentConversation) {
        setMessages((current) =>
          current.some((item) => item.id === message.id)
            ? current
            : [...current, message],
        );
        void markConversationAsRead(token, selectedId, [message]);
      }
      patchConversationPreviewFromMessage(message);
      reload();
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
      patchConversationPreviewFromMessage(message);
    };

    const handleConversationPresence = (presence: ConversationPresence) => {
      setConversationPresence((current) => ({
        ...current,
        [presence.conversation_id]: presence,
      }));

      if (presence.clientes === 0) {
        setClientLastSeen((current) => ({
          ...current,
          [presence.conversation_id]: presence.updated_at,
        }));
      }
    };

    joinSelectedConversation();
    const presenceIntervalId = window.setInterval(
      pingSelectedConversationPresence,
      20000,
    );
    socket.on("connect", joinSelectedConversation);
    socket.on("message_received", handleMessage);
    socket.on("message_sent", handleMessage);
    socket.on("message_read", handleMessageRead);
    socket.on("message_reaction_updated", handleMessageReaction);
    socket.on("message_updated", handleMessageUpdated);
    socket.on("conversation_updated", reload);
    socket.on("conversation_presence", handleConversationPresence);

    return () => {
      window.clearInterval(presenceIntervalId);
      if (selectedId !== null) {
        socket.emit("leave_conversation", { conversation_id: selectedId });
      }
      socket.off("connect", joinSelectedConversation);
      socket.off("message_received", handleMessage);
      socket.off("message_sent", handleMessage);
      socket.off("message_read", handleMessageRead);
      socket.off("message_reaction_updated", handleMessageReaction);
      socket.off("message_updated", handleMessageUpdated);
      socket.off("conversation_updated", reload);
      socket.off("conversation_presence", handleConversationPresence);
    };
  }, [
    applyConversationPreviewOverrides,
    loadConversations,
    markConversationAsRead,
    matchesConversationSearch,
    patchConversationPreviewFromMessage,
    playNotificationSound,
    selectedId,
    socket,
    token,
    user?.id,
  ]);

  const handleSearch = async () => {
    if (!token) {
      return;
    }

    setError("");
    setIsLoading(true);
    try {
      await loadConversations(token, null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao pesquisar.");
    } finally {
      setIsLoading(false);
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
    if (!token || !selectedConversation || !user) {
      return;
    }

    setIsSending(true);
    setError("");

    try {
      const uploadedFiles = await Promise.all(
        files.map((file) => uploadFile(file, token)),
      );
      const attachments: Attachment[] = uploadedFiles.map((file) => ({
        filename: file.filename,
        original_name: file.original_name,
        path: file.path,
        url: file.url,
        mime_type: file.mime_type,
        size: file.size,
      }));
      const message = await sendMessage({
        conversation_id: selectedConversation.id,
        sender_type: "ATENDENTE",
        sender_id: user.id,
        message: text,
        message_type: getMessageType(attachments, text),
        attachments,
        token,
      });
      setMessages((current) => [...current, message]);
      setPendingFiles([]);
      await loadConversations(token, selectedConversation.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar mensagem.");
    } finally {
      setIsSending(false);
    }
  };

  const handleReactToMessage = async (message: Message, emoji: string) => {
    if (!token || !user || message.id <= 0) {
      return;
    }

    const currentReaction = message.reactions?.find(
      (reaction) =>
        reaction.actor_type === "ATENDENTE" &&
        String(reaction.actor_id) === String(user.id),
    );

    try {
      const updatedMessage =
        currentReaction?.emoji === emoji
          ? await deleteMessageReaction({
              messageId: message.id,
              token,
            })
          : await reactToMessage({
              messageId: message.id,
              emoji,
              token,
            });

      setMessages((current) =>
        current.map((item) => (item.id === message.id ? updatedMessage : item)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao reagir a mensagem.");
    }
  };

  const handleEditMessage = async (message: Message) => {
    if (!token || !user || message.id <= 0 || message.deleted_at) {
      return;
    }

    setEditingMessage(message);
  };

  const handleSaveEditedMessage = async (nextText: string) => {
    if (!token || !user || !editingMessage) {
      return;
    }

    setIsEditingMessage(true);
    try {
      const updatedMessage = await updateMessage({
        messageId: editingMessage.id,
        message: nextText,
        token,
      });

      setMessages((current) =>
        current.map((item) =>
          item.id === editingMessage.id ? updatedMessage : item,
        ),
      );
      patchConversationPreviewFromMessage(updatedMessage);
      setEditingMessage(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao editar mensagem.");
    } finally {
      setIsEditingMessage(false);
    }
  };

  const handleDeleteMessage = async (message: Message) => {
    if (!token || !user || message.id <= 0 || message.deleted_at) {
      return;
    }

    if (!window.confirm("Apagar esta mensagem?")) {
      return;
    }

    try {
      const updatedMessage = await deleteMessage({
        messageId: message.id,
        token,
      });

      setMessages((current) =>
        current.map((item) => (item.id === message.id ? updatedMessage : item)),
      );
      patchConversationPreviewFromMessage(updatedMessage);
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

  const handleSelectConversation = (conversation: Conversation) => {
    setSelectedId(conversation.id);
    setIsMobileThreadOpen(true);
    setThreadSearch("");
    setIsThreadSearchOpen(false);
    setActiveThreadMatchIndex(0);
    setConversations((current) =>
      current.map((item) =>
        item.id === conversation.id ? { ...item, unread_count: 0 } : item,
      ),
    );
  };

  const handleToggleStatus = async () => {
    if (!token || !selectedConversation) {
      return;
    }

    setError("");

    try {
      if (selectedConversation.status === "FINALIZADA") {
        await reopenConversation(token, selectedConversation.id);
      } else {
        await closeConversation(token, selectedConversation.id);
      }
      await loadConversations(token, selectedConversation.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar conversa.");
    }
  };

  const handleLogout = () => {
    clearAuthSession();
    router.replace("/login");
  };

  const customerInfo = selectedConversation ? (
    <>
      <div className={styles.profile}>
        <span className={styles.profileAvatar}>
          {getInitials(getClienteLabel(selectedConversation))}
        </span>
        <h2>{getClienteLabel(selectedConversation)}</h2>
        <p>{selectedConversation.cliente?.nome ?? "Cliente"}</p>
        <strong>{selectedConversation.status}</strong>
        <div className={styles.profileActions}>
          <button type="button">Perfil</button>
          <button type="button">Bloquear</button>
        </div>
      </div>

      <section className={styles.panelSection}>
        <h3>Dados do cliente</h3>
        <p>{selectedConversation.cliente?.nome ?? "Nome nao informado"}</p>
        <p>{selectedConversation.cliente?.telefone ?? "Telefone nao informado"}</p>
        <p>{selectedConversation.cliente?.email ?? "Email nao informado"}</p>
        <p>{selectedConversation.cliente?.cidade ?? "Cidade nao informada"}</p>
      </section>

      <section className={styles.panelSection}>
        <div className={styles.sectionTitle}>
          <h3>Historico</h3>
          <button type="button">Ver tudo</button>
        </div>
        <article className={styles.historyItem}>
          <span>Atual</span>
          <strong>#{selectedConversation.id} {selectedConversation.status}</strong>
        </article>
      </section>

      <section className={styles.noteBox}>
        <h3>Notas internas</h3>
        <p>Adicione observacoes privadas para o proximo atendimento.</p>
      </section>
    </>
  ) : (
    <p className={styles.state}>Selecione uma conversa.</p>
  );

  return (
    <main className={styles.shell}>
      <Sidebar hideMobileMenuButton={activeTab === "chats" && isMobileThreadOpen} />
      <section
        className={styles.workspace}
        onClick={unlockNotificationSound}
        onKeyDown={unlockNotificationSound}
      >
        {activeTab === "dashboard" ? (
          <div className={styles.placeholderView}>
            <span>Dashboard</span>
            <h1>Visao geral do atendimento</h1>
            <p>
              Area reservada para indicadores, relatorios e atalhos do painel
              administrativo.
            </p>
            <div className={styles.placeholderGrid}>
              <article>
                <strong>{conversations.length}</strong>
                <small>Conversas carregadas</small>
              </article>
              <article>
                <strong>
                  {conversations.reduce(
                    (total, conversation) => total + (conversation.unread_count ?? 0),
                    0,
                  )}
                </strong>
                <small>Mensagens pendentes</small>
              </article>
              <article>
                <strong>{user?.nome ?? "Atendente"}</strong>
                <small>Usuario conectado</small>
              </article>
            </div>
          </div>
        ) : null}

        {activeTab === "settings" ? (
          <ShortcutSettings token={token} user={user} />
        ) : null}

        {activeTab === "chats" ? (
          <div
            className={`${styles.content} ${
              isMobileThreadOpen ? styles.mobileThreadOpen : ""
            }`}
          >
          <aside className={styles.conversationList}>
            <div className={styles.listHeader}>
              <div>
                <h2>Conversas</h2>
                <span>{conversations.length} atendimentos</span>
              </div>
              <button type="button" onClick={handleLogout}>
                Sair
              </button>
            </div>
            <div className={styles.search}>
              <input
                placeholder="Buscar cliente ou conversa"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void handleSearch();
                  }
                }}
              />
              <button type="button" onClick={handleSearch}>
                Buscar
              </button>
            </div>
            <div className={styles.filters}>
              <span>Aberta</span>
              <span>Aguardando</span>
              <span>Finalizada</span>
            </div>
            {isLoading ? <p className={styles.state}>Carregando...</p> : null}
            {!isLoading && conversations.length === 0 ? (
              <p className={styles.state}>Nenhuma conversa encontrada.</p>
            ) : null}
            {conversations.map((conversation) => (
              <button
                className={`${styles.conversation} ${
                  conversation.id === selectedId ? styles.activeConversation : ""
                }`}
                key={conversation.id}
                type="button"
                onClick={() => handleSelectConversation(conversation)}
              >
                <span className={styles.avatar}>{getInitials(getClienteLabel(conversation))}</span>
                <div>
                  <span className={styles.conversationTopline}>
                    <strong>{getClienteLabel(conversation)}</strong>
                    <span>{conversation.ultima_interacao ? formatTime(conversation.ultima_interacao) : ""}</span>
                  </span>
                  <small>{conversation.ultima_mensagem ?? "Sem mensagem recente"}</small>
                </div>
                {conversation.unread_count ? (
                  <span className={styles.badge}>{conversation.unread_count}</span>
                ) : null}
              </button>
            ))}
          </aside>

          <section className={styles.thread}>
            <div className={styles.threadHeader}>
              <button
                className={styles.mobileBack}
                type="button"
                aria-label="Voltar para conversas"
                onClick={() => {
                  setIsMobileThreadOpen(false);
                  setIsCustomerModalOpen(false);
                }}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M15.5 5 8.5 12l7 7" />
                </svg>
              </button>
              <div className={styles.threadIdentity}>
                <span className={styles.avatar}>
                  {selectedConversation ? getInitials(getClienteLabel(selectedConversation)) : "CL"}
                </span>
                <div>
                <h2>
                  {selectedConversation
                    ? getClienteLabel(selectedConversation)
                    : "Selecione uma conversa"}
                </h2>
                {selectedConversation ? (
                  <div className={styles.threadMeta}>
                    <span>Conversa #{selectedConversation.id}</span>
                    <span>{selectedConversation.status}</span>
                    <span
                      className={
                        isSelectedClientOnline
                          ? styles.presenceOnline
                          : styles.presenceOffline
                      }
                    >
                      {isSelectedClientOnline
                        ? "Cliente online"
                        : formatLastSeen(selectedClientLastSeen)}
                    </span>
                    {selectedConversation.cliente?.cidade ? (
                      <span>{selectedConversation.cliente.cidade}</span>
                    ) : null}
                  </div>
                    ) : null}
                  </div>
                </div>
              <button
                disabled={!selectedConversation}
                type="button"
                onClick={handleToggleStatus}
              >
                {selectedConversation?.status === "FINALIZADA"
                  ? "Reabrir"
                : "Finalizar"}
              </button>
              <div className={styles.threadActions} aria-label="Acoes do atendimento">
                <button
                  type="button"
                  aria-label="Buscar na conversa"
                  onClick={() => setIsThreadSearchOpen((current) => !current)}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="m21 21-4.3-4.3" />
                    <circle cx="11" cy="11" r="6" />
                  </svg>
                </button>
                <button type="button" aria-label="Anexar arquivo">
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M21 12.5 12.7 20.8a6 6 0 0 1-8.5-8.5l8.8-8.8a4 4 0 0 1 5.7 5.7l-8.8 8.8a2 2 0 0 1-2.8-2.8l8.2-8.2" />
                  </svg>
                </button>
                <button
                  className={styles.infoAction}
                  type="button"
                  aria-label="Ver informacoes do cliente"
                  onClick={() => setIsCustomerModalOpen(true)}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 10v6" />
                    <path d="M12 7h.01" />
                  </svg>
                </button>
              </div>
            </div>
            {error ? <p className={styles.error}>{error}</p> : null}
            {isThreadSearchOpen ? (
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
                  ↑
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
                  ↓
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
              {messages.map((message, index) => {
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
                    key={message.id}
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
                      isMe={message.sender_type === "ATENDENTE"}
                      onReact={handleReactToMessage}
                      onEdit={handleEditMessage}
                      onDelete={handleDeleteMessage}
                    />
                  </div>
                );
              })}
              {selectedConversation && messages.length === 0 ? (
                <p className={styles.state}>Sem mensagens nesta conversa.</p>
              ) : null}
            </div>
            <ChatInput
              disabled={!selectedConversation || selectedConversation.status === "FINALIZADA"}
              files={pendingFiles}
              isSending={isSending}
              shortcutToken={token ?? undefined}
              onCreateShortcutRequest={() =>
                router.push("/dashboard?tab=settings&shortcut=new")
              }
              onFilesChange={setPendingFiles}
              onSend={handleSend}
            />
          </section>

          <aside className={styles.customerPanel}>
            {customerInfo}
          </aside>
          {isCustomerModalOpen ? (
            <div
              className={styles.customerModalOverlay}
              role="presentation"
              onMouseDown={() => setIsCustomerModalOpen(false)}
            >
              <aside
                className={styles.customerModal}
                role="dialog"
                aria-modal="true"
                aria-label="Dados do cliente"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <header className={styles.customerModalHeader}>
                  <div>
                    <span>Cliente</span>
                    <h2>Informacoes do atendimento</h2>
                  </div>
                  <button
                    type="button"
                    aria-label="Fechar informacoes"
                    onClick={() => setIsCustomerModalOpen(false)}
                  >
                    X
                  </button>
                </header>
                {customerInfo}
              </aside>
            </div>
          ) : null}
          {editingMessage ? (
            <EditMessageModal
              initialMessage={editingMessage.message ?? ""}
              isSaving={isEditingMessage}
              onClose={() => setEditingMessage(null)}
              onSave={handleSaveEditedMessage}
            />
          ) : null}
        </div>
        ) : null}
      </section>
    </main>
  );
}
