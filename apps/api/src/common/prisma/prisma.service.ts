import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  /**
   * A conexão inicial é tentada, mas a falha não derruba a aplicação.
   *
   * Em Docker Compose a API sobe junto com o Postgres e às vezes chega antes
   * dele. Encerrar o processo aí transformaria uma indisponibilidade de dois
   * segundos em um contêiner em crash loop. O Prisma reconecta sozinho na
   * primeira query, e `/health` expõe o estado enquanto isso não acontece.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch (error) {
      this.logger.error(
        `Não foi possível conectar ao banco de dados na inicialização: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      this.logger.warn(
        'A API vai subir mesmo assim e tentar reconectar na primeira consulta. Verifique DATABASE_URL e se o Postgres está no ar (docker compose up -d).',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
