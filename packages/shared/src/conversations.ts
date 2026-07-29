import type { UserDto } from './users.js';

export const CONVERSATION_STATUSES = ['open', 'resolved'] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const CONVERSATION_PRIORITIES = [
  'none',
  'low',
  'medium',
  'high',
  'urgent',
] as const;
export type ConversationPriority = (typeof CONVERSATION_PRIORITIES)[number];

export const CONVERSATION_FILTERS = ['mine', 'unassigned', 'all'] as const;
export type ConversationFilter = (typeof CONVERSATION_FILTERS)[number];

export const MESSAGE_DIRECTIONS = ['in', 'out'] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

export const MESSAGE_TYPES = [
  'text',
  'image',
  'video',
  'audio',
  'document',
  'sticker',
  'location',
  'contacts',
  'reaction',
  'template',
  'private_note',
  'system_event',
  'unsupported',
] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const MESSAGE_STATUSES = [
  'pending',
  'sent',
  'delivered',
  'read',
  'failed',
] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export type MessageOrigin =
  | 'platform'
  | 'coexistence_echo'
  | 'contact'
  | 'system';

export interface ContactDto {
  id: string;
  waId: string;
  profileName: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** Nome a exibir: o editado pela equipe tem precedência sobre o do perfil. */
  name: string;
}

export interface ConversationDto {
  id: string;
  inboxId: string;
  inboxName: string;
  contact: ContactDto;
  status: ConversationStatus;
  priority: ConversationPriority;
  assignee: UserDto | null;
  teamId: string | null;
  teamName: string | null;
  windowExpiresAt: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  createdAt: string;
}

export interface AttachmentDto {
  id: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  originalName: string | null;
  durationSeconds: number | null;
  caption: string | null;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  type: MessageType;
  origin: MessageOrigin;
  status: MessageStatus;
  content: string | null;
  payload: Record<string, unknown> | null;
  replyToWaId: string | null;
  author: { id: string; name: string } | null;
  attachments: AttachmentDto[];
  errorMessage: string | null;
  createdAt: string;
}

export interface ConversationListQuery {
  filter?: ConversationFilter;
  inboxId?: string;
  status?: ConversationStatus;
  priority?: ConversationPriority;
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ConversationCountsDto {
  mine: number;
  unassigned: number;
  all: number;
}

export interface SendMessageInput {
  /** Texto livre. Exige janela de 24h aberta. */
  content?: string;
  /** Nota interna, visível só para a equipe. Nunca vai à Meta. */
  privateNote?: boolean;
  /** Identificadores de arquivos já enviados a /uploads. */
  attachmentIds?: string[];
}

export interface UpdateConversationInput {
  assigneeId?: string | null;
  teamId?: string | null;
  priority?: ConversationPriority;
  status?: ConversationStatus;
}

export const PRIORITY_LABELS: Record<ConversationPriority, string> = {
  none: 'Nenhuma',
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
};

export const FILTER_LABELS: Record<ConversationFilter, string> = {
  mine: 'Minhas',
  unassigned: 'Não atribuídas',
  all: 'Todos',
};

/**
 * Estado da janela de 24h.
 *
 * Fora dela a Meta só aceita template — o composer bloqueia texto livre na
 * Fase 4 com base nisto.
 */
export function isWindowOpen(windowExpiresAt: string | null): boolean {
  if (!windowExpiresAt) {
    return false;
  }

  return new Date(windowExpiresAt).getTime() > Date.now();
}

export function windowRemainingLabel(windowExpiresAt: string | null): string {
  if (!windowExpiresAt) {
    return 'Janela fechada';
  }

  const remaining = new Date(windowExpiresAt).getTime() - Date.now();

  if (remaining <= 0) {
    return 'Janela fechada';
  }

  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);

  return hours > 0
    ? `Janela aberta por ${hours}h${String(minutes).padStart(2, '0')}`
    : `Janela aberta por ${minutes} min`;
}

/** Limites da Cloud API por tipo de mídia, em bytes. */
export const MEDIA_LIMITS: Record<string, number> = {
  image: 5 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  sticker: 500 * 1024,
  document: 100 * 1024 * 1024,
};

export function mediaKindOf(mimeType: string): string {
  const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';

  if (base.startsWith('image/')) {
    return base === 'image/webp' ? 'sticker' : 'image';
  }
  if (base.startsWith('video/')) {
    return 'video';
  }
  if (base.startsWith('audio/')) {
    return 'audio';
  }

  return 'document';
}
