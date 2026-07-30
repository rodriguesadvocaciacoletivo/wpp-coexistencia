import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { LabelDto } from '@coexistente/shared';
import { labelNameKey } from '@coexistente/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import type { ActorContext } from '../users/users.service';
import type { CreateLabelDto, UpdateLabelDto } from './dto/labels.dto';

@Injectable()
export class LabelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<LabelDto[]> {
    const labels = await this.prisma.label.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { conversations: true } } },
    });

    return labels.map((label) => ({
      id: label.id,
      name: label.name,
      color: label.color,
      conversationCount: label._count.conversations,
      createdAt: label.createdAt.toISOString(),
    }));
  }

  async create(input: CreateLabelDto, actor: ActorContext): Promise<LabelDto> {
    await this.assertNameAvailable(input.name);

    const label = await this.prisma.label.create({
      data: { name: input.name, color: input.color.toLowerCase() },
    });

    await this.audit.record({
      userId: actor.actorId,
      action: 'label.created',
      entity: 'label',
      entityId: label.id,
      metadata: { name: label.name, color: label.color },
      ipAddress: actor.ipAddress,
    });

    return {
      id: label.id,
      name: label.name,
      color: label.color,
      conversationCount: 0,
      createdAt: label.createdAt.toISOString(),
    };
  }

  async update(
    id: string,
    input: UpdateLabelDto,
    actor: ActorContext,
  ): Promise<LabelDto> {
    const label = await this.prisma.label.findUnique({ where: { id } });

    if (!label) {
      throw new NotFoundException('Etiqueta não encontrada.');
    }

    if (input.name && labelNameKey(input.name) !== labelNameKey(label.name)) {
      await this.assertNameAvailable(input.name);
    }

    const updated = await this.prisma.label.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.color ? { color: input.color.toLowerCase() } : {}),
      },
      include: { _count: { select: { conversations: true } } },
    });

    await this.audit.record({
      userId: actor.actorId,
      action: 'label.updated',
      entity: 'label',
      entityId: id,
      metadata: { name: updated.name, color: updated.color },
      ipAddress: actor.ipAddress,
    });

    return {
      id: updated.id,
      name: updated.name,
      color: updated.color,
      conversationCount: updated._count.conversations,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  /**
   * Exclui a etiqueta e, junto, as associações — o cascade do banco cuida
   * disso. A confirmação acontece na interface, que mostra em quantas conversas
   * a etiqueta está antes de perguntar.
   */
  async remove(id: string, actor: ActorContext): Promise<void> {
    const label = await this.prisma.label.findUnique({
      where: { id },
      include: { _count: { select: { conversations: true } } },
    });

    if (!label) {
      throw new NotFoundException('Etiqueta não encontrada.');
    }

    await this.prisma.label.delete({ where: { id } });

    await this.audit.record({
      userId: actor.actorId,
      action: 'label.deleted',
      entity: 'label',
      entityId: id,
      metadata: {
        name: label.name,
        conversationsAffected: label._count.conversations,
      },
      ipAddress: actor.ipAddress,
    });
  }

  /**
   * Recusa nome repetido antes de bater na restrição do banco.
   *
   * A unicidade do Postgres diferencia maiúsculas e acentos, então "Urgente",
   * "urgente" e "URGENTE" passariam as três. Para quem olha a lista é a mesma
   * etiqueta três vezes.
   */
  private async assertNameAvailable(name: string): Promise<void> {
    const key = labelNameKey(name);
    const existing = await this.prisma.label.findMany({ select: { name: true } });

    if (existing.some((label) => labelNameKey(label.name) === key)) {
      throw new ConflictException(`Já existe uma etiqueta chamada "${name}".`);
    }
  }
}
