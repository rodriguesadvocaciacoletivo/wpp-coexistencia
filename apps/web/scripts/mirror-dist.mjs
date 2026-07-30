import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Espelha a saída do build para `dist` na raiz do repositório.
 *
 * A Vercel resolve o `outputDirectory` a partir do Root Directory configurado
 * no painel, e daqui não há como saber qual foi escolhido — os logs de deploy
 * mostraram a saída sendo procurada ora na raiz, ora em apps/web. Publicar nos
 * dois caminhos elimina a adivinhação.
 *
 * Os caminhos são resolvidos a partir da localização deste arquivo, nunca do
 * cwd, justamente porque o cwd é a variável imprevisível aqui.
 *
 * A cópia é feita arquivo a arquivo em vez de `cpSync(..., {recursive:true})`:
 * a versão recursiva aborta o processo do Node (sem mensagem) em diretórios
 * sincronizados pelo OneDrive, que é o ambiente de desenvolvimento deste
 * projeto. `copyFileSync` não tem esse problema.
 */
const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '..', 'dist');
const target = resolve(here, '..', '..', '..', 'dist');

// Fora da Vercel, apps/web/dist é o único artefato — não suja a raiz.
if (!process.env.VERCEL) {
  process.exit(0);
}

if (!existsSync(source)) {
  console.error(`Saída do build não encontrada em ${source}`);
  process.exit(1);
}

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });

  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const origin = join(from, entry.name);
    const destination = join(to, entry.name);

    if (entry.isDirectory()) {
      copyTree(origin, destination);
    } else {
      copyFileSync(origin, destination);
    }
  }
}

rmSync(target, { recursive: true, force: true });
copyTree(source, target);

console.log(`Saída espelhada: ${source} -> ${target}`);
