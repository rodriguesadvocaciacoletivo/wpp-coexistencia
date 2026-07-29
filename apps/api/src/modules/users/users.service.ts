import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { InvitationDto, UserDto, UserRole } from '@coexistente/shared';
import { ROLE_LABELS } from '@coexistente/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { generateToken } from '../../common/crypto/tokens';
import { AuditService } from '../../common/audit/audit.service';
import { toUserDto } from '../../common/mappers/user.mapper';
import { MailService, SmtpNotConfiguredError } from '../mail/mail.service';
import { renderInvitationEmail } from '../mail/mail.templates';
import { RefreshTokenService } from '../auth/refresh-token.service';
import type { UpdateUserDto } from './dto/users.dto';

const INVITATION_TTL_HOURS = 48;

export interface ActorContext {
  actorId: string;
  ipAddress: string | null;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly refreshTokens: RefreshTokenService,
    config: ConfigService,
  ) {
    this.appUrl = config.getOrThrow<string>('APP_URL');
  }

  async list(): Promise<UserDto[]> {
    const users = await this.prisma.user.findMany({
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });

    return users.map(toUserDto);
  }

  async findOne(id: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    return toUserDto(user);
  }

  async listInvitations(): Promise<InvitationDto[]> {
    const invitations = await this.prisma.invitation.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const now = Date.now();

    return invitations.map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      name: invitation.name,
      role: invitation.role,
      expiresAt: invitation.expiresAt.toISOString(),
      acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
      createdAt: invitation.createdAt.toISOString(),
      pending:
        !invitation.acceptedAt &&
        !invitation.revokedAt &&
        invitation.expiresAt.getTime() > now,
    }));
  }

  /**
   * Convida um novo membro.
   *
   * O usuário é criado imediatamente com status `invited` e sem senha. Isso
   * torna o e-mail único desde o primeiro momento e faz o convidado já aparecer
   * na listagem da equipe, com o estado visível — em vez de existir apenas
   * dentro de um token que ninguém consegue inspecionar.
   */
  async invite(
    input: { name: string; email: string; role: UserRole },
    actor: ActorContext,
  ): Promise<{ user: UserDto; emailSent: boolean }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existing && existing.status !== 'invited') {
      throw new ConflictException(
        'Já existe um usuário ativo com este e-mail.',
      );
    }

    const user = existing
      ? await this.prisma.user.update({
          where: { id: existing.id },
          data: { name: input.name, role: input.role },
        })
      : await this.prisma.user.create({
          data: {
            name: input.name,
            email: input.email,
            role: input.role,
            status: 'invited',
          },
        });

    const emailSent = await this.issueInvitation(user.id, actor.actorId);

    await this.audit.record({
      userId: actor.actorId,
      action: 'user.invited',
      entity: 'user',
      entityId: user.id,
      metadata: { email: user.email, role: user.role, emailSent },
      ipAddress: actor.ipAddress,
    });

    return { user: toUserDto(user), emailSent };
  }

  /** Reenvia o convite, invalidando o link anterior. */
  async resendInvitation(
    userId: string,
    actor: ActorContext,
  ): Promise<{ emailSent: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    if (user.status !== 'invited') {
      throw new BadRequestException(
        'Este usuário já definiu a senha. Não há convite pendente.',
      );
    }

    const emailSent = await this.issueInvitation(user.id, actor.actorId);

    await this.audit.record({
      userId: actor.actorId,
      action: 'user.invitation_resent',
      entity: 'user',
      entityId: user.id,
      metadata: { email: user.email, emailSent },
      ipAddress: actor.ipAddress,
    });

    return { emailSent };
  }

  /** Revoga convites pendentes e remove o usuário ainda não ativado. */
  async revokeInvitation(userId: string, actor: ActorContext): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    if (user.status !== 'invited') {
      throw new BadRequestException(
        'Este usuário já está ativo. Para bloquear o acesso, desative a conta.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.invitation.updateMany({
        where: { email: user.email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.user.delete({ where: { id: user.id } }),
    ]);

    await this.audit.record({
      userId: actor.actorId,
      action: 'user.invitation_revoked',
      entity: 'user',
      entityId: user.id,
      metadata: { email: user.email },
      ipAddress: actor.ipAddress,
    });
  }

  async update(
    userId: string,
    input: UpdateUserDto,
    actor: ActorContext,
  ): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    if (input.role && input.role !== user.role && user.role === 'admin') {
      await this.assertNotLastAdmin(
        user.id,
        'Não é possível rebaixar o último administrador. Promova outro usuário antes.',
      );
    }

    if (input.status === 'disabled' && user.role === 'admin') {
      await this.assertNotLastAdmin(
        user.id,
        'Não é possível desativar o último administrador.',
      );
    }

    if (input.status === 'disabled' && user.id === actor.actorId) {
      throw new BadRequestException(
        'Você não pode desativar a sua própria conta.',
      );
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        name: input.name ?? undefined,
        role: input.role ?? undefined,
        status: input.status ?? undefined,
      },
    });

    // Desativar precisa produzir efeito imediato. Sem revogar as sessões, o
    // usuário continuaria operando até o access token vencer.
    if (input.status === 'disabled') {
      await this.refreshTokens.revokeAllForUser(user.id);
    }

    await this.audit.record({
      userId: actor.actorId,
      action: 'user.updated',
      entity: 'user',
      entityId: user.id,
      metadata: {
        changes: {
          name: input.name,
          role: input.role,
          status: input.status,
        },
      },
      ipAddress: actor.ipAddress,
    });

    return toUserDto(updated);
  }

  async remove(userId: string, actor: ActorContext): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    if (user.id === actor.actorId) {
      throw new BadRequestException(
        'Você não pode excluir a sua própria conta.',
      );
    }

    if (user.role === 'admin') {
      await this.assertNotLastAdmin(
        user.id,
        'Não é possível excluir o último administrador.',
      );
    }

    await this.prisma.user.delete({ where: { id: user.id } });

    await this.audit.record({
      userId: actor.actorId,
      action: 'user.deleted',
      entity: 'user',
      entityId: user.id,
      metadata: { email: user.email },
      ipAddress: actor.ipAddress,
    });
  }

  /**
   * Cria o token do convite e dispara o e-mail.
   *
   * Retorna se o e-mail saiu. Uma falha de SMTP não invalida o convite: o
   * administrador é avisado na interface e pode reenviar depois de arrumar a
   * configuração, sem precisar recriar o usuário.
   */
  private async issueInvitation(
    userId: string,
    actorId: string | null,
  ): Promise<boolean> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    await this.prisma.invitation.updateMany({
      where: { email: user.email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const { token, hash } = generateToken();

    await this.prisma.invitation.create({
      data: {
        email: user.email,
        name: user.name,
        role: user.role,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + INVITATION_TTL_HOURS * 3_600_000),
        createdById: actorId,
      },
    });

    const inviter = actorId
      ? await this.prisma.user.findUnique({
          where: { id: actorId },
          select: { name: true },
        })
      : null;

    try {
      await this.mail.send(
        user.email,
        renderInvitationEmail({
          name: user.name,
          inviterName: inviter?.name ?? null,
          roleLabel: ROLE_LABELS[user.role],
          link: `${this.appUrl}/convite?token=${token}`,
          expiresInHours: INVITATION_TTL_HOURS,
        }),
      );

      return true;
    } catch (error) {
      if (error instanceof SmtpNotConfiguredError) {
        this.logger.warn(
          `Convite criado para ${user.email}, mas o SMTP não está configurado.`,
        );
      } else {
        this.logger.error(
          `Convite criado para ${user.email}, mas o envio do e-mail falhou.`,
          error instanceof Error ? error.stack : String(error),
        );
      }

      return false;
    }
  }

  /** Impede que a plataforma fique sem nenhum administrador ativo. */
  private async assertNotLastAdmin(
    excludingUserId: string,
    message: string,
  ): Promise<void> {
    const remaining = await this.prisma.user.count({
      where: {
        role: 'admin',
        status: 'active',
        id: { not: excludingUserId },
      },
    });

    if (remaining === 0) {
      throw new BadRequestException(message);
    }
  }
}
