import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { TeamDetailDto, TeamDto } from '@coexistente/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { toUserDto } from '../../common/mappers/user.mapper';
import type { ActorContext } from '../users/users.service';
import type {
  CreateTeamDto,
  SetTeamMembersDto,
  UpdateTeamDto,
} from './dto/teams.dto';

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<TeamDto[]> {
    const teams = await this.prisma.team.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: true } } },
    });

    return teams.map((team) => ({
      id: team.id,
      name: team.name,
      description: team.description,
      memberCount: team._count.members,
      createdAt: team.createdAt.toISOString(),
    }));
  }

  async findOne(id: string): Promise<TeamDetailDto> {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: {
        members: {
          include: { user: true },
          orderBy: { user: { name: 'asc' } },
        },
      },
    });

    if (!team) {
      throw new NotFoundException('Time não encontrado.');
    }

    return {
      id: team.id,
      name: team.name,
      description: team.description,
      memberCount: team.members.length,
      createdAt: team.createdAt.toISOString(),
      members: team.members.map((member) => toUserDto(member.user)),
    };
  }

  async create(input: CreateTeamDto, actor: ActorContext): Promise<TeamDto> {
    try {
      const team = await this.prisma.team.create({
        data: { name: input.name, description: input.description ?? null },
      });

      await this.audit.record({
        userId: actor.actorId,
        action: 'team.created',
        entity: 'team',
        entityId: team.id,
        metadata: { name: team.name },
        ipAddress: actor.ipAddress,
      });

      return {
        id: team.id,
        name: team.name,
        description: team.description,
        memberCount: 0,
        createdAt: team.createdAt.toISOString(),
      };
    } catch (error) {
      throw this.translatePrismaError(error);
    }
  }

  async update(
    id: string,
    input: UpdateTeamDto,
    actor: ActorContext,
  ): Promise<TeamDto> {
    await this.assertExists(id);

    try {
      const team = await this.prisma.team.update({
        where: { id },
        data: {
          name: input.name ?? undefined,
          description:
            input.description === undefined ? undefined : input.description,
        },
        include: { _count: { select: { members: true } } },
      });

      await this.audit.record({
        userId: actor.actorId,
        action: 'team.updated',
        entity: 'team',
        entityId: team.id,
        metadata: { name: team.name },
        ipAddress: actor.ipAddress,
      });

      return {
        id: team.id,
        name: team.name,
        description: team.description,
        memberCount: team._count.members,
        createdAt: team.createdAt.toISOString(),
      };
    } catch (error) {
      throw this.translatePrismaError(error);
    }
  }

  async remove(id: string, actor: ActorContext): Promise<void> {
    const team = await this.assertExists(id);

    await this.prisma.team.delete({ where: { id } });

    await this.audit.record({
      userId: actor.actorId,
      action: 'team.deleted',
      entity: 'team',
      entityId: id,
      metadata: { name: team.name },
      ipAddress: actor.ipAddress,
    });
  }

  /**
   * Define a composição do time de uma vez.
   *
   * A operação é declarativa em vez de incremental — a interface envia a lista
   * final desejada. Isso evita divergência quando dois administradores editam o
   * mesmo time: o último a salvar tem um resultado previsível, em vez de um
   * estado que depende da ordem de chegada de adições e remoções.
   */
  async setMembers(
    id: string,
    input: SetTeamMembersDto,
    actor: ActorContext,
  ): Promise<TeamDetailDto> {
    await this.assertExists(id);

    if (input.userIds.length > 0) {
      const found = await this.prisma.user.count({
        where: { id: { in: input.userIds } },
      });

      if (found !== input.userIds.length) {
        throw new BadRequestException(
          'Um ou mais usuários informados não existem.',
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.teamMember.deleteMany({ where: { teamId: id } }),
      this.prisma.teamMember.createMany({
        data: input.userIds.map((userId) => ({ teamId: id, userId })),
      }),
    ]);

    await this.audit.record({
      userId: actor.actorId,
      action: 'team.members_updated',
      entity: 'team',
      entityId: id,
      metadata: { memberCount: input.userIds.length },
      ipAddress: actor.ipAddress,
    });

    return this.findOne(id);
  }

  private async assertExists(id: string): Promise<{ name: string }> {
    const team = await this.prisma.team.findUnique({
      where: { id },
      select: { name: true },
    });

    if (!team) {
      throw new NotFoundException('Time não encontrado.');
    }

    return team;
  }

  private translatePrismaError(error: unknown): Error {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException('Já existe um time com este nome.');
    }

    return error instanceof Error ? error : new Error(String(error));
  }
}
