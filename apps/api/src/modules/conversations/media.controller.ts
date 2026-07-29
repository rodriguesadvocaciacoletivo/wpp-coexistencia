import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

/**
 * Servidor das mídias.
 *
 * Fica atrás da autenticação de propósito: são conversas de clientes, e uma URL
 * pública adivinhável exporia anexos de atendimento a quem tivesse o link.
 */
@Controller('media')
export class MediaController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Get(':id')
  @Header('Cache-Control', 'private, max-age=86400')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ): Promise<void> {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
    });

    if (!attachment) {
      throw new NotFoundException('Arquivo não encontrado.');
    }

    const file = await this.storage.read(attachment.storageKey);

    response.setHeader('Content-Type', attachment.mimeType);
    response.setHeader('Content-Length', String(file.sizeBytes));

    if (attachment.originalName) {
      // `inline` deixa o navegador exibir imagens e PDFs sem forçar download.
      response.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(attachment.originalName)}"`,
      );
    }

    file.stream.pipe(response);
  }
}
