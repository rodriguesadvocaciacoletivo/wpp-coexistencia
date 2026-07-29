# =============================================================================
# Imagem da API.
#
# É o mesmo artefato usado no ambiente de testes hospedado e, depois, na VPS —
# de propósito. Testar em um empacotamento e produzir em outro é como não ter
# testado o empacotamento.
# =============================================================================

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
# OpenSSL é exigido pelo engine do Prisma.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# --- Dependências ------------------------------------------------------------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/prisma ./apps/api/prisma
RUN pnpm install --frozen-lockfile --filter @coexistente/api... --filter @coexistente/shared...

# --- Build -------------------------------------------------------------------
FROM deps AS build
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN pnpm --filter @coexistente/shared build \
    && pnpm --filter @coexistente/api build

# --- Runtime -----------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/prisma ./apps/api/prisma

USER node
EXPOSE 3333

# As migrations são aplicadas na subida. `migrate deploy` só executa migrations
# já versionadas — nunca gera nem altera schema em produção.
CMD ["sh", "-c", "cd apps/api && npx prisma migrate deploy && node dist/main.js"]
