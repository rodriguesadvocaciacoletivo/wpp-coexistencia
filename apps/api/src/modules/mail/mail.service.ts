import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import { CryptoService } from '../../common/crypto/crypto.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RenderedEmail } from './mail.templates';

export interface ResolvedSmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  password: string | null;
  fromName: string;
  fromEmail: string;
  /** De onde veio a configuração — útil no diagnóstico do administrador. */
  source: 'database' | 'environment';
}

export class SmtpNotConfiguredError extends Error {
  constructor() {
    super(
      'Nenhum servidor SMTP configurado. Configure em Configurações → SMTP antes de enviar e-mails.',
    );
    this.name = 'SmtpNotConfiguredError';
  }
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Resolve a configuração ativa de SMTP.
   *
   * A configuração salva no banco pelo administrador tem precedência. As
   * variáveis de ambiente existem como rede de segurança para o cenário de
   * bootstrap: instalação nova, ninguém logado ainda, primeiro convite
   * precisando sair. Sem esse fallback o sistema trava em si mesmo.
   */
  async resolveConfig(): Promise<ResolvedSmtpConfig | null> {
    const stored = await this.prisma.smtpSettings.findUnique({
      where: { id: 'default' },
    });

    if (stored) {
      return {
        host: stored.host,
        port: stored.port,
        secure: stored.secure,
        username: stored.username,
        password: stored.passwordEncrypted
          ? this.crypto.decrypt(stored.passwordEncrypted)
          : null,
        fromName: stored.fromName,
        fromEmail: stored.fromEmail,
        source: 'database',
      };
    }

    const host = this.config.get<string>('SMTP_HOST');
    const port = this.config.get<number>('SMTP_PORT');
    const fromEmail = this.config.get<string>('SMTP_FROM_EMAIL');

    if (!host || !port || !fromEmail) {
      return null;
    }

    return {
      host,
      port,
      secure: this.config.get<boolean>('SMTP_SECURE') ?? false,
      username: this.config.get<string>('SMTP_USER') || null,
      password: this.config.get<string>('SMTP_PASSWORD') || null,
      fromName: this.config.get<string>('SMTP_FROM_NAME') ?? 'Atendimento',
      fromEmail,
      source: 'environment',
    };
  }

  async send(to: string, email: RenderedEmail): Promise<void> {
    const config = await this.resolveConfig();

    if (!config) {
      throw new SmtpNotConfiguredError();
    }

    await this.dispatch(config, to, email);
  }

  /**
   * Envia usando uma configuração específica, sem consultar o banco.
   * É o que permite testar credenciais novas antes de salvá-las.
   */
  async sendWith(
    config: ResolvedSmtpConfig,
    to: string,
    email: RenderedEmail,
  ): Promise<void> {
    await this.dispatch(config, to, email);
  }

  /**
   * Envio que não propaga erro.
   *
   * Usado onde a falha de e-mail não deve reverter a operação — o caso claro é
   * o de boas-vindas depois do aceite de convite: a conta já foi ativada, e
   * devolver erro faria o usuário achar que precisa repetir o processo.
   */
  async sendQuietly(to: string, email: RenderedEmail): Promise<boolean> {
    try {
      await this.send(to, email);
      return true;
    } catch (error) {
      this.logger.warn(
        `Falha ao enviar "${email.subject}" para ${to}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  private async dispatch(
    config: ResolvedSmtpConfig,
    to: string,
    email: RenderedEmail,
  ): Promise<void> {
    const transporter = this.createTransporter(config);

    try {
      await transporter.sendMail({
        from: { name: config.fromName, address: config.fromEmail },
        to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });

      this.logger.log(`E-mail "${email.subject}" enviado para ${to}`);
    } finally {
      transporter.close();
    }
  }

  private createTransporter(config: ResolvedSmtpConfig): Transporter {
    return createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.username
        ? { user: config.username, pass: config.password ?? '' }
        : undefined,
      // Sem credenciais e sem TLS é o perfil do Mailhog em desenvolvimento.
      // Em produção, host e porta reais com STARTTLS na 587 ou TLS na 465.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
}
