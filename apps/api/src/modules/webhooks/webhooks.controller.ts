import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/auth/decorators';
import { isValidMetaSignature } from './webhook-signature';
import { WebhooksService } from './webhooks.service';

/**
 * Endpoint público de webhooks da Meta.
 *
 * Responde 200 assim que o evento é persistido — a Meta espera confirmação em
 * poucos segundos e reentrega o que não for confirmado. Processar antes de
 * responder transformaria qualquer lentidão em uma avalanche de reentregas.
 */
@Public()
// Sem rate limit: o limitador não distingue a Meta de um atacante, e recusar
// eventos legítimos em um pico de mensagens custaria conversas perdidas. A
// proteção aqui é a assinatura HMAC.
@SkipThrottle()
@Controller('webhooks/meta')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);
  private readonly verifyToken: string;
  private readonly appSecret: string;

  constructor(
    private readonly webhooks: WebhooksService,
    config: ConfigService,
  ) {
    this.verifyToken = config.get<string>('META_WEBHOOK_VERIFY_TOKEN') ?? '';
    this.appSecret = config.get<string>('META_APP_SECRET') ?? '';
  }

  /** Verificação de posse da URL, feita uma vez ao cadastrar o webhook. */
  @Get()
  @Header('Content-Type', 'text/plain')
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    if (!this.verifyToken) {
      this.logger.error(
        'META_WEBHOOK_VERIFY_TOKEN não configurado — a verificação do webhook vai falhar.',
      );
      throw new ForbiddenException();
    }

    if (mode !== 'subscribe' || token !== this.verifyToken) {
      this.logger.warn('Tentativa de verificação de webhook com token inválido.');
      throw new ForbiddenException();
    }

    this.logger.log('Webhook verificado com sucesso pela Meta.');
    return challenge;
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(@Req() request: RawBodyRequest<Request>): Promise<string> {
    const rawBody = request.rawBody;

    if (!rawBody) {
      throw new BadRequestException('Corpo da requisição ausente.');
    }

    const signature = request.headers['x-hub-signature-256'];

    if (
      !isValidMetaSignature(
        rawBody,
        typeof signature === 'string' ? signature : undefined,
        this.appSecret,
      )
    ) {
      this.logger.warn(
        `Webhook com assinatura inválida recusado (origem: ${request.ip ?? 'desconhecida'}).`,
      );
      throw new ForbiddenException();
    }

    // Persiste e devolve. O processamento acontece fora do ciclo da requisição.
    await this.webhooks.enqueue(request.body as unknown);

    return 'EVENT_RECEIVED';
  }
}
