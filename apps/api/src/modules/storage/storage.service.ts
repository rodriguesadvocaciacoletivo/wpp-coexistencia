import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

export interface StoredFile {
  key: string;
  sizeBytes: number;
  mimeType: string;
}

/**
 * Armazenamento de mídia.
 *
 * As URLs que a Meta devolve para mídia expiram em poucos minutos, então o
 * arquivo precisa ser baixado no momento do recebimento e servido a partir
 * daqui — caso contrário, a conversa de ontem aparece com imagens quebradas.
 *
 * A implementação atual grava em disco. A interface é a mesma que um backend
 * S3-compatível exporia, então trocar significa reescrever esta classe, não os
 * chamadores.
 *
 * Atenção ao ambiente de testes: em plataformas sem disco persistente, os
 * arquivos somem a cada deploy. Para produção, disco na VPS ou S3.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.get<string>('STORAGE_DIR') ?? './storage');
  }

  async save(
    buffer: Buffer,
    mimeType: string,
    originalName?: string,
  ): Promise<StoredFile> {
    // Prefixo por data mantém os diretórios com tamanho administrável e torna
    // limpeza por período uma operação de listar pastas.
    const now = new Date();
    const folder = [
      String(now.getUTCFullYear()),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      String(now.getUTCDate()).padStart(2, '0'),
    ].join('/');

    const key = `${folder}/${randomUUID()}${extensionFor(mimeType, originalName)}`;
    const target = this.resolveKey(key);

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, buffer);

    return { key, sizeBytes: buffer.byteLength, mimeType };
  }

  async read(key: string): Promise<{ stream: ReadStream; sizeBytes: number }> {
    const target = this.resolveKey(key);

    try {
      const info = await stat(target);
      return { stream: createReadStream(target), sizeBytes: info.size };
    } catch {
      throw new NotFoundException('Arquivo não encontrado.');
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await unlink(this.resolveKey(key));
    } catch (error) {
      this.logger.warn(
        `Falha ao remover ${key}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  checksum(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Resolve a chave dentro da raiz do storage.
   *
   * A checagem de contenção impede path traversal: uma chave vinda do banco
   * contendo `../` poderia, sem isso, ler qualquer arquivo do servidor.
   */
  private resolveKey(key: string): string {
    const target = resolve(join(this.root, key));

    if (target !== this.root && !target.startsWith(this.root + sep)) {
      throw new NotFoundException('Arquivo não encontrado.');
    }

    return target;
  }
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/3gpp': '.3gp',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
  'audio/amr': '.amr',
  'audio/webm': '.webm',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
};

function extensionFor(mimeType: string, originalName?: string): string {
  const base = mimeType.split(';')[0]?.trim() ?? '';
  const known = EXTENSIONS[base];

  if (known) {
    return known;
  }

  const fromName = originalName?.match(/(\.[a-z0-9]{1,8})$/i)?.[1];
  return fromName ?? '';
}
