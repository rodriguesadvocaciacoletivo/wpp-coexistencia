import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InboxesService } from './inboxes.service';
import { TemplatesService } from '../templates/templates.service';

/**
 * Jobs periódicos das caixas de entrada.
 *
 * Ambos existem pelo mesmo motivo: o estado da Meta muda sem nos avisar.
 * Um System User Token pode ser revogado no Business Manager, um número pode
 * sair da WABA, e um template pode ser pausado por qualidade. Sem verificação
 * periódica, a plataforma só descobre isso quando um atendente tenta responder
 * um cliente e falha.
 *
 * Os decoradores `@Cron` só valem onde o ScheduleModule é registrado, ou seja,
 * fora da Vercel. Em serverless os mesmos métodos são chamados pelas rotas de
 * `/jobs`, acionadas pelo cron da plataforma.
 *
 * Duas execuções podem se sobrepor — não há trava distribuída. Para o que
 * fazem aqui, o pior caso é trabalho repetido: revalidar uma credencial já
 * revalidada e reescrever um template com o mesmo conteúdo. Nada que corrompa
 * estado. Se algum job passar a fazer coisa não idempotente, isso muda.
 */
@Injectable()
export class InboxesScheduler {
  private readonly logger = new Logger(InboxesScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inboxes: InboxesService,
    private readonly templates: TemplatesService,
  ) {}

  /** Verifica se as credenciais de cada caixa continuam válidas. */
  @Cron(CronExpression.EVERY_30_MINUTES, { name: 'inbox-health-check' })
  async checkConnections(): Promise<void> {
    const inboxes = await this.prisma.inbox.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    });

    if (inboxes.length === 0) {
      return;
    }

    let failed = 0;

    for (const inbox of inboxes) {
      try {
        // Sem contexto de ator: a falha marca a caixa com erro e segue para a
        // próxima, em vez de interromper a varredura inteira.
        await this.inboxes.revalidate(inbox.id);
      } catch (error) {
        failed += 1;
        this.logger.warn(
          `Health check da caixa "${inbox.name}" falhou: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    this.logger.log(
      `Health check concluído: ${inboxes.length} caixa(s), ${failed} com falha.`,
    );
  }

  /**
   * Re-sincroniza os templates a cada 6 horas.
   *
   * O webhook `message_template_status_update` cobre as mudanças em tempo real
   * a partir da Fase 3, mas ele não recupera eventos perdidos durante uma
   * indisponibilidade. Este job é a rede de segurança.
   */
  @Cron(CronExpression.EVERY_6_HOURS, { name: 'template-resync' })
  async resyncTemplates(): Promise<void> {
    const inboxes = await this.prisma.inbox.findMany({
      where: { deletedAt: null, connectionStatus: 'connected' },
      select: { id: true, name: true },
    });

    for (const inbox of inboxes) {
      try {
        const result = await this.templates.sync(inbox.id);
        this.logger.log(
          `Templates da caixa "${inbox.name}": ${result.synced} sincronizados.`,
        );
      } catch (error) {
        this.logger.warn(
          `Re-sync de templates da caixa "${inbox.name}" falhou: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  /**
   * Limpa convites, tokens de recuperação e refresh tokens vencidos.
   *
   * Todos já são recusados pela data na validação — a limpeza é higiene de
   * banco, não segurança.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM, { name: 'expired-tokens-cleanup' })
  async purgeExpired(): Promise<void> {
    const now = new Date();

    const [refreshTokens, resets, invitations] = await this.prisma.$transaction([
      this.prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: now } } }),
      this.prisma.passwordReset.deleteMany({ where: { expiresAt: { lt: now } } }),
      this.prisma.invitation.deleteMany({
        where: { expiresAt: { lt: now }, acceptedAt: null },
      }),
    ]);

    this.logger.log(
      `Limpeza diária: ${refreshTokens.count} sessões, ${resets.count} recuperações e ${invitations.count} convites vencidos removidos.`,
    );
  }
}
