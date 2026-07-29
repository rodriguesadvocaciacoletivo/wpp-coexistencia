/** Respostas da Graph API que consumimos. Só os campos usados. */

export interface GraphPhoneNumber {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  /** GREEN | YELLOW | RED | UNKNOWN */
  quality_rating?: string;
  code_verification_status?: string;
  /** Em coexistência a Meta devolve CLOUD_API com o app ativo no celular. */
  platform_type?: string;
  throughput?: { level?: string };
  messaging_limit_tier?: string;
}

export interface GraphWaba {
  id: string;
  name?: string;
  currency?: string;
  timezone_id?: string;
  /** APPROVED | PENDING | REJECTED */
  account_review_status?: string;
  message_template_namespace?: string;
}

export interface GraphTemplateComponent {
  type: string;
  format?: string;
  text?: string;
  example?: Record<string, unknown>;
  buttons?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface GraphTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components?: GraphTemplateComponent[];
  rejected_reason?: string;
  quality_score?: { score?: string };
}

export interface GraphPaged<T> {
  data: T[];
  paging?: {
    cursors?: { before?: string; after?: string };
    next?: string;
  };
}

export interface GraphSubscribedApp {
  whatsapp_business_api_data?: {
    id?: string;
    name?: string;
    link?: string;
  };
}

/**
 * Tradução do throughput da Meta para um teto em mensagens por segundo.
 *
 * Números em coexistência têm teto fixo de 20 mps, sem escalonamento. Os
 * demais variam conforme o tier. O valor alimenta o throttling da fila de
 * envio na Fase 3 — errar para menos custa latência, errar para mais custa
 * erro 130429 e degradação da qualidade do número.
 */
export function resolveThroughputMps(
  phoneNumber: GraphPhoneNumber,
  isCoexistence: boolean,
): number {
  if (isCoexistence) {
    return 20;
  }

  switch (phoneNumber.throughput?.level) {
    case 'NOT_APPLICABLE':
      return 20;
    case 'STANDARD':
      return 80;
    case 'HIGH':
      return 1000;
    default:
      return 80;
  }
}
