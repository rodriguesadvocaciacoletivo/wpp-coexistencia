import { Injectable, Logger } from '@nestjs/common';
import { waitUntil } from '@vercel/functions';

/**
 * Trabalho que continua depois de a resposta HTTP sair.
 *
 * Em processo contínuo basta não aguardar a promessa — o processo segue vivo e
 * o `setImmediate` roda. Em serverless não: assim que o handler responde, a
 * invocação é congelada e qualquer trabalho pendente morre com ela. Era
 * exatamente o que acontecia com o processamento de webhooks na Vercel.
 *
 * `waitUntil` resolve isso: informa à plataforma que a invocação só pode ser
 * encerrada quando a promessa terminar. Continua sendo trabalho pós-resposta,
 * então o ACK sai na mesma hora.
 */
@Injectable()
export class BackgroundService {
  private readonly logger = new Logger(BackgroundService.name);
  private readonly serverless = Boolean(process.env.VERCEL);

  run(name: string, task: () => Promise<unknown>): void {
    // Erro em trabalho de fundo não tem ninguém para reportar: se escapar,
    // vira unhandled rejection e pode derrubar o processo.
    const guarded = Promise.resolve()
      .then(task)
      .catch((error: unknown) => {
        this.logger.error(
          `Tarefa de fundo "${name}" falhou: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });

    if (this.serverless) {
      waitUntil(guarded);
      return;
    }

    void guarded;
  }
}
