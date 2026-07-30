import { Controller, Get, Logger, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/auth/decorators';
import { logEvent } from '../../common/logging/structured';
import { InboxesScheduler } from '../inboxes/inboxes.scheduler';
import { WebhooksService } from '../webhooks/webhooks.service';
import { CronGuard } from './cron.guard';

/**
 * Rotas acionadas pelo agendador da plataforma.
 *
 * Em serverless não existe processo contínuo para hospedar `@nestjs/schedule`
 * nem um consumidor de fila — o `ScheduleModule` só é registrado fora da
 * Vercel. Estas rotas são o equivalente: a plataforma chama por HTTP no
 * horário, e cada chamada faz o mesmo trabalho que o job faria.
 *
 * Públicas para o guard de autenticação (não há usuário por trás de um cron) e
 * protegidas pelo `CronGuard`, que exige o segredo compartilhado.
 *
 * `GET` porque é o método que a Vercel usa nos cron jobs. As rotas são
 * idempotentes: reservam da fila e processam, sem efeito colateral extra em
 * uma chamada repetida.
 */
@Public()
@SkipThrottle()
@UseGuards(CronGuard)
@Controller('jobs')
export class JobsController {
  private readonly logger = new Logger(JobsController.name);

  constructor(
    private readonly webhooks: WebhooksService,
    private readonly scheduler: InboxesScheduler,
  ) {}

  /**
   * Consome a fila de webhooks.
   *
   * O caminho feliz já é drenado logo após o ACK. Esta rota existe para o que
   * falhou e espera nova tentativa, e para o que ficou reservado por uma
   * invocação que morreu no meio.
   */
  @Get('drain')
  async drain(): Promise<{ processed: number; failed: number }> {
    const started = Date.now();
    const result = await this.webhooks.drain();

    logEvent('info', 'cron.drain', { ...result, durationMs: Date.now() - started });

    return result;
  }

  /** Health check das conexões. Equivale ao job de 30 minutos. */
  @Get('health-check')
  async healthCheck(): Promise<{ ok: true }> {
    await this.scheduler.checkConnections();
    logEvent('info', 'cron.health_check', {});

    return { ok: true };
  }

  /** Re-sync de templates. Equivale ao job de 6 horas. */
  @Get('resync-templates')
  async resyncTemplates(): Promise<{ ok: true }> {
    await this.scheduler.resyncTemplates();
    logEvent('info', 'cron.resync_templates', {});

    return { ok: true };
  }

  /** Limpeza de convites e tokens vencidos. Equivale ao job diário. */
  @Get('cleanup')
  async cleanup(): Promise<{ ok: true }> {
    await this.scheduler.purgeExpired();
    logEvent('info', 'cron.cleanup', {});

    return { ok: true };
  }
}
