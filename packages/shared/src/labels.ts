/**
 * O necessário para desenhar uma etiqueta na tela.
 *
 * Vem embutido na conversa, e por isso é enxuto: a lista de conversas carrega
 * dezenas por vez, e repetir contadores e datas em cada uma seria peso morto.
 */
export interface LabelRefDto {
  id: string;
  name: string;
  color: string;
}

export interface LabelDto extends LabelRefDto {
  /** Quantas conversas usam esta etiqueta. Alimenta o aviso de exclusão. */
  conversationCount: number;
  createdAt: string;
}

export interface CreateLabelInput {
  name: string;
  color: string;
}

export interface UpdateLabelInput {
  name?: string;
  color?: string;
}

/**
 * Paleta sugerida na criação.
 *
 * Escolhida para funcionar sobre o fundo escuro da aplicação e para os tons
 * continuarem distinguíveis lado a lado — etiqueta serve para bater o olho e
 * reconhecer, o que exige contraste entre elas, não só com o fundo.
 */
export const LABEL_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#64748b',
] as const;

export const LABEL_NAME_MAX = 60;

/** `#RGB` não é aceito: a interface assume seis dígitos ao clarear a cor. */
export function isValidLabelColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

/**
 * Normaliza o nome antes de gravar e de comparar.
 *
 * Espaços internos são colapsados porque "em espera" e "em  espera" seriam
 * dois registros distintos para o banco e a mesma etiqueta para quem lê.
 */
export function normalizeLabelName(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Chave de comparação para duplicidade: sem acento, sem caixa. */
export function labelNameKey(value: string): string {
  return normalizeLabelName(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}
