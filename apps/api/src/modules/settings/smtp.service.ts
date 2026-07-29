import { Injectable } from '@nestjs/common';
import type { SmtpSettingsDto, SmtpTestResultDto } from '@coexistente/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AuditService } from '../../common/audit/audit.service';
import { MailService } from '../mail/mail.service';
import { renderSmtpTestEmail } from '../mail/mail.templates';
import type { ActorContext } from '../users/users.service';
import type { TestSmtpDto, UpdateSmtpDto } from './dto/smtp.dto';

const SETTINGS_ID = 'default';

@Injectable()
export class SmtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<SmtpSettingsDto | null> {
    const settings = await this.prisma.smtpSettings.findUnique({
      where: { id: SETTINGS_ID },
    });

    if (!settings) {
      return null;
    }

    return {
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      username: settings.username,
      // A senha nunca sai daqui. O frontend só precisa saber se existe uma.
      hasPassword: Boolean(settings.passwordEncrypted),
      fromName: settings.fromName,
      fromEmail: settings.fromEmail,
      updatedAt: settings.updatedAt.toISOString(),
    };
  }

  async update(
    input: UpdateSmtpDto,
    actor: ActorContext,
  ): Promise<SmtpSettingsDto> {
    const existing = await this.prisma.smtpSettings.findUnique({
      where: { id: SETTINGS_ID },
    });

    const passwordEncrypted = this.resolvePassword(
      input.password,
      existing?.passwordEncrypted ?? null,
    );

    const data = {
      host: input.host,
      port: input.port,
      secure: input.secure,
      username: input.username?.trim() || null,
      passwordEncrypted,
      fromName: input.fromName,
      fromEmail: input.fromEmail,
    };

    await this.prisma.smtpSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...data },
      update: data,
    });

    await this.audit.record({
      userId: actor.actorId,
      action: 'settings.smtp_updated',
      entity: 'smtp_settings',
      entityId: SETTINGS_ID,
      // Host e porta entram na trilha; senha e usuário, não.
      metadata: { host: input.host, port: input.port, secure: input.secure },
      ipAddress: actor.ipAddress,
    });

    const saved = await this.get();

    if (!saved) {
      throw new Error('Falha ao salvar a configuração de SMTP.');
    }

    return saved;
  }

  /**
   * Envia um e-mail de teste com a configuração ativa.
   *
   * Devolve `success: false` com a mensagem do servidor em vez de lançar erro:
   * "autenticação recusada" ou "host não encontrado" é o diagnóstico que o
   * administrador precisa ler na tela, não um 500 genérico.
   */
  async sendTestEmail(
    input: TestSmtpDto,
    actor: ActorContext,
  ): Promise<SmtpTestResultDto> {
    const config = await this.mail.resolveConfig();

    if (!config) {
      return {
        success: false,
        message:
          'Nenhuma configuração de SMTP encontrada. Salve os dados do servidor antes de testar.',
      };
    }

    try {
      await this.mail.sendWith(config, input.to, renderSmtpTestEmail());

      await this.audit.record({
        userId: actor.actorId,
        action: 'settings.smtp_tested',
        entity: 'smtp_settings',
        entityId: SETTINGS_ID,
        metadata: { to: input.to, result: 'success', source: config.source },
        ipAddress: actor.ipAddress,
      });

      return {
        success: true,
        message: `E-mail de teste enviado para ${input.to}.`,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erro desconhecido.';

      await this.audit.record({
        userId: actor.actorId,
        action: 'settings.smtp_tested',
        entity: 'smtp_settings',
        entityId: SETTINGS_ID,
        metadata: { to: input.to, result: 'failure', error: message },
        ipAddress: actor.ipAddress,
      });

      return {
        success: false,
        message: `Falha ao enviar: ${message}`,
      };
    }
  }

  private resolvePassword(
    provided: string | null | undefined,
    current: string | null,
  ): string | null {
    if (provided === undefined) {
      return current; // não informada — preserva a existente
    }

    if (provided === null || provided === '') {
      return null; // limpeza explícita
    }

    return this.crypto.encrypt(provided);
  }
}
