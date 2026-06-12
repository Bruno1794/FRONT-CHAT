import { apiFetch } from "@/services/api";
import type {
  Attachment,
  AuthResponse,
  BroadcastNoticeResult,
  ChatPopupConfig,
  Cliente,
  ClientAccessLink,
  ClearDataResult,
  Conversation,
  ConversationDetails,
  ConversationStatus,
  Message,
  MessageType,
  PixChargeResult,
  SenderType,
  Shortcut,
  UploadResponse,
  User,
} from "@/types";
import {
  prepareEmergencyImageForUpload,
  prepareFileForUpload,
} from "@/utils/imageCompression";
import { getApiUrl } from "./api";

const DIRECT_UPLOAD_SIZE = 3.5 * 1024 * 1024;
const IOS_INLINE_IMAGE_MAX_SIZE = 220 * 1024;
const IOS_CHUNK_SIZE = 96 * 1024;

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

export function changePassword(
  token: string,
  payload: { senha_atual: string; nova_senha: string },
) {
  return apiFetch<{ success: boolean }>("/auth/password", {
    method: "PUT",
    token,
    json: payload,
  });
}

export function clearSystemData(token: string) {
  return apiFetch<ClearDataResult>("/maintenance/clear-data", {
    method: "POST",
    token,
  });
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

export function getChatPopupConfig() {
  return apiFetch<ChatPopupConfig>("/chat-popup");
}

export function listChatPopupConfigs(token: string) {
  return apiFetch<ChatPopupConfig[]>("/chat-popup/items", { token });
}

export function createChatPopupConfig(token: string, payload: ChatPopupConfig) {
  return apiFetch<ChatPopupConfig>("/chat-popup/items", {
    method: "POST",
    token,
    json: payload,
  });
}

export function updateChatPopupConfig(token: string, payload: ChatPopupConfig) {
  return apiFetch<ChatPopupConfig>("/chat-popup", {
    method: "PUT",
    token,
    json: payload,
  });
}

export function updateChatPopupConfigById(
  token: string,
  id: string,
  payload: ChatPopupConfig,
) {
  return apiFetch<ChatPopupConfig>(`/chat-popup/items/${encodeURIComponent(id)}`, {
    method: "PUT",
    token,
    json: payload,
  });
}

export function deleteChatPopupConfig(token: string, id: string) {
  return apiFetch<{ success: boolean }>(
    `/chat-popup/items/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      token,
    },
  );
}

export function createPixCharge(
  token: string,
  payload: { conversation_id: number; amount: number; payer_phone?: string },
) {
  return apiFetch<PixChargeResult>("/pix/charges", {
    method: "POST",
    token,
    json: payload,
  });
}

export function getConversation(token: string, id: number) {
  return apiFetch<ConversationDetails>(`/conversations/${id}`, { token });
}

export function getClientAccessLink(token: string, clienteId: string) {
  return apiFetch<ClientAccessLink>(
    `/conversations/client-access/${encodeURIComponent(clienteId)}`,
    { token },
  );
}

export function getClientes(token: string, search?: string) {
  const params = new URLSearchParams();

  if (search) {
    params.set("search", search);
  }

  const query = params.toString();

  return apiFetch<Cliente[]>(`/clientes${query ? `?${query}` : ""}`, {
    token,
  });
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
  inline_attachments?: Array<{
    filename: string;
    mime_type: string;
    data: string;
  }>;
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

export function isIosImageFile(file: File) {
  return isIosDevice() && isImageUpload(file);
}

export async function buildInlineImageAttachment(file: File) {
  const preparedFile = await prepareEmergencyImageForUpload(file);
  const inlineFile =
    preparedFile !== file &&
    preparedFile.size <= IOS_INLINE_IMAGE_MAX_SIZE &&
    preparedFile.type.startsWith("image/jpeg")
      ? preparedFile
      : file;

  const data = await readFileAsDataUrl(inlineFile);

  return {
    filename: inlineFile.name,
    mime_type: inlineFile.type || "image/heic",
    data,
  };
}

export async function uploadIosImageInChunks(file: File) {
  const preparedFile = await prepareEmergencyImageForUpload(file);
  const uploadFile = preparedFile !== file ? preparedFile : file;
  const dataUrl = await readFileAsDataUrl(uploadFile);
  const base64 = dataUrl.includes(",") ? dataUrl.split(",").pop() || "" : dataUrl;
  const total = Math.ceil(base64.length / IOS_CHUNK_SIZE);
  const uploadId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  let uploaded: UploadResponse | null = null;

  for (let index = 0; index < total; index += 1) {
    const response = await fetch(`${getApiUrl()}/upload/base64-chunk`, {
      method: "POST",
      body: JSON.stringify({
        upload_id: uploadId,
        filename: uploadFile.name,
        mime_type: uploadFile.type || "image/heic",
        chunk: base64.slice(index * IOS_CHUNK_SIZE, (index + 1) * IOS_CHUNK_SIZE),
        index,
        total,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const detail = await readUploadError(response);
      throw new Error(detail || `Falha ao enviar ${file.name}.`);
    }

    const result = (await response.json()) as {
      complete: boolean;
      file?: UploadResponse;
    };

    if (result.complete && result.file) {
      uploaded = result.file;
    }
  }

  if (!uploaded) {
    throw new Error(`Falha ao enviar ${file.name}.`);
  }

  return uploaded;
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

function isImageUpload(file: File) {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

function isIosDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function postUploadFile(uploadUrl: string, file: File, token?: string) {
  const formData = new FormData();
  formData.append("file", file, file.name);

  return new Promise<Response>((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open("POST", uploadUrl);

    if (token) {
      request.setRequestHeader("Authorization", `Bearer ${token}`);
    }

    request.responseType = "text";
    request.timeout = 120000;

    request.onload = () => {
      resolve(
        new Response(request.responseText, {
          status: request.status,
          statusText: request.statusText,
          headers: {
            "content-type": request.getResponseHeader("content-type") ?? "application/json",
          },
        }),
      );
    };

    request.onerror = () => reject(new Error("Upload connection failed"));
    request.ontimeout = () => reject(new Error("Upload timeout"));
    request.onabort = () => reject(new Error("Upload aborted"));
    request.send(formData);
  });
}

async function readUploadError(response: Response) {
  try {
    const errorBody = (await response.json()) as { message?: string; error?: string };
    return errorBody.message ?? errorBody.error ?? "";
  } catch {
    return response.text().catch(() => "");
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao ler imagem."));
    reader.readAsDataURL(file);
  });
}

async function postBase64Image(uploadUrl: string, file: File, token?: string) {
  const dataUrl = await readFileAsDataUrl(file);

  return fetch(uploadUrl, {
    method: "POST",
    body: JSON.stringify({
      filename: file.name,
      mime_type: file.type || "image/jpeg",
      data: dataUrl,
    }),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

async function uploadBase64Image(file: File, token?: string) {
  try {
    return await postBase64Image("/api/upload/base64", file, token);
  } catch {
    return postBase64Image(`${getApiUrl()}/upload/base64`, file, token);
  }
}

async function uploadPreparedFile(file: File, token?: string) {
  const shouldUploadDirectly = isImageUpload(file) || file.size >= DIRECT_UPLOAD_SIZE;

  try {
    return await postUploadFile(
      shouldUploadDirectly ? `${getApiUrl()}/upload` : "/api/upload",
      file,
      token,
    );
  } catch {
    return postUploadFile(
      shouldUploadDirectly ? "/api/upload" : `${getApiUrl()}/upload`,
      file,
      token,
    );
  }
}

export async function uploadFile(file: File, token?: string) {
  if (isIosDevice() && isImageUpload(file)) {
    let response: Response;

    try {
      response = await uploadBase64Image(file, token);
    } catch {
      const emergencyFile = await prepareEmergencyImageForUpload(file);
      response = await uploadBase64Image(emergencyFile, token);
    }

    if (!response.ok) {
      const detail = await readUploadError(response);

      throw new Error(
        detail ? `Falha ao enviar ${file.name}: ${detail}` : `Falha ao enviar ${file.name}.`,
      );
    }

    return response.json() as Promise<UploadResponse>;
  }

  const preparedFile = await prepareFileForUpload(file);
  let response: Response;

  try {
    response = await uploadPreparedFile(preparedFile, token);
  } catch {
    if (!isImageUpload(file)) {
      throw new Error(`Falha ao enviar ${file.name}: conexao com upload falhou.`);
    }

    const emergencyFile = await prepareEmergencyImageForUpload(file);

    try {
      response = await uploadBase64Image(emergencyFile, token);
    } catch {
      throw new Error(`Falha ao enviar ${file.name}: conexao com upload falhou.`);
    }
  }

  if (!response.ok && [413, 502, 504].includes(response.status)) {
    try {
      response = await postUploadFile(`${getApiUrl()}/upload`, preparedFile, token);
    } catch {
      // Keep the proxy response so the API error can be shown below.
    }
  }

  if (!response.ok && isImageUpload(file)) {
    const emergencyFile = await prepareEmergencyImageForUpload(file);

    if (emergencyFile !== file) {
      try {
        response = await uploadBase64Image(emergencyFile, token);
      } catch {
        // Keep the original response so the API error can be shown below.
      }
    }
  }

  if (!response.ok) {
    const detail = await readUploadError(response);

    throw new Error(
      detail ? `Falha ao enviar ${file.name}: ${detail}` : `Falha ao enviar ${file.name}.`,
    );
  }

  return response.json() as Promise<UploadResponse>;
}
