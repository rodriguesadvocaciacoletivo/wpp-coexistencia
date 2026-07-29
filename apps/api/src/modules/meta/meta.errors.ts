import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

/** Formato de erro da Graph API. */
export interface GraphApiErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_user_title?: string;
    error_user_msg?: string;
    fbtrace_id?: string;
  };
}

export class MetaApiError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly code: number | null,
    readonly subcode: number | null,
    message: string,
    readonly traceId: string | null,
    readonly raw: unknown,
  ) {
    super(message);
    this.name = 'MetaApiError';
  }

  /**
   * Erros que provavelmente se resolvem sozinhos: instabilidade da Meta,
   * limite de taxa, timeout. Apenas estes valem retry.
   */
  get retryable(): boolean {
    if (this.httpStatus >= 500) {
      return true;
    }

    // 4 = limite da aplicação, 80007 = limite da WABA, 613 = throttle,
    // 130429 = taxa de mensagens, 131048 = limite de pares.
    return [4, 613, 80007, 130429, 131048].includes(this.code ?? -1);
  }

  /**
   * O token deixou de valer — expirou, foi revogado, ou o usuário do sistema
   * perdeu acesso ao ativo. Exige ação do administrador, não retry.
   */
  get isAuthError(): boolean {
    return (
      this.httpStatus === 401 ||
      [190, 102, 200, 10, 3].includes(this.code ?? -1)
    );
  }
}

/**
 * Traduz o erro da Meta para algo acionável.
 *
 * A mensagem crua da Graph API costuma ser genérica ("Unsupported get
 * request") e não diz o que o administrador precisa corrigir. O mapeamento
 * abaixo cobre os casos que realmente aparecem ao conectar uma caixa.
 */
export function describeMetaError(error: MetaApiError): string {
  const code = error.code ?? -1;
  const subcode = error.subcode ?? -1;

  if (code === 190) {
    if (subcode === 463) {
      return 'O token expirou. Gere um novo System User Token no Business Manager.';
    }
    if (subcode === 467) {
      return 'O token foi invalidado — normalmente porque a senha da conta mudou ou o acesso foi revogado.';
    }
    return 'Token inválido ou expirado. Verifique o System User Token no Business Manager.';
  }

  if (code === 200 || code === 10 || code === 3) {
    return 'O token não tem permissão para este ativo. Confirme se o usuário do sistema tem acesso à WABA e ao número, e se o app tem whatsapp_business_management e whatsapp_business_messaging.';
  }

  if (code === 100) {
    if (subcode === 33) {
      return 'Ativo não encontrado. Confira o ID do número de telefone e o ID da conta do WhatsApp Business — e se o token informado pertence à mesma empresa.';
    }
    return `A Meta recusou a requisição: ${error.message}`;
  }

  if (code === 4 || code === 80007 || code === 613) {
    return 'Limite de requisições da Meta atingido. Aguarde alguns minutos e tente novamente.';
  }

  if (error.httpStatus >= 500) {
    return 'A Meta está instável no momento. Tente novamente em alguns minutos.';
  }

  return error.message || 'Erro desconhecido ao falar com a Meta.';
}

/** Converte o erro da Meta na exceção HTTP correspondente da nossa API. */
export function toHttpException(error: MetaApiError): Error {
  const message = describeMetaError(error);

  // Instabilidade e limite de taxa não são culpa de quem chamou: 503 sinaliza
  // "tente de novo", enquanto 400 diria "corrija os dados", o que estaria errado.
  if (error.retryable) {
    return new ServiceUnavailableException(message);
  }

  return new BadRequestException(message);
}
