import { apiFetch } from "@/services/api";
import type {
  Attachment,
  AuthResponse,
  BroadcastNoticeResult,
  Conversation,
  ConversationDetails,
  ConversationStatus,
  Message,
  MessageType,
  SenderType,
  Shortcut,
  UploadResponse,
  User,
} from "@/types";
import { prepareFileForUpload } from "@/utils/imageCompression";
import { getApiUrl } from "./api";

export function login(email: string, senha: string) {
  return apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    json: { email, senha },
  });
}

export function logout(token: string) {
  return apiFetch<void>("/auth/logout", {
    method: "POST",
    token,
  });
}

export function getMe(token: string) {
  return apiFetch<User>("/auth/me", { token });
}

export function getConversations(token: string, search?: string) {
  const params = new URLSearchParams();

  if (search) {
    params.set("search", search);
  }

  const query = params.toString();
  return apiFetch<Conversation[]>(`/conversations${query ? `?${query}` : ""}`, {
    token,
  });
}

export function sendBroadcastNotice(
  token: string,
  payload: { title?: string; message: string },
) {
  return apiFetch<BroadcastNoticeResult>("/broadcasts/notice", {
    method: "POST",
    token,
    json: payload,
  });
}

export function getConversation(token: string, id: number) {
  return apiFetch<ConversationDetails>(`/conversations/${id}`, { token });
}

export function updateConversation(
  token: string,
  id: number,
  payload: { status?: ConversationStatus; atendente_id?: number },
) {
  return apiFetch<Conversation>(`/conversations/${id}`, {
    method: "PUT",
    token,
    json: payload,
  });
}

export function closeConversation(token: string, id: number) {
  return apiFetch<Conversation>(`/conversations/${id}/close`, {
    method: "POST",
    token,
  });
}

export function reopenConversation(token: string, id: number) {
  return apiFetch<Conversation>(`/conversations/${id}/reopen`, {
    method: "POST",
    token,
  });
}

export function createConversation(
  codeOrClienteId: string,
  token?: string,
) {
  const json = token
    ? { cliente_id_externo: codeOrClienteId }
    : { codigo: codeOrClienteId };

  return apiFetch<Conversation>("/conversations", {
    method: "POST",
    token,
    json,
  });
}

export function getMessages(token: string, conversationId: number) {
  return apiFetch<Message[]>(`/messages/${conversationId}`, { token });
}

export function getClientMessages(conversationId: number, code: string) {
  const params = new URLSearchParams();
  params.set("codigo", code);

  return apiFetch<Message[]>(`/messages/${conversationId}?${params.toString()}`);
}

export function getPushConfig() {
  return apiFetch<{ enabled: boolean; publicKey: string | null }>("/push/config");
}

export function subscribeToPush(payload: {
  codigo: string;
  conversation_id: number;
  subscription: PushSubscriptionJSON;
}) {
  return apiFetch<{ success: boolean }>("/push/subscribe", {
    method: "POST",
    json: payload,
  });
}

export function subscribeAdminToPush(
  token: string,
  payload: { subscription: PushSubscriptionJSON },
) {
  return apiFetch<{ success: boolean }>("/push/admin/subscribe", {
    method: "POST",
    token,
    json: payload,
  });
}

export function subscribeAdminToPushAlert(
  token: string,
  payload: { subscriber_id: string },
) {
  return apiFetch<{ success: boolean }>("/push/admin/pushalert/subscribe", {
    method: "POST",
    token,
    json: payload,
  });
}

export function testAdminPush(token: string) {
  return apiFetch<{
    success: boolean;
    webpush_subscriptions: number;
    pushalert_subscriptions: number;
  }>("/push/admin/test", {
    method: "POST",
    token,
  });
}

export function subscribeToPushAlert(payload: {
  codigo: string;
  conversation_id: number;
  subscriber_id: string;
}) {
  return apiFetch<{ success: boolean }>("/push/pushalert/subscribe", {
    method: "POST",
    json: payload,
  });
}

export function unsubscribeFromPush(payload: {
  endpoint?: string | null;
  subscription?: PushSubscriptionJSON | null;
}) {
  return apiFetch<{ success: boolean }>("/push/subscribe", {
    method: "DELETE",
    json: payload,
  });
}

export function markMessageAsRead(messageId: number, token?: string) {
  return apiFetch<Message>(`/messages/${messageId}/read`, {
    method: "PUT",
    token,
  });
}

export function reactToMessage(payload: {
  messageId: number;
  emoji: string;
  actor_type?: "CLIENTE" | "ATENDENTE";
  actor_id?: string | number;
  token?: string;
}) {
  const { messageId, token, ...body } = payload;

  return apiFetch<Message>(`/messages/${messageId}/reaction`, {
    method: "PUT",
    token,
    json: body,
  });
}

export function deleteMessageReaction(payload: {
  messageId: number;
  actor_type?: "CLIENTE" | "ATENDENTE";
  actor_id?: string | number;
  token?: string;
}) {
  const { messageId, token, ...body } = payload;

  return apiFetch<Message>(`/messages/${messageId}/reaction`, {
    method: "DELETE",
    token,
    json: body,
  });
}

export function getShortcutSuggestions(token: string, query: string) {
  const params = new URLSearchParams();

  params.set("q", query);

  return apiFetch<Shortcut[]>(`/shortcuts/suggestions?${params.toString()}`, {
    token,
  });
}

export function getShortcuts(token: string, search?: string) {
  const params = new URLSearchParams();

  if (search) {
    params.set("search", search);
  }

  const query = params.toString();

  return apiFetch<Shortcut[]>(`/shortcuts${query ? `?${query}` : ""}`, {
    token,
  });
}

export function createShortcut(
  token: string,
  payload: {
    shortcut: string;
    title: string;
    message: string;
    active?: boolean;
    global?: boolean;
  },
) {
  return apiFetch<Shortcut>("/shortcuts", {
    method: "POST",
    token,
    json: payload,
  });
}

export function updateShortcut(
  token: string,
  id: number,
  payload: {
    shortcut?: string;
    title?: string;
    message?: string;
    active?: boolean;
    global?: boolean;
  },
) {
  return apiFetch<Shortcut>(`/shortcuts/${id}`, {
    method: "PUT",
    token,
    json: payload,
  });
}

export function deleteShortcut(token: string, id: number) {
  return apiFetch<{ success: boolean }>(`/shortcuts/${id}`, {
    method: "DELETE",
    token,
  });
}

export function sendMessage(payload: {
  conversation_id: number;
  sender_type: SenderType;
  sender_id?: string | number;
  message: string;
  message_type?: MessageType;
  attachments?: Attachment[];
  token?: string;
}) {
  const { token, message_type = "TEXT", ...body } = payload;

  return apiFetch<Message>("/messages", {
    method: "POST",
    token,
    json: {
      ...body,
      message_type,
    },
  });
}

export function updateMessage(payload: {
  messageId: number;
  message: string;
  actor_type?: "CLIENTE" | "ATENDENTE";
  actor_id?: string | number;
  token?: string;
}) {
  const { messageId, token, ...body } = payload;

  return apiFetch<Message>(`/messages/${messageId}`, {
    method: "PUT",
    token,
    json: body,
  });
}

export function deleteMessage(payload: {
  messageId: number;
  actor_type?: "CLIENTE" | "ATENDENTE";
  actor_id?: string | number;
  token?: string;
}) {
  const { messageId, token, ...body } = payload;

  return apiFetch<Message>(`/messages/${messageId}`, {
    method: "DELETE",
    token,
    json: body,
  });
}

export async function uploadFile(file: File, token?: string) {
  const preparedFile = await prepareFileForUpload(file);
  const formData = new FormData();
  formData.append("file", preparedFile);

  const uploadUrl = `${getApiUrl()}/upload`;
  const response = await fetch(uploadUrl, {
    method: "POST",
    body: formData,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!response.ok) {
    let detail = "";

    try {
      const errorBody = (await response.json()) as { message?: string; error?: string };
      detail = errorBody.message ?? errorBody.error ?? "";
    } catch {
      detail = await response.text().catch(() => "");
    }

    throw new Error(
      detail ? `Falha ao enviar ${file.name}: ${detail}` : `Falha ao enviar ${file.name}.`,
    );
  }

  return response.json() as Promise<UploadResponse>;
}
