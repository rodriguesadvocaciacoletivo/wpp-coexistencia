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

export interface TemplateButton {
  /** URL, PHONE_NUMBER, QUICK_REPLY, COPY_CODE… */
  type: string;
  text: string;
  url?: string;
  phoneNumber?: string;
}

export function templateButtons(components: TemplateComponent[]): TemplateButton[] {
  const group = components.find((c) => c.type?.toUpperCase() === 'BUTTONS');

  return (group?.buttons ?? []).map((button) => ({
    type: String(button.type ?? '').toUpperCase(),
    text: String(button.text ?? ''),
    url: typeof button.url === 'string' ? button.url : undefined,
    phoneNumber:
      typeof button.phone_number === 'string' ? button.phone_number : undefined,
  }));
}

/**
 * Uma variável a preencher antes de enviar.
 *
 * A `key` é o contrato entre o formulário do modal e o backend: ele remonta os
 * `components` da Meta a partir dela, sem depender da ordem em que o atendente
 * preencheu os campos.
 */
export interface TemplateVariable {
  /** `header.1`, `body.2`, `button.0.1`. */
  key: string;
  component: 'header' | 'body' | 'button';
  /** O `n` de `{{n}}`. */
  position: number;
  /** Posição do botão na lista — só quando `component` é `button`. */
  buttonIndex?: number;
  label: string;
}

/**
 * Lista as variáveis de um template, na ordem em que aparecem para quem lê a
 * mensagem: cabeçalho, corpo e botões.
 *
 * Cobre header de texto, corpo e botões de URL — que é onde a Meta permite
 * variável. Header de mídia exige upload de arquivo e fica fora por ora.
 */
export function templateVariables(
  components: TemplateComponent[],
): TemplateVariable[] {
  const variables: TemplateVariable[] = [];

  const header = templateHeaderText(components);
  if (header) {
    for (const position of extractVariables(header)) {
      variables.push({
        key: `header.${position}`,
        component: 'header',
        position,
        label: `Cabeçalho · variável ${position}`,
      });
    }
  }

  for (const position of extractVariables(templateBodyText(components))) {
    variables.push({
      key: `body.${position}`,
      component: 'body',
      position,
      label: `Corpo · variável ${position}`,
    });
  }

  templateButtons(components).forEach((button, buttonIndex) => {
    if (button.type !== 'URL' || !button.url) {
      return;
    }

    for (const position of extractVariables(button.url)) {
      variables.push({
        key: `button.${buttonIndex}.${position}`,
        component: 'button',
        position,
        buttonIndex,
        label: `Botão "${button.text}" · variável ${position}`,
      });
    }
  });

  return variables;
}

/** Recorta os valores de um componente e reindexa por `{{n}}`. */
function valuesFor(
  variables: TemplateVariable[],
  values: Record<string, string>,
  predicate: (variable: TemplateVariable) => boolean,
): Record<number, string> {
  const result: Record<number, string> = {};

  for (const variable of variables.filter(predicate)) {
    const value = values[variable.key];
    if (value !== undefined) {
      result[variable.position] = value;
    }
  }

  return result;
}

export interface TemplatePreview {
  header: string | null;
  body: string;
  footer: string | null;
  buttons: TemplateButton[];
}

/** Monta o template já com as variáveis substituídas, como o contato vai ver. */
export function renderTemplatePreview(
  components: TemplateComponent[],
  values: Record<string, string>,
): TemplatePreview {
  const variables = templateVariables(components);
  const header = templateHeaderText(components);

  return {
    header: header
      ? renderTemplateText(
          header,
          valuesFor(variables, values, (v) => v.component === 'header'),
        )
      : null,
    body: renderTemplateText(
      templateBodyText(components),
      valuesFor(variables, values, (v) => v.component === 'body'),
    ),
    footer: templateFooterText(components),
    buttons: templateButtons(components),
  };
}

/**
 * O texto que vai para a bolha da conversa e para a prévia da lista.
 *
 * Guardamos o resultado renderizado, e não o nome do template: quem atende
 * precisa ver o que o cliente recebeu, não `cobranca_v2`.
 */
export function renderTemplateMessage(
  components: TemplateComponent[],
  values: Record<string, string>,
): string {
  const preview = renderTemplatePreview(components, values);

  return [preview.header, preview.body, preview.footer]
    .filter((part): part is string => Boolean(part?.trim()))
    .join('\n\n');
}

/** Nomes das variáveis que ficaram sem valor. Vazio significa pronto para enviar. */
export function missingTemplateVariables(
  components: TemplateComponent[],
  values: Record<string, string>,
): TemplateVariable[] {
  return templateVariables(components).filter(
    (variable) => !values[variable.key]?.trim(),
  );
}
