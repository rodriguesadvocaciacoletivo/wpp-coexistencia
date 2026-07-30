import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Publica a saída do build em todos os níveis onde a Vercel pode procurá-la.
 *
 * A Vercel resolve o `outputDirectory` a partir do Root Directory configurado
 * no painel. Os logs de deploy descartaram, um a um, os palpites: com a saída
 * só em apps/web/dist ela procurou na raiz; movida para a raiz, procurou em
 * apps/web; presente nas duas, continuou não encontrando — o que só sobra se o
 * Root Directory for um nível intermediário.
 *
 * Como não há como descobrir esse valor a partir do código, a saída é
 * espelhada em cada nível do caminho. É redundante de propósito: o custo é
 * alguns arquivos duplicados no contêiner de build, e o benefício é o deploy
 * deixar de depender de um valor que não controlamos.
 *
 * Assim que o deploy estiver verde, dá para olhar o Root Directory real no
 * painel e reduzir isto a um caminho só.
 *
 * Detalhe de implementação: a cópia é feita arquivo a arquivo em vez de
 * `cpSync(..., { recursive: true })`. A versão recursiva aborta o processo do
 * Node, sem mensagem nenhuma, em diretórios sincronizados pelo OneDrive — o
 * ambiente de desenvolvimento deste projeto.
 */
const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '..');
const source = resolve(webRoot, 'dist');

// apps/web/dist já é produzido pelo próprio Vite; aqui cobrimos os níveis acima.
const targets = [
  resolve(webRoot, '..', 'dist'), // <repo>/apps/dist
  resolve(webRoot, '..', '..', 'dist'), // <repo>/dist
];

// Fora da Vercel, apps/web/dist é o único artefato — não suja o repositório.
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

console.log(`Saída do build: ${source}`);

for (const target of targets) {
  rmSync(target, { recursive: true, force: true });
  copyTree(source, target);
  console.log(`  espelhada em ${target}`);
}
