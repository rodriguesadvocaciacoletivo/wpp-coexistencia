import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { MessageStatus } from '@prisma/client';
import { parseCorsOrigins } from '../../config/env';
import type { AccessTokenPayload } from '../../common/auth/jwt-auth.guard';

/**
 * Push em tempo real para os agentes conectados.
 *
 * Tudo é emitido para a sala `account`, porque nesta fase todo agente enxerga
 * as conversas de todas as caixas em que participa e os contadores das abas
 * precisam se mover para todos ao mesmo tempo. Quando houver segmentação por
 * caixa, salas por `inbox:<id>` substituem isso.
 *
 * Cada evento carrega apenas identificadores. O cliente busca o dado atualizado
 * pela API — assim o payload não fica desatualizado em corrida com outra
 * alteração, e nenhum dado sensível trafega para quem não deveria vê-lo.
 */
@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly allowedOrigins: string[];

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.allowedOrigins = parseCorsOrigins(
      config.get<string>('CORS_ORIGINS') ?? '',
    );
  }

  async handleConnection(client: Socket): Promise<void> {
    const token =
      (client.handshake.auth as { token?: string } | undefined)?.token ??
      extractBearer(client.handshake.headers.authorization);

    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);

      client.data.userId = payload.sub;
      client.data.role = payload.role;

      await client.join('account');
      await client.join(`user:${payload.sub}`);

      this.logger.debug(`Agente ${payload.email} conectado ao tempo real.`);
    } catch {
      // Token inválido ou expirado: derruba a conexão. O cliente renova o
      // access token pelo fluxo normal e reconecta.
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    if (client.data.userId) {
      this.logger.debug(`Cliente ${String(client.data.userId)} desconectado.`);
    }
  }

  emitConversationCreated(conversationId: string): void {
    this.emit('conversation.created', { conversationId });
  }

  emitConversationUpdated(conversationId: string): void {
    this.emit('conversation.updated', { conversationId });
  }

  emitMessageCreated(conversationId: string, messageId: string): void {
    this.emit('message.created', { conversationId, messageId });
  }

  emitMessageStatus(
    conversationId: string,
    messageId: string,
    status: MessageStatus,
  ): void {
    this.emit('message.status_updated', { conversationId, messageId, status });
  }

  /** Notifica diretamente o agente que passou a ser responsável. */
  emitAssignedToUser(userId: string, conversationId: string): void {
    this.server?.to(`user:${userId}`).emit('conversation.assigned_to_me', {
      conversationId,
    });
  }

  emitInboxConnectionChanged(inboxId: string): void {
    this.emit('inbox.connection_changed', { inboxId });
  }

  private emit(event: string, payload: Record<string, unknown>): void {
    // O gateway pode não estar pronto durante testes ou no boot; emitir sem
    // servidor lançaria e derrubaria o processamento do webhook.
    this.server?.to('account').emit(event, payload);
  }

  /** Origens permitidas — exposto para diagnóstico. */
  get origins(): string[] {
    return this.allowedOrigins;
  }
}

function extractBearer(header: string | undefined): string | null {
  if (!header) {
    return null;
  }

  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}
