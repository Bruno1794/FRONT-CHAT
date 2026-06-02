"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChatInput } from "@/components/chat/ChatInput";
import { EditMessageModal } from "@/components/chat/EditMessageModal";
import { ShortcutSettings } from "@/components/dashboard/ShortcutSettings";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { Sidebar } from "@/components/layout/Sidebar";
import { useSocket } from "@/hooks/useSocket";
import { useVisualViewportHeight } from "@/hooks/useVisualViewportHeight";
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
  getPushConfig,
  markMessageAsRead,
  reactToMessage,
  reopenConversation,
  sendBroadcastNotice,
  sendMessage,
  subscribeAdminToPushAlert,
  subscribeAdminToPush,
  testAdminPush,
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

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

type PushState = "idle" | "unsupported" | "blocked" | "ready" | "subscribing" | "active" | "error";

const ADMIN_PUSH_ENABLED_KEY = "suportesync.adminPushEnabled";
const ADMIN_PUSHALERT_ENABLED_KEY = "suportesync.adminPushAlertEnabled";
const PUSHALERT_SCRIPT_URL = process.env.NEXT_PUBLIC_PUSHALERT_SCRIPT_URL ?? "";

type PushAlertQueueItem = [string, (...args: unknown[]) => void];

type PushAlertSuccessResult = {
  subscriber_id?: string;
  alreadySubscribed?: boolean;
};

type PushAlertFailureResult = {
  status?: number;
};

type PushAlertInfo = {
  status?: number;
  subs_id?: string;
};

type PushAlertApi = {
  subs_id?: string;
  forceSubscribe?: () => void;
  getSubsInfo?: () => PushAlertInfo;
};

declare global {
  interface Window {
    pushalertbyiw?: PushAlertQueueItem[];
    PushAlertCo?: PushAlertApi;
  }
}

function isRunningInstalledPwa() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia("(display-mode: standalone)").matches;
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }

  return output;
}

async function getServiceWorkerRegistration() {
  const existingRegistration = await navigator.serviceWorker.getRegistration();

  if (existingRegistration) {
    await existingRegistration.update().catch(() => undefined);
    return existingRegistration;
  }

  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

async function subscribeBrowserToPush(
  registration: ServiceWorkerRegistration,
  publicKey: string,
  forceNew = false,
) {
  const applicationServerKey = urlBase64ToUint8Array(publicKey);
  const existingSubscription = await registration.pushManager.getSubscription();

  if (existingSubscription && !forceNew) {
    return existingSubscription;
  }

  if (existingSubscription) {
    await existingSubscription.unsubscribe().catch(() => undefined);
  }

  return registration.pushManager.subscribe({
    applicationServerKey,
    userVisibleOnly: true,
  });
}

async function loadPushAlertScript() {
  if (!PUSHALERT_SCRIPT_URL || window.PushAlertCo) {
    return;
  }

  const existingScript = document.querySelector<HTMLScriptElement>(
    `script[src="${PUSHALERT_SCRIPT_URL}"]`,
  );

  if (existingScript) {
    if (window.PushAlertCo) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Falha ao carregar PushAlert.")),
        { once: true },
      );
      window.setTimeout(() => resolve(), 3000);
    });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");

    script.async = true;
    script.src = PUSHALERT_SCRIPT_URL;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Falha ao carregar PushAlert."));
    document.head.appendChild(script);
  });
}

async function waitForPushAlertReady() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (window.PushAlertCo) {
      return;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 200));
  }

  throw new Error("PushAlert nao ficou pronto.");
}

function getPushAlertSubscriberId() {
  const api = window.PushAlertCo;
  const info = api?.getSubsInfo?.();

  return api?.subs_id || info?.subs_id || null;
}

async function registerAdminPushAlertSubscription(token: string) {
  if (!PUSHALERT_SCRIPT_URL) {
    return false;
  }

  await loadPushAlertScript();
  await waitForPushAlertReady();

  const currentSubscriberId = getPushAlertSubscriberId();

  if (currentSubscriberId) {
    await subscribeAdminToPushAlert(token, { subscriber_id: currentSubscriberId });
    return true;
  }

  const subscriberId = await new Promise<string>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error("PushAlert nao abriu a permissao no celular."));
    }, 15000);

    window.pushalertbyiw = window.pushalertbyiw || [];
    window.pushalertbyiw.push([
      "onSuccess",
      (result: unknown) => {
        window.clearTimeout(timeoutId);
        const successResult = result as PushAlertSuccessResult;
        const nextSubscriberId =
          successResult.subscriber_id || getPushAlertSubscriberId();

        if (nextSubscriberId) {
          resolve(nextSubscriberId);
          return;
        }

        reject(new Error("PushAlert nao retornou o subscriber_id."));
      },
    ]);
    window.pushalertbyiw.push([
      "onFailure",
      (result: unknown) => {
        window.clearTimeout(timeoutId);
        const failureResult = result as PushAlertFailureResult;
        reject(new Error(`PushAlert falhou${failureResult.status ? ` (${failureResult.status})` : ""}.`));
      },
    ]);

    if (!window.PushAlertCo?.forceSubscribe) {
      window.clearTimeout(timeoutId);
      reject(new Error("PushAlert nao disponibilizou a permissao."));
      return;
    }

    window.PushAlertCo?.forceSubscribe?.();
  });

  await subscribeAdminToPushAlert(token, { subscriber_id: subscriberId });
  return true;
}

async function registerAdminPushSubscription(token: string) {
  let registered = false;
  const errors: string[] = [];

  if ("Notification" in window && "serviceWorker" in navigator && "PushManager" in window) {
    try {
      const config = await getPushConfig();

      if (!config.enabled || !config.publicKey) {
        throw new Error("Push nao esta configurado na API.");
      }

      const registration = await getServiceWorkerRegistration();
      const subscription = await subscribeBrowserToPush(
        registration,
        config.publicKey,
        true,
      );

      await subscribeAdminToPush(token, { subscription: subscription.toJSON() });
      registered = true;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "WebPush falhou.");
    }
  }

  try {
    const pushAlertRegistered = await registerAdminPushAlertSubscription(token);
    registered = pushAlertRegistered || registered;

    if (pushAlertRegistered) {
      localStorage.setItem(ADMIN_PUSHALERT_ENABLED_KEY, "true");
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "PushAlert falhou.");
  }

  if (!registered) {
    throw new Error(errors.join(" "));
  }
}

export function DashboardClient() {
  useVisualViewportHeight();

  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTabParam = searchParams.get("tab");
  const hasExplicitTab = searchParams.has("tab");
  const activeTab = activeTabParam ?? "dashboard";
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
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState("Aviso do suporte");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastFeedback, setBroadcastFeedback] = useState("");
  const [isBroadcastSending, setIsBroadcastSending] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isPwaInstalled, setIsPwaInstalled] = useState(isRunningInstalledPwa);
  const [pushState, setPushState] = useState<PushState>(() =>
    typeof window !== "undefined" &&
    localStorage.getItem(ADMIN_PUSH_ENABLED_KEY) === "true"
      ? "active"
      : "idle",
  );
  const [pushError, setPushError] = useState("");
  const [pushFeedback, setPushFeedback] = useState("");
  const [isPushAlertKnownActive, setIsPushAlertKnownActive] = useState(
    () =>
      typeof window !== "undefined" &&
      localStorage.getItem(ADMIN_PUSHALERT_ENABLED_KEY) === "true",
  );
  const [isThreadSearchOpen, setIsThreadSearchOpen] = useState(false);
  const [threadSearch, setThreadSearch] = useState("");
  const [activeThreadMatchIndex, setActiveThreadMatchIndex] = useState(0);
  const [isAtMessageEnd, setIsAtMessageEnd] = useState(true);
  const [conversationPresence, setConversationPresence] = useState<
    Record<number, ConversationPresence>
  >({});
  const [clientLastSeen, setClientLastSeen] = useState<Record<number, string>>({});
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [isEditingMessage, setIsEditingMessage] = useState(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const messageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const audioContextRef = useRef<AudioContext | null>(null);
  const latestMessagesRef = useRef<Message[]>(messages);
  const unreadCountsRef = useRef<Record<number, number>>({});
  const conversationPreviewOverridesRef = useRef<
    Record<number, { ultima_interacao: string; ultima_mensagem: string }>
  >({});
  const selectedIdRef = useRef<number | null>(null);
  const messagesRequestRef = useRef(0);
  const mobileThreadHistoryRef = useRef(false);
  const socket = useSocket(token ?? undefined);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) ?? null,
    [conversations, selectedId],
  );
  const selectedPresence = selectedId ? conversationPresence[selectedId] : undefined;
  const isSelectedClientOnline = Boolean(selectedPresence?.clientes);
  const selectedClientLastSeen = selectedId ? clientLastSeen[selectedId] : undefined;
  const shouldShowInstallPrompt = Boolean(deferredInstallPrompt) && !isPwaInstalled;
  const adminPushStatusText =
    pushState === "active"
      ? "WebPush ativo neste navegador."
      : isPushAlertKnownActive
        ? "PushAlert ativo para este usuario."
        : "Use somente se trocar de celular ou limpar os dados do navegador.";

  const isActiveThreadVisible = useCallback(() => {
    if (activeTab !== "chats") {
      return false;
    }

    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return false;
    }

    if (typeof window === "undefined") {
      return true;
    }

    return window.matchMedia("(min-width: 821px)").matches || isMobileThreadOpen;
  }, [activeTab, isMobileThreadOpen]);

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

  useEffect(() => {
    latestMessagesRef.current = messages;
  }, [messages]);

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
    if (hasExplicitTab) {
      return;
    }

    const openChatsOnMobile = () => {
      if (window.matchMedia("(max-width: 820px)").matches) {
        router.replace("/dashboard?tab=chats");
      }
    };

    openChatsOnMobile();
    window.addEventListener("resize", openChatsOnMobile);

    return () => window.removeEventListener("resize", openChatsOnMobile);
  }, [hasExplicitTab, router]);

  useEffect(() => {
    const handlePopState = () => {
      if (!isMobileThreadOpen) {
        return;
      }

      mobileThreadHistoryRef.current = false;
      setIsMobileThreadOpen(false);
      setIsCustomerModalOpen(false);
    };

    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
  }, [isMobileThreadOpen]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsPwaInstalled(true);
      setDeferredInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!token || pushState !== "idle") {
      return;
    }

    queueMicrotask(() => {
      const supportsWebPush =
        "Notification" in window &&
        "serviceWorker" in navigator &&
        "PushManager" in window;

      if (!supportsWebPush && !PUSHALERT_SCRIPT_URL) {
        setPushState("unsupported");
        return;
      }

      if ("Notification" in window && Notification.permission === "denied") {
        setPushState("blocked");
        return;
      }

      if ("Notification" in window && Notification.permission === "granted") {
        setPushState("ready");
        return;
      }

      setPushState("ready");
    });
  }, [pushState, token]);

  useEffect(() => {
    if (
      !token ||
      !["active", "ready"].includes(pushState) ||
      typeof Notification === "undefined" ||
      Notification.permission !== "granted"
    ) {
      return;
    }

    queueMicrotask(() => {
      if (pushState === "ready") {
        setPushState("subscribing");
      }

      void registerAdminPushSubscription(token)
        .then(() => {
          localStorage.setItem(ADMIN_PUSH_ENABLED_KEY, "true");
          setPushState("active");
        })
        .catch(() => {
          localStorage.removeItem(ADMIN_PUSH_ENABLED_KEY);
          setPushState("ready");
        });
    });
  }, [pushState, token]);

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

  const handleInstallPwa = async () => {
    if (!deferredInstallPrompt) {
      return;
    }

    await deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice.catch(() => null);

    if (choice?.outcome === "accepted") {
      setIsPwaInstalled(true);
    }

    setDeferredInstallPrompt(null);
  };

  const handleEnableAdminPush = async () => {
    if (!token) {
      return;
    }

    const supportsWebPush =
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window;

    if (!supportsWebPush && !PUSHALERT_SCRIPT_URL) {
      setPushState("unsupported");
      setPushError("Este navegador nao suporta notificacoes push.");
      return;
    }

    if ("Notification" in window && Notification.permission === "denied") {
      setPushState("blocked");
      setPushError("As notificacoes estao bloqueadas neste navegador.");
      return;
    }

    setPushState("subscribing");
    setPushError("");
    setPushFeedback("");

    try {
      const permission =
        "Notification" in window && Notification.permission === "granted"
          ? "granted"
          : "Notification" in window
            ? await Notification.requestPermission()
            : "granted";

      if (permission !== "granted") {
        setPushState("ready");
        setPushError("Permissao de notificacao nao foi concedida.");
        return;
      }

      await registerAdminPushSubscription(token);
      localStorage.setItem(ADMIN_PUSH_ENABLED_KEY, "true");
      if (PUSHALERT_SCRIPT_URL) {
        setIsPushAlertKnownActive(
          localStorage.getItem(ADMIN_PUSHALERT_ENABLED_KEY) === "true",
        );
      }
      setPushState("active");
    } catch (err) {
      setPushState("error");
      setPushError(
        err instanceof Error ? err.message : "Nao foi possivel ativar notificacoes.",
      );
    }
  };

  const handleEnableAdminPushAlert = async () => {
    if (!token) {
      return;
    }

    setPushState("subscribing");
    setPushError("");
    setPushFeedback("");

    try {
      const pushAlertRegistered = await registerAdminPushAlertSubscription(token);

      if (!pushAlertRegistered) {
        throw new Error("PushAlert nao esta configurado.");
      }

      localStorage.setItem(ADMIN_PUSHALERT_ENABLED_KEY, "true");
      setIsPushAlertKnownActive(true);
      setPushState("active");
    } catch (err) {
      localStorage.removeItem(ADMIN_PUSHALERT_ENABLED_KEY);
      setIsPushAlertKnownActive(false);
      setPushState("ready");
      setPushError(
        err instanceof Error ? err.message : "Nao foi possivel ativar PushAlert.",
      );
    }
  };

  const handleTestAdminPush = async () => {
    if (!token) {
      return;
    }

    setPushError("");
    setPushFeedback("Enviando teste...");

    try {
      const result = await testAdminPush(token);

      setPushFeedback(
        `Teste enviado. WebPush: ${result.webpush_subscriptions}. PushAlert: ${result.pushalert_subscriptions}.`,
      );
    } catch (err) {
      setPushFeedback("");
      setPushError(
        err instanceof Error ? err.message : "Nao foi possivel testar notificacoes.",
      );
    }
  };

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
        if (isActiveThreadVisible()) {
          return markConversationAsRead(token, conversationId, data);
        }

        return undefined;
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Falha ao carregar mensagens."),
      );
  }, [isActiveThreadVisible, markConversationAsRead, selectedId, token]);

  const updateMessageScrollState = useCallback(() => {
    const element = messagesRef.current;

    if (!element) {
      setIsAtMessageEnd(true);
      return;
    }

    const distanceFromEnd = element.scrollHeight - element.scrollTop - element.clientHeight;
    setIsAtMessageEnd(distanceFromEnd < 32);
  }, []);

  const scrollMessagesToEnd = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const element = messagesRef.current;

      if (!element) {
        return;
      }

      element.scrollTo({
        top: element.scrollHeight,
        behavior,
      });
      window.setTimeout(updateMessageScrollState, 80);
    },
    [updateMessageScrollState],
  );

  useEffect(() => {
    const animationFrameId = window.requestAnimationFrame(() => {
      scrollMessagesToEnd("auto");
      window.requestAnimationFrame(() => scrollMessagesToEnd("auto"));
    });
    const timeoutId = window.setTimeout(() => scrollMessagesToEnd("auto"), 220);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.clearTimeout(timeoutId);
    };
  }, [messages, selectedId, scrollMessagesToEnd]);

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
      if (selectedId !== null && isActiveThreadVisible()) {
        socket.emit("join_conversation", {
          conversation_id: selectedId,
          participant_type: "ATENDENTE",
          actor_id: user?.id,
        });
      }
    };

    const leaveSelectedConversation = () => {
      if (selectedId !== null) {
        socket.emit("leave_conversation", { conversation_id: selectedId });
      }
    };

    const pingSelectedConversationPresence = () => {
      if (selectedId !== null && isActiveThreadVisible()) {
        socket.emit("conversation_presence_ping", {
          conversation_id: selectedId,
          participant_type: "ATENDENTE",
          actor_id: user?.id,
        });
      }
    };

    const syncSelectedConversationPresence = () => {
      if (!isActiveThreadVisible()) {
        leaveSelectedConversation();
        return;
      }

      joinSelectedConversation();

      if (selectedId !== null) {
        void markConversationAsRead(
          token,
          selectedId,
          latestMessagesRef.current,
        ).catch(() => undefined);
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
        if (isActiveThreadVisible()) {
          void markConversationAsRead(token, selectedId, [message]);
        }
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

    syncSelectedConversationPresence();
    const presenceIntervalId = window.setInterval(
      pingSelectedConversationPresence,
      20000,
    );
    document.addEventListener("visibilitychange", syncSelectedConversationPresence);
    window.addEventListener("focus", syncSelectedConversationPresence);
    window.addEventListener("blur", leaveSelectedConversation);
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
      document.removeEventListener(
        "visibilitychange",
        syncSelectedConversationPresence,
      );
      window.removeEventListener("focus", syncSelectedConversationPresence);
      window.removeEventListener("blur", leaveSelectedConversation);
      leaveSelectedConversation();
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
    isActiveThreadVisible,
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

  const handleSendBroadcastNotice = async () => {
    if (!token || !broadcastMessage.trim()) {
      setBroadcastFeedback("Digite a mensagem do aviso antes de disparar.");
      return;
    }

    setIsBroadcastSending(true);
    setBroadcastFeedback("");

    try {
      const result = await sendBroadcastNotice(token, {
        title: broadcastTitle.trim() || "Aviso do suporte",
        message: broadcastMessage.trim(),
      });

      setBroadcastMessage("");
      setBroadcastFeedback(
        `Mensagem salva em ${result.messages_created ?? result.total_conversations} conversas. Online: ${result.online_conversations}. Notificacoes: ${result.push_conversations}.`,
      );
    } catch (err) {
      setBroadcastFeedback(
        err instanceof Error ? err.message : "Falha ao disparar aviso.",
      );
    } finally {
      setIsBroadcastSending(false);
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
    const isMobile = window.matchMedia("(max-width: 820px)").matches;

    if (isMobile && !isMobileThreadOpen) {
      window.history.pushState({ suporteSyncThread: true }, "", window.location.href);
      mobileThreadHistoryRef.current = true;
    }

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

  const notificationSettings = (
    <section className={styles.notificationSettings}>
      <div>
        <span>Notificacoes</span>
        <h2>Dispositivos do painel</h2>
        <p>
          Manutencao das notificacoes do painel administrativo. Esses botoes
          ficam aqui para reativar ou testar o recebimento quando necessario.
        </p>
        <small>{adminPushStatusText}</small>
        {pushFeedback ? (
          <strong className={styles.notificationFeedback}>{pushFeedback}</strong>
        ) : null}
        {pushError ? (
          <strong className={styles.notificationError}>{pushError}</strong>
        ) : null}
      </div>
      <div className={styles.notificationActions}>
        {shouldShowInstallPrompt ? (
          <button type="button" onClick={handleInstallPwa}>
            Instalar app
          </button>
        ) : null}
        <button
          type="button"
          disabled={pushState === "subscribing"}
          onClick={handleEnableAdminPush}
        >
          {pushState === "subscribing"
            ? "Ativando..."
            : pushState === "active"
              ? "Atualizar WebPush"
              : "Ativar notificacoes"}
        </button>
        {PUSHALERT_SCRIPT_URL ? (
          <button
            type="button"
            disabled={pushState === "subscribing"}
            onClick={handleEnableAdminPushAlert}
          >
            {pushState === "subscribing"
              ? "Ativando..."
              : isPushAlertKnownActive
                ? "Atualizar celular"
                : "Ativar no celular"}
          </button>
        ) : null}
        {token ? (
          <button type="button" onClick={handleTestAdminPush}>
            Testar notificacao
          </button>
        ) : null}
      </div>
    </section>
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
          <ShortcutSettings
            token={token}
            user={user}
            notificationContent={notificationSettings}
          />
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
              <div className={styles.listHeaderActions}>
                <button type="button" onClick={() => setIsBroadcastModalOpen(true)}>
                  Aviso
                </button>
                <button type="button" onClick={handleLogout}>
                  Sair
                </button>
              </div>
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
                  if (mobileThreadHistoryRef.current) {
                    window.history.back();
                    return;
                  }

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
              onScroll={updateMessageScrollState}
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
            {selectedConversation && !isAtMessageEnd ? (
              <button
                className={styles.scrollToEnd}
                type="button"
                aria-label="Ir para a ultima mensagem"
                onClick={() => scrollMessagesToEnd()}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            ) : null}
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
          {isBroadcastModalOpen ? (
            <div
              className={styles.modalOverlay}
              role="presentation"
              onMouseDown={() => setIsBroadcastModalOpen(false)}
            >
              <section
                className={`${styles.shortcutModal} ${styles.broadcastModal}`}
                role="dialog"
                aria-modal="true"
                aria-label="Disparar aviso"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <header>
                  <div>
                    <span>Disparo em massa</span>
                    <h2>Aviso para clientes</h2>
                  </div>
                  <button
                    type="button"
                    aria-label="Fechar aviso"
                    onClick={() => setIsBroadcastModalOpen(false)}
                  >
                    X
                  </button>
                </header>
                <p className={styles.broadcastHelp}>
                  Essa mensagem sera salva no historico de todos os chats e tambem
                  enviara notificacao para os clientes cadastrados.
                </p>
                <label>
                  <span>Titulo</span>
                  <input
                    value={broadcastTitle}
                    onChange={(event) => setBroadcastTitle(event.target.value)}
                  />
                </label>
                <label>
                  <span>Mensagem</span>
                  <textarea
                    maxLength={600}
                    placeholder="Digite o aviso que sera enviado para os clientes"
                    value={broadcastMessage}
                    onChange={(event) => setBroadcastMessage(event.target.value)}
                  />
                </label>
                <div className={styles.broadcastCounter}>
                  {broadcastMessage.trim().length}/600 caracteres
                </div>
                {broadcastFeedback ? (
                  <p className={styles.broadcastFeedback}>{broadcastFeedback}</p>
                ) : null}
                <footer>
                  <button
                    type="button"
                    disabled={isBroadcastSending}
                    onClick={() => setIsBroadcastModalOpen(false)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={isBroadcastSending || !broadcastMessage.trim()}
                    onClick={handleSendBroadcastNotice}
                  >
                    {isBroadcastSending ? "Enviando..." : "Disparar aviso"}
                  </button>
                </footer>
              </section>
            </div>
          ) : null}
        </div>
        ) : null}
      </section>
    </main>
  );
}
