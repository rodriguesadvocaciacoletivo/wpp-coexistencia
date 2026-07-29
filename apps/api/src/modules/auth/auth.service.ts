import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type {
  AuthSessionDto,
  InvitationPreviewDto,
  UserDto,
} from '@coexistente/shared';
import { ROLE_LABELS } from '@coexistente/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PasswordService } from '../../common/crypto/password.service';
import { generateToken, hashToken } from '../../common/crypto/tokens';
import { AuditService } from '../../common/audit/audit.service';
import { toUserDto } from '../../common/mappers/user.mapper';
import { MailService } from '../mail/mail.service';
import {
  renderPasswordResetEmail,
  renderWelcomeEmail,
} from '../mail/mail.templates';
import {
  RefreshTokenService,
  type IssuedRefreshToken,
  type RefreshContext,
} from './refresh-token.service';

const PASSWORD_RESET_TTL_MINUTES = 60;

export interface SessionResult {
  session: AuthSessionDto;
  refresh: IssuedRefreshToken;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessTtl: string;
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.accessTtl = config.get<string>('JWT_ACCESS_TTL') ?? '15m';
    this.appUrl = config.getOrThrow<string>('APP_URL');
  }

  async login(
    email: string,
    password: string,
    context: RefreshContext,
  ): Promise<SessionResult> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Mensagem única para e-mail inexistente, senha errada e convite pendente.
    // Diferenciar os casos entregaria a um atacante a informação de quais
    // e-mails existem na plataforma.
    const invalid = new UnauthorizedException('E-mail ou senha incorretos.');

    if (!user || !user.passwordHash) {
      // Custo artificial para igualar o tempo de resposta ao do caminho em que
      // a verificação do argon2 realmente acontece.
      await this.passwords.verify(
        '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$0000000000000000000000000000000000000000000',
        password,
      );
      throw invalid;
    }

    const matches = await this.passwords.verify(user.passwordHash, password);

    if (!matches) {
      throw invalid;
    }

    if (user.status === 'disabled') {
      throw new UnauthorizedException(
        'Esta conta foi desativada. Fale com um administrador.',
      );
    }

    if (user.status === 'invited') {
      throw invalid;
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.audit.record({
      userId: user.id,
      action: 'auth.login',
      entity: 'user',
      entityId: user.id,
      ipAddress: context.ipAddress,
    });

    return this.buildSession(toUserDto(updated), context);
  }

  async refresh(
    presentedToken: string,
    context: RefreshContext,
  ): Promise<SessionResult> {
    const { userId, refresh } = await this.refreshTokens.rotate(
      presentedToken,
      context,
    );

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const dto = toUserDto(user);

    return {
      session: {
        accessToken: await this.signAccessToken(dto),
        expiresIn: this.accessTtlSeconds(),
        user: dto,
      },
      refresh,
    };
  }

  async logout(presentedToken: string | undefined): Promise<void> {
    if (presentedToken) {
      await this.refreshTokens.revoke(presentedToken);
    }
  }

  async me(userId: string): Promise<UserDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    return toUserDto(user);
  }

  /**
   * Início da recuperação de senha.
   *
   * Sempre retorna sucesso, exista o e-mail ou não. Isso impede que a tela de
   * "esqueci minha senha" vire um oráculo de quais endereços têm conta.
   */
  async forgotPassword(email: string, ipAddress: string | null): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || user.status !== 'active') {
      this.logger.log(
        `Recuperação de senha solicitada para endereço sem conta ativa: ${email}`,
      );
      return;
    }

    // Invalida pedidos anteriores ainda abertos: um usuário que clicou duas
    // vezes não deve ficar com dois links válidos circulando por e-mail.
    await this.prisma.passwordReset.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const { token, hash } = generateToken();

    await this.prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000),
      },
    });

    await this.mail.sendQuietly(
      user.email,
      renderPasswordResetEmail({
        name: user.name,
        link: `${this.appUrl}/redefinir-senha?token=${token}`,
        expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
      }),
    );

    await this.audit.record({
      userId: user.id,
      action: 'auth.password_reset_requested',
      entity: 'user',
      entityId: user.id,
      ipAddress,
    });
  }

  async resetPassword(
    token: string,
    newPassword: string,
    ipAddress: string | null,
  ): Promise<void> {
    const record = await this.prisma.passwordReset.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        'Este link é inválido ou já expirou. Solicite uma nova recuperação de senha.',
      );
    }

    const passwordHash = await this.passwords.hash(newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordReset.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // Trocar a senha derruba as sessões existentes. Se a troca aconteceu porque
    // a conta foi comprometida, manter sessões vivas anularia o efeito.
    await this.refreshTokens.revokeAllForUser(record.userId);

    await this.audit.record({
      userId: record.userId,
      action: 'auth.password_reset_completed',
      entity: 'user',
      entityId: record.userId,
      ipAddress,
    });
  }

  /** Dados públicos do convite, para a tela de definição de senha. */
  async previewInvitation(token: string): Promise<InvitationPreviewDto> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
    });

    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.revokedAt ||
      invitation.expiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException(
        'Este convite é inválido, já foi usado ou expirou. Peça um novo a um administrador.',
      );
    }

    return { name: invitation.name, email: invitation.email };
  }

  async acceptInvitation(
    token: string,
    password: string,
    context: RefreshContext,
  ): Promise<SessionResult> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
    });

    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.revokedAt ||
      invitation.expiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException(
        'Este convite é inválido, já foi usado ou expirou. Peça um novo a um administrador.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { email: invitation.email },
    });

    if (!user) {
      throw new BadRequestException(
        'A conta vinculada a este convite não existe mais.',
      );
    }

    const passwordHash = await this.passwords.hash(password);

    const [activated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, status: 'active', role: invitation.role },
      }),
      this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      userId: activated.id,
      action: 'user.invitation_accepted',
      entity: 'user',
      entityId: activated.id,
      metadata: { role: activated.role },
      ipAddress: context.ipAddress ?? null,
    });

    await this.mail.sendQuietly(
      activated.email,
      renderWelcomeEmail({ name: activated.name, link: this.appUrl }),
    );

    this.logger.log(
      `Convite aceito por ${activated.email} (${ROLE_LABELS[activated.role]})`,
    );

    return this.buildSession(toUserDto(activated), context);
  }

  private async buildSession(
    user: UserDto,
    context: RefreshContext,
  ): Promise<SessionResult> {
    const refresh = await this.refreshTokens.issue(user.id, context);

    return {
      session: {
        accessToken: await this.signAccessToken(user),
        expiresIn: this.accessTtlSeconds(),
        user,
      },
      refresh,
    };
  }

  private signAccessToken(user: UserDto): Promise<string> {
    return this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
  }

  private accessTtlSeconds(): number {
    const match = /^(\d+)([smhd])$/.exec(this.accessTtl);

    if (!match) {
      return 900;
    }

    const amount = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };

    return amount * (multipliers[unit as string] ?? 60);
  }
}
