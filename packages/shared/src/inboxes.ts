import type { UserDto } from './users.js';

/**
 * Como o número foi conectado à plataforma.
 * Ver docs/adr/001-onboarding-duplo.md.
 */
export const INBOX_ONBOARDING_TYPES = ['manual', 'coexistence'] as const;
export type InboxOnboardingType = (typeof INBOX_ONBOARDING_TYPES)[number];

export const INBOX_CONNECTION_STATUSES = [
  'pending',
  'connected',
  'error',
] as const;
export type InboxConnectionStatus = (typeof INBOX_CONNECTION_STATUSES)[number];

export interface InboxDto {
  id: string;
  name: string;
  phoneNumber: string;
  phoneNumberId: string;
  wabaId: string;
  onboardingType: InboxOnboardingType;
  connectionStatus: InboxConnectionStatus;
  connectionError: string | null;
  lastValidatedAt: string | null;
  throughputLimitMps: number;

  verifiedName: string | null;
  qualityRating: string | null;
  messagingTier: string | null;
  wabaName: string | null;
  wabaReviewStatus: string | null;

  webhookSubscribedAt: string | null;
  templatesSyncedAt: string | null;
  templateCount: number;
  memberCount: number;
  createdAt: string;
}

export interface InboxDetailDto extends InboxDto {
  members: UserDto[];
}

export interface CreateInboxInput {
  name: string;
  phoneNumber: string;
  phoneNumberId: string;
  wabaId: string;
  /** System User Token. Só trafega no sentido cliente → API. */
  token: string;
  memberIds?: string[];
}

export interface UpdateInboxInput {
  name?: string;
  /** Omitir preserva o token salvo. Informar revalida a conexão. */
  token?: string;
  memberIds?: string[];
}

/** Resultado da validação das credenciais, antes de salvar a caixa. */
export interface InboxValidationDto {
  valid: boolean;
  message: string;
  phoneNumber?: {
    displayPhoneNumber: string | null;
    verifiedName: string | null;
    qualityRating: string | null;
    codeVerificationStatus: string | null;
    platformType: string | null;
  };
  waba?: {
    name: string | null;
    reviewStatus: string | null;
  };
  /** `true` quando o número informado pertence à WABA informada. */
  phoneBelongsToWaba?: boolean;
  templateCount?: number;
}

export const CONNECTION_STATUS_LABELS: Record<InboxConnectionStatus, string> = {
  pending: 'Aguardando validação',
  connected: 'Conectada',
  error: 'Com erro',
};

export const ONBOARDING_TYPE_LABELS: Record<InboxOnboardingType, string> = {
  manual: 'API Oficial (Cloud API)',
  coexistence: 'Coexistência',
};

/**
 * A Meta classifica a qualidade do número em verde, amarelo e vermelho.
 * Vermelho antecede restrição de envio, então merece destaque na interface.
 */
export function qualityRatingLabel(rating: string | null): string {
  switch (rating?.toUpperCase()) {
    case 'GREEN':
      return 'Alta';
    case 'YELLOW':
      return 'Média';
    case 'RED':
      return 'Baixa';
    case 'UNKNOWN':
      return 'Ainda sem dados';
    default:
      return '—';
  }
}
