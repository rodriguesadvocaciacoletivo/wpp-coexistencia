import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { generateToken, hashToken } from '../../common/crypto/tokens';

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

export interface RefreshContext {
  userAgent?: string | null;
  ipAddress?: string | null;
}

@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);
  private readonly ttlDays: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.ttlDays = config.get<number>('REFRESH_TOKEN_TTL_DAYS') ?? 7;
  }

  async issue(
    userId: string,
    context: RefreshContext = {},
  ): Promise<IssuedRefreshToken> {
    const { token, hash } = generateToken();
    const expiresAt = new Date(
      Date.now() + this.ttlDays * 24 * 60 * 60 * 1000,
    );

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hash,
        expiresAt,
        userAgent: context.userAgent ?? null,
        ipAddress: context.ipAddress ?? null,
      },
    });

    return { token, expiresAt };
  }

  /**
   * Consome um refresh token e emite outro no lugar (rotação).
   *
   * A rotação permite detectar roubo de token: se um token já revogado é
   * apresentado de novo, ou o cliente está com uma cópia velha ou alguém
   * interceptou a anterior. Nos dois casos a resposta é a mesma e é a
   * conservadora — derrubar todas as sessões do usuário e obrigar novo login.
   */
  async rotate(
    presentedToken: string,
    context: RefreshContext = {},
  ): Promise<{ userId: string; refresh: IssuedRefreshToken }> {
    const tokenHash = hashToken(presentedToken);

    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!existing) {
      throw new UnauthorizedException('Sessão inválida. Faça login novamente.');
    }

    if (existing.revokedAt) {
      this.logger.warn(
        `Reuso de refresh token detectado para o usuário ${existing.userId}. Revogando todas as sessões.`,
      );
      await this.revokeAllForUser(existing.userId);
      throw new UnauthorizedException('Sessão inválida. Faça login novamente.');
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }

    if (existing.user.status !== 'active') {
      await this.revokeAllForUser(existing.userId);
      throw new UnauthorizedException('Esta conta não está ativa.');
    }

    const replacement = await this.issue(existing.userId, context);

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: {
        revokedAt: new Date(),
        replacedById: await this.findIdByToken(replacement.token),
      },
    });

    return { userId: existing.userId, refresh: replacement };
  }

  async revoke(presentedToken: string): Promise<void> {
    const tokenHash = hashToken(presentedToken);

    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Limpeza de tokens expirados. Chamada pelo scheduler a partir da Fase 2. */
  async purgeExpired(): Promise<number> {
    const result = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    return result.count;
  }

  private async findIdByToken(token: string): Promise<string | null> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { id: true },
    });

    return record?.id ?? null;
  }
}
