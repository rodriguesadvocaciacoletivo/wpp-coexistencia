export const TEMPLATE_CATEGORIES = [
  'UTILITY',
  'MARKETING',
  'AUTHENTICATION',
] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export const TEMPLATE_STATUSES = [
  'APPROVED',
  'PENDING',
  'REJECTED',
  'PAUSED',
  'DISABLED',
  'IN_APPEAL',
  'PENDING_DELETION',
  'DELETED',
  'LIMIT_EXCEEDED',
] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

export interface TemplateComponent {
  type: string;
  format?: string;
  text?: string;
  buttons?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface TemplateDto {
  id: string;
  inboxId: string;
  metaId: string;
  name: string;
  language: string;
  category: TemplateCategory;
  status: TemplateStatus;
  components: TemplateComponent[];
  rejectedReason: string | null;
  qualityScore: string | null;
  syncedAt: string;
}

export interface CreateTemplateInput {
  name: string;
  language: string;
  category: TemplateCategory;
  /** Texto do cabeçalho. Opcional. */
  headerText?: string;
  body: string;
  footerText?: string;
  /** Valores de exemplo das variáveis do corpo — exigidos pela Meta. */
  bodyExamples?: string[];
}

export interface TemplateSyncResultDto {
  synced: number;
  created: number;
  updated: number;
  removed: number;
  syncedAt: string;
}

export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  UTILITY: 'Utilidade',
  MARKETING: 'Marketing',
  AUTHENTICATION: 'Autenticação',
};

export const TEMPLATE_STATUS_LABELS: Record<TemplateStatus, string> = {
  APPROVED: 'Aprovado',
  PENDING: 'Em análise',
  REJECTED: 'Recusado',
  PAUSED: 'Pausado',
  DISABLED: 'Desabilitado',
  IN_APPEAL: 'Em recurso',
  PENDING_DELETION: 'Exclusão pendente',
  DELETED: 'Excluído',
  LIMIT_EXCEEDED: 'Limite excedido',
};

/** Só templates aprovados podem ser enviados. */
export function isTemplateSendable(status: TemplateStatus): boolean {
  return status === 'APPROVED';
}

/**
 * Extrai os índices de variáveis `{{n}}` de um texto, em ordem e sem repetição.
 * Usado para montar o formulário de preenchimento no modal de templates.
 */
export function extractVariables(text: string): number[] {
  const found = new Set<number>();
  const pattern = /\{\{(\d+)\}\}/g;

  let match = pattern.exec(text);
  while (match !== null) {
    found.add(Number(match[1]));
    match = pattern.exec(text);
  }

  return [...found].sort((a, b) => a - b);
}

/** Substitui `{{n}}` pelos valores informados, para a pré-visualização. */
export function renderTemplateText(
  text: string,
  values: Record<number, string>,
): string {
  return text.replace(/\{\{(\d+)\}\}/g, (original, index: string) => {
    const value = values[Number(index)];
    return value !== undefined && value !== '' ? value : original;
  });
}

/** Devolve o texto do corpo de um template. */
export function templateBodyText(components: TemplateComponent[]): string {
  return components.find((c) => c.type?.toUpperCase() === 'BODY')?.text ?? '';
}

export function templateHeaderText(components: TemplateComponent[]): string | null {
  const header = components.find((c) => c.type?.toUpperCase() === 'HEADER');
  return header?.format?.toUpperCase() === 'TEXT' ? (header.text ?? null) : null;
}

export function templateFooterText(components: TemplateComponent[]): string | null {
  return components.find((c) => c.type?.toUpperCase() === 'FOOTER')?.text ?? null;
}
