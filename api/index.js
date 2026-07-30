/**
 * Entrada da API como função serverless da Vercel.
 *
 * Este arquivo é deliberadamente mínimo e tem um único `require`, apontando
 * para o build compilado da API. A razão é a resolução de módulos do pnpm:
 * as dependências (NestJS, helmet, cookie-parser) ficam em
 * `apps/api/node_modules`, e não na raiz. Ao delegar tudo para um módulo que
 * mora dentro de `apps/api`, o Node resolve subindo a árvore a partir de lá e
 * encontra tudo. Se este arquivo importasse esses pacotes diretamente, eles
 * seriam procurados na raiz do repositório e não seriam encontrados.
 *
 * O build é feito com `tsc` (via nest build), e não com o esbuild da Vercel,
 * porque o esbuild não implementa `emitDecoratorMetadata` — sem esses
 * metadados a injeção de dependência do NestJS não resolve nada.
 */
const { createServerlessApp } = require('../apps/api/dist/serverless');

let app = null;

module.exports = async function handler(request, response) {
  if (!app) {
    app = await createServerlessApp();
  }

  return app(request, response);
};
