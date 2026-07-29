import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * O pacote é publicado nos dois formatos: CommonJS para a API (NestJS) e ESM
 * para o frontend (Vite/Rollup).
 *
 * Os dois diretórios usam a extensão `.js`, então o Node precisa de um
 * `package.json` em cada um dizendo como interpretá-los — sem isso, `type`
 * herda da raiz do pacote e o bundle ESM seria lido como CommonJS.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const markers = [
  ['dist/cjs', 'commonjs'],
  ['dist/esm', 'module'],
];

for (const [directory, type] of markers) {
  const target = join(root, directory);
  mkdirSync(target, { recursive: true });
  writeFileSync(
    join(target, 'package.json'),
    `${JSON.stringify({ type }, null, 2)}\n`,
    'utf8',
  );
}

console.log('Marcadores de módulo escritos em dist/cjs e dist/esm.');
