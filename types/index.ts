export type UserRole = "ADMIN" | "ATENDENTE";

export type ConversationStatus =
  | "ABERTA"
  | "AGUARDANDO_CLIENTE"
  | "FINALIZADA"
  | "ARQUIVADA";

export type SenderType = "CLIENTE" | "ATENDENTE" | "SISTEMA";

export type MessageType = "TEXT" | "IMAGE" | "FILE" | "AUDIO";

export interface User {
  id: number;
  nome: string;
  email: string;
  role: UserRole;
  online: boolean;
  ultimo_acesso?: string | null;
}

export interface Attachment {
  filename: string;
  original_name?: string;
  url?: string;
  path?: string;
  mime_type: string;
  size: number;
}

export interface UploadResponse {
  filename: string;
  original_name: string;
  path: string;
  url: string;
  mime_type: string;
  size: number;
}

export interface Message {
  id: number;
  conversation_id: number;
  sender_type: SenderType;
  sender_id?: string | number | null;
  message: string | null;
  message_type: MessageType;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
  read?: boolean;
  read_at?: string | null;
  attachments?: Attachment[];
  reactions?: MessageReaction[];
}

export interface MessageReadReceipt {
  id?: number;
  message_id?: number;
  read?: boolean;
  read_at?: string;
  conversation_id?: number;
}

export interface MessageReaction {
  id: number;
  message_id: number;
  actor_type: "CLIENTE" | "ATENDENTE";
  actor_id?: string | null;
  emoji: string;
  created_at?: string;
  updated_at?: string;
}

export interface MessageReactionUpdate {
  message_id: number;
  conversation_id: number;
  reactions: MessageReaction[];
}

export interface ConversationPresenceParticipant {
  socket_id: string;
  participant_type: "CLIENTE" | "ATENDENTE";
  actor_id?: string | null;
  joined_at: string;
}

export interface ConversationPresence {
  conversation_id: number;
  clientes: number;
  atendentes: number;
  participants: ConversationPresenceParticipant[];
  updated_at: string;
}

export interface BroadcastNotice {
  id: string;
  conversation_id: number;
  title: string;
  message: string;
  created_at: string;
  sender?: {
    id: number;
    nome: string;
  };
}

export interface BroadcastNoticeResult {
  success: boolean;
  total_conversations: number;
  messages_created?: number;
  failed_conversations?: number;
  online_conversations: number;
  push_conversations: number;
}

export interface Cliente {
  id: string;
  nome: string;
  referencia?: string;
  usuario_referencia?: string;
  telefone?: string;
  email?: string;
  cidade?: string;
}

export interface Conversation {
  id: number;
  cliente_id_externo: string;
  atendente_id: number | null;
  status: ConversationStatus;
  ultima_mensagem: string | null;
  ultima_interacao: string;
  cliente?: Cliente | null;
  unread_count: number;
}

export interface ConversationDetails extends Conversation {
  historico_anterior?: Conversation[];
  notas_internas?: Note[];
}

export interface Note {
  id: number;
  conversation_id: number;
  user_id: number;
  note: string;
  created_at: string;
}

export interface Shortcut {
  id: number;
  user_id?: number | null;
  shortcut: string;
  title: string;
  message: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}
