import type { AuthSessionDto } from '@coexistente/shared';

/**
 * Endereço da API.
 *
 * O padrão é `/api` — caminho relativo, mesma origem da interface. É assim que
 * a aplicação roda hospedada: um único projeto serve a tela e a API, o que
 * elimina CORS e, principalmente, evita que o cookie da sessão seja tratado
 * como de terceiros pelo navegador (bloqueio que derrubaria a sessão em
 * silêncio).
 *
 * Em desenvolvimento, VITE_API_URL aponta para a API rodando em outra porta.
 */
const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ??
  '/api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * O access token vive apenas em memória.
 *
 * Guardá-lo em localStorage o exporia a qualquer script injetado na página. O
 * custo é recarregar a página perder o token — resolvido pelo refresh silencioso
 * na inicialização, que usa o cookie httpOnly.
 */
let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

/** Teto padrão de espera por resposta da API. */
const DEFAULT_TIMEOUT_MS = 60_000;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Desativa a tentativa de renovar a sessão em caso de 401. */
  skipRefresh?: boolean;
  /** Sobrescreve o teto de espera desta requisição. */
  timeoutMs?: number;
}

/** Evita disparar várias renovações simultâneas quando o token expira. */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        return false;
      }

      const session = (await response.json()) as AuthSessionDto;
      accessToken = session.accessToken;
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const execute = async (): Promise<Response> => {
    const headers: Record<string, string> = {};

    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    return fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      credentials: 'include',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      // Prazo generoso: hospedagens que hibernam levam até um minuto para
      // acordar na primeira requisição. Sem teto nenhum, porém, uma API fora
      // do ar deixaria o botão girando por minutos.
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  };

  let response: Response;

  try {
    response = await execute();
  } catch (error) {
    // Falha de rede e timeout não produzem Response — sem este tratamento,
    // a exceção crua do fetch chegaria à interface como "Failed to fetch".
    throw new ApiError(
      0,
      error instanceof Error && error.name === 'TimeoutError'
        ? 'O servidor demorou demais para responder. Ele pode estar iniciando — tente de novo em alguns instantes.'
        : 'Não foi possível falar com o servidor. Verifique sua conexão.',
      error,
    );
  }

  // 401 em uma rota autenticada normalmente é só o access token de 15 minutos
  // vencendo. Renova uma vez e repete — o usuário não percebe.
  if (response.status === 401 && !options.skipRefresh && accessToken) {
    const renewed = await refreshSession();

    if (renewed) {
      response = await execute();
    } else {
      accessToken = null;
      onUnauthorized?.();
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await parseBody(response);

  if (!response.ok) {
    throw new ApiError(response.status, extractMessage(payload, response), payload);
  }

  return payload as T;
}

/**
 * Restaura a sessão a partir do cookie httpOnly, na abertura da aplicação.
 *
 * O timeout curto é essencial: esta chamada bloqueia a tela inicial inteira.
 * Sem ele, uma API lenta ou fora do ar deixa o usuário preso num "carregando"
 * indefinido — pior do que mostrar o login, porque não há nada que ele possa
 * fazer. Estourado o prazo, seguimos como não autenticado; se houver sessão
 * válida, ela é recuperada na primeira requisição bem-sucedida.
 */
const SESSION_RESTORE_TIMEOUT_MS = 8_000;

export async function restoreSession(): Promise<AuthSessionDto | null> {
  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      signal: AbortSignal.timeout(SESSION_RESTORE_TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    const session = (await response.json()) as AuthSessionDto;
    accessToken = session.accessToken;
    return session;
  } catch {
    return null;
  }
}

/**
 * Verifica se a API está no ar.
 *
 * Usado pela tela de login para diferenciar "credenciais erradas" de "servidor
 * indisponível" — dois problemas com causas e soluções completamente
 * diferentes, que sem isso produzem a mesma mensagem genérica.
 */
export async function checkApiHealth(
  timeoutMs = 5_000,
): Promise<'up' | 'down'> {
  try {
    const response = await fetch(`${API_URL}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });

    return response.ok ? 'up' : 'down';
  } catch {
    return 'down';
  }
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractMessage(payload: unknown, response: Response): string {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message: unknown }).message;

    if (typeof message === 'string') {
      return message;
    }

    // O ValidationPipe do Nest devolve um array de mensagens.
    if (Array.isArray(message) && typeof message[0] === 'string') {
      return message.join(' ');
    }
  }

  if (response.status >= 500) {
    return 'Erro no servidor. Tente novamente em instantes.';
  }

  return 'Não foi possível completar a operação.';
}
