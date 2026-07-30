import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

/**
 * Autoriza as rotas de cron.
 *
 * A Vercel chama os cron jobs por HTTP, com `Authorization: Bearer $CRON_SECRET`.
 * Como são rotas públicas — não há usuário logado por trás de um agendador — o
 * segredo é a única barreira. Sem `CRON_SECRET` configurado, tudo é recusado:
 * é preferível o cron não rodar a deixar um endereço que processa a fila
 * exposto a quem descobrir a URL.
 */
@Injectable()
export class CronGuard implements CanActivate {
  private readonly logger = new Logger(CronGuard.name);
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.secret = config.get<string>('CRON_SECRET') ?? '';
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.secret) {
      this.logger.error(
        'CRON_SECRET não configurado — rota de cron recusada. Defina a variável para habilitar o processamento agendado.',
      );
      throw new ForbiddenException('Rota de cron não habilitada.');
    }

    const header = context
      .switchToHttp()
      .getRequest<Request>()
      .headers.authorization;

    if (!header?.startsWith('Bearer ') || !this.matches(header.slice(7))) {
      throw new ForbiddenException('Credencial de cron inválida.');
    }

    return true;
  }

  /** Comparação em tempo constante: o segredo não vaza pelo tempo de resposta. */
  private matches(provided: string): boolean {
    const a = Buffer.from(provided);
    const b = Buffer.from(this.secret);

    return a.length === b.length && timingSafeEqual(a, b);
  }
}
