import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  /** Quem executou. Nulo em ações anônimas (ex.: recuperação de senha). */
  userId?: string | null;
  /** Verbo no formato `entidade.acao`, ex.: `user.invited`. */
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra uma ação administrativa.
   *
   * Falha de auditoria não derruba a operação de negócio: se o convite foi
   * enviado, ele foi enviado. O erro é logado para investigação, mas o usuário
   * não recebe um 500 por causa da trilha.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: entry.userId ?? null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          metadata: entry.metadata,
          ipAddress: entry.ipAddress ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Falha ao registrar auditoria de "${entry.action}"`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
