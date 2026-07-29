import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/auth/decorators';
import { PrismaService } from '../../common/prisma/prisma.service';

interface HealthResponse {
  status: 'ok' | 'degraded';
  uptime: number;
  checks: {
    database: 'up' | 'down';
  };
}

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Health check para o orquestrador e para o nginx.
   *
   * Sempre responde 200 — inclusive em estado degradado. Quem consome decide o
   * que fazer com o corpo. Devolver 503 aqui faria o load balancer tirar a
   * instância do ar em uma indisponibilidade momentânea do banco, quando a API
   * ainda consegue servir requisições que não tocam o Postgres.
   */
  @Public()
  @Get()
  async check(): Promise<HealthResponse> {
    let database: 'up' | 'down' = 'up';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      uptime: Math.round(process.uptime()),
      checks: { database },
    };
  }
}
