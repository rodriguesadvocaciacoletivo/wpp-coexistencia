/** Formato do webhook da WhatsApp Cloud API. Só os campos que consumimos. */

export interface WebhookPayload {
  object?: string;
  entry?: WebhookEntry[];
}

export interface WebhookEntry {
  id?: string;
  changes?: WebhookChange[];
}

export interface WebhookChange {
  field?: string;
  value?: WebhookValue;
}

export interface WebhookValue {
  messaging_product?: string;
  metadata?: {
    display_phone_number?: string;
    phone_number_id?: string;
  };
  contacts?: WebhookContact[];
  messages?: WebhookMessage[];
  statuses?: WebhookStatus[];

  // message_template_status_update
  event?: string;
  message_template_id?: number | string;
  message_template_name?: string;
  message_template_language?: string;
  reason?: string;
}

export interface WebhookContact {
  wa_id?: string;
  profile?: { name?: string };
}

export interface WebhookMediaObject {
  id?: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
  filename?: string;
  voice?: boolean;
  animated?: boolean;
}

export interface WebhookMessage {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;

  text?: { body?: string };
  image?: WebhookMediaObject;
  video?: WebhookMediaObject;
  audio?: WebhookMediaObject;
  document?: WebhookMediaObject;
  sticker?: WebhookMediaObject;

  location?: {
    latitude?: number;
    longitude?: number;
    name?: string;
    address?: string;
  };
  contacts?: unknown[];
  reaction?: { message_id?: string; emoji?: string };
  button?: { text?: string; payload?: string };
  interactive?: Record<string, unknown>;
  context?: { id?: string; from?: string; forwarded?: boolean };

  errors?: Array<{ code?: number; title?: string; message?: string }>;
}

export interface WebhookStatus {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  conversation?: { id?: string; expiration_timestamp?: string };
  errors?: Array<{
    code?: number;
    title?: string;
    message?: string;
    error_data?: { details?: string };
  }>;
}

/**
 * Chave de deduplicação de um evento.
 *
 * A Meta reentrega webhooks quando não recebe 200 a tempo, e o mesmo evento
 * pode chegar várias vezes. Para mensagens, o id é único e basta. Para status,
 * o mesmo id percorre sent → delivered → read, então a chave precisa do
 * status junto, senão só a primeira transição seria processada.
 */
export function buildEventKey(field: string, value: WebhookValue): string[] {
  const keys: string[] = [];

  for (const message of value.messages ?? []) {
    if (message.id) {
      keys.push(`msg:${message.id}`);
    }
  }

  for (const status of value.statuses ?? []) {
    if (status.id && status.status) {
      keys.push(`st:${status.id}:${status.status}`);
    }
  }

  if (keys.length === 0) {
    // Eventos sem identificador próprio (template status, por exemplo) usam um
    // resumo do conteúdo para não serem processados em duplicidade.
    const summary = [
      field,
      value.message_template_id ?? '',
      value.message_template_name ?? '',
      value.message_template_language ?? '',
      value.event ?? '',
    ].join(':');

    keys.push(summary.slice(0, 190));
  }

  return keys;
}
