import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetaApiError, type GraphApiErrorBody } from './meta.errors';
import type {
  GraphPaged,
  GraphPhoneNumber,
  GraphSubscribedApp,
  GraphTemplate,
  GraphWaba,
} from './meta.types';

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TEMPLATE_PAGES = 40; // 40 × 100 = 2000 templates, teto de segurança

/**
 * Cliente da Graph API da Meta.
 *
 * A versão da API fica centralizada em configuração, e não espalhada pelas
 * URLs: a Meta descontinua versões com prazo, e a atualização precisa ser uma
 * variável de ambiente, não uma varredura no código.
 */
@Injectable()
export class MetaGraphService {
  private readonly logger = new Logger(MetaGraphService.name);
  private readonly baseUrl: string;
  private readonly version: string;

  constructor(config: ConfigService) {
    this.version = config.get<string>('META_GRAPH_VERSION') ?? 'v25.0';
    this.baseUrl = `https://graph.facebook.com/${this.version}`;
  }

  get apiVersion(): string {
    return this.version;
  }

  /** Dados do número: nome de exibição, verificação, qualidade e throughput. */
  getPhoneNumber(phoneNumberId: string, token: string): Promise<GraphPhoneNumber> {
    return this.request<GraphPhoneNumber>(
      `/${phoneNumberId}`,
      token,
      {
        fields:
          'id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type,throughput,messaging_limit_tier',
      },
    );
  }

  /** Dados da conta do WhatsApp Business. */
  getWaba(wabaId: string, token: string): Promise<GraphWaba> {
    return this.request<GraphWaba>(`/${wabaId}`, token, {
      fields: 'id,name,currency,timezone_id,account_review_status,message_template_namespace',
    });
  }

  /** Números pertencentes à WABA — usado para conferir se o número é dela. */
  async listPhoneNumbers(wabaId: string, token: string): Promise<GraphPhoneNumber[]> {
    const response = await this.request<GraphPaged<GraphPhoneNumber>>(
      `/${wabaId}/phone_numbers`,
      token,
      {
        fields:
          'id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type,throughput',
        limit: '100',
      },
    );

    return response.data ?? [];
  }

  /** Assina o app nos webhooks da WABA. Idempotente do lado da Meta. */
  async subscribeApp(wabaId: string, token: string): Promise<boolean> {
    const response = await this.request<{ success?: boolean }>(
      `/${wabaId}/subscribed_apps`,
      token,
      undefined,
      { method: 'POST' },
    );

    return response.success !== false;
  }

  async listSubscribedApps(wabaId: string, token: string): Promise<GraphSubscribedApp[]> {
    const response = await this.request<GraphPaged<GraphSubscribedApp>>(
      `/${wabaId}/subscribed_apps`,
      token,
    );

    return response.data ?? [];
  }

  /**
   * Todos os templates da WABA, percorrendo a paginação até o fim.
   *
   * Buscar só a primeira página é um erro silencioso e caro: a caixa parece
   * conectada, mas templates somem da lista sem nenhum aviso.
   */
  async listAllTemplates(wabaId: string, token: string): Promise<GraphTemplate[]> {
    const templates: GraphTemplate[] = [];
    let after: string | undefined;
    let pages = 0;

    do {
      const page = await this.request<GraphPaged<GraphTemplate>>(
        `/${wabaId}/message_templates`,
        token,
        {
          fields: 'id,name,language,status,category,components,rejected_reason,quality_score',
          limit: '100',
          ...(after ? { after } : {}),
        },
      );

      templates.push(...(page.data ?? []));
      after = page.paging?.cursors?.after;
      pages += 1;

      // Só continua se a Meta indicar explicitamente que há próxima página.
      if (!page.paging?.next) {
        break;
      }
    } while (after && pages < MAX_TEMPLATE_PAGES);

    if (pages >= MAX_TEMPLATE_PAGES) {
      this.logger.warn(
        `Sincronização de templates da WABA ${wabaId} parou no limite de ${MAX_TEMPLATE_PAGES} páginas.`,
      );
    }

    return templates;
  }

  /** Cria um template. Ele nasce PENDING e a Meta avalia de forma assíncrona. */
  createTemplate(
    wabaId: string,
    token: string,
    payload: Record<string, unknown>,
  ): Promise<{ id: string; status: string; category: string }> {
    return this.request(`/${wabaId}/message_templates`, token, undefined, {
      method: 'POST',
      body: payload,
    });
  }

  /** Exclui um template pelo nome — a Meta remove todos os idiomas dele. */
  deleteTemplate(
    wabaId: string,
    token: string,
    name: string,
  ): Promise<{ success?: boolean }> {
    return this.request(
      `/${wabaId}/message_templates`,
      token,
      { name },
      { method: 'DELETE' },
    );
  }

  private async request<T>(
    path: string,
    token: string,
    query?: Record<string, string>,
    options: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);

    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, value);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: options.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      const text = await response.text();
      const payload: unknown = text ? JSON.parse(text) : {};

      if (!response.ok) {
        throw this.buildError(response.status, payload);
      }

      return payload as T;
    } catch (error) {
      if (error instanceof MetaApiError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new MetaApiError(
          504,
          null,
          null,
          `A Meta não respondeu em ${DEFAULT_TIMEOUT_MS / 1000} segundos.`,
          null,
          null,
        );
      }

      throw new MetaApiError(
        0,
        null,
        null,
        error instanceof Error ? error.message : 'Falha de rede ao contatar a Meta.',
        null,
        null,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildError(status: number, payload: unknown): MetaApiError {
    const body = payload as GraphApiErrorBody;
    const details = body.error;

    // `error_user_msg` é o texto que a Meta escreve para ser lido por humanos;
    // quando existe, é sempre mais útil que a mensagem técnica.
    const message =
      details?.error_user_msg ??
      details?.message ??
      `A Meta respondeu com HTTP ${status}.`;

    return new MetaApiError(
      status,
      details?.code ?? null,
      details?.error_subcode ?? null,
      message,
      details?.fbtrace_id ?? null,
      payload,
    );
  }
}
