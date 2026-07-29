# Sistema Coexistente Wpp

Plataforma de atendimento multiagente via **WhatsApp Cloud API oficial da Meta**, com suporte planejado a
**coexistência** (mesmo número operando no app WhatsApp Business e na Cloud API).

> **Fase atual:** Fase 1 — Fundação (autenticação, equipe, SMTP).
> Contexto e escopo completos em [`docs/`](docs/).

---

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/00-briefing-contexto.md`](docs/00-briefing-contexto.md) | Briefing do cliente: visão, escopo funcional, 7 fases, riscos |
| [`docs/01-restricoes-meta.md`](docs/01-restricoes-meta.md) | Premissas verificadas contra a documentação da Meta |
| [`docs/02-app-review-roteiro.md`](docs/02-app-review-roteiro.md) | O que o produto precisa ter para gravar os vídeos do App Review |
| [`docs/03-lacunas-fase-1.md`](docs/03-lacunas-fase-1.md) | O que o briefing não define, o que foi assumido e o que ficou pendente |
| [`docs/04-hospedagem.md`](docs/04-hospedagem.md) | Interface na Vercel, API em Docker; por que a API não vai para serverless |
| [`docs/adr/001-onboarding-duplo.md`](docs/adr/001-onboarding-duplo.md) | Decisão: caixa de entrada com modos `manual` e `coexistence` |

---

## Stack

| Camada | Escolha |
|---|---|
| Backend | NestJS 11 + TypeScript |
| Banco | PostgreSQL 16 via Prisma 6 |
| Frontend | React 19 + Vite 6 + Tailwind CSS 4 |
| Monorepo | pnpm workspaces (`apps/api`, `apps/web`, `packages/shared`) |
| Senhas | argon2id (`@node-rs/argon2`) |
| Segredos em repouso | AES-256-GCM |
| E-mail | nodemailer com SMTP configurável pela interface |

---

## Pré-requisitos

- **Node.js** ≥ 20.11 (testado com 24.14)
- **pnpm** 9
- Um **PostgreSQL** — projeto no [Supabase](https://supabase.com) (recomendado) ou local via Docker
- **Docker Desktop** — opcional; sobe Postgres, Redis e Mailhog locais

> Com Supabase, o Docker deixa de ser obrigatório para desenvolver a Fase 1. Basta preencher
> `DATABASE_URL` e `DIRECT_URL` no `.env` — veja as instruções no `.env.example`.
> O Mailhog, porém, só existe via Docker; sem ele, configure um SMTP real para testar os e-mails.

---

## Como rodar

```bash
pnpm install
```

```bash
cp .env.example .env
```

Gere os dois segredos obrigatórios e cole no `.env`:

```bash
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(48).toString('base64url')); console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
```

Defina também `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD` — são as credenciais do primeiro administrador.

Suba a infraestrutura:

```bash
docker compose up -d
```

Aplique as migrations e crie o primeiro administrador:

```bash
pnpm db:migrate
```

```bash
pnpm db:seed
```

Rode a aplicação:

```bash
pnpm dev
```

| Serviço | Endereço |
|---|---|
| Interface | http://localhost:5173 |
| API | http://localhost:3333/api |
| Health check | http://localhost:3333/api/health |
| Mailhog (e-mails de desenvolvimento) | http://localhost:8025 |

---

## Hospedagem

| Ambiente | Interface | API |
|---|---|---|
| Testes | Vercel (`vercel.json`) | Render via Docker (`render.yaml`) |
| Produção | nginx na VPS | mesmo contêiner, no mesmo compose |

A API **não** roda em serverless: WebSocket (Fase 3) e workers de fila (Fase 6) exigem processo contínuo.
O raciocínio completo e o passo a passo estão em [`docs/04-hospedagem.md`](docs/04-hospedagem.md).

---

## O que a Fase 1 entrega

**Autenticação e sessão**
- Login com e-mail e senha (argon2id).
- Access token JWT de 15 minutos + refresh token de 7 dias em cookie `httpOnly`, com rotação e detecção de reuso.
- Rate limit em login (5/min), recuperação de senha (3 a cada 5 min) e aceite de convite.

**Equipe**
- Papéis administrador e agente, aplicados por guards no backend.
- Convite por e-mail com link de 48h; reenvio e revogação.
- Recuperação de senha com token de uso único de 1h e resposta neutra.
- CRUD de times e composição de membros.
- Proteção contra deixar a plataforma sem nenhum administrador ativo.
- Trilha de auditoria das ações administrativas.

**E-mail**
- SMTP configurável pela interface, com senha criptografada em repouso.
- Envio de e-mail de teste com diagnóstico do erro do servidor.
- Templates de convite, recuperação de senha e boas-vindas.

---

## Comandos

| Comando | O que faz |
|---|---|
| `pnpm dev` | API e web em modo watch |
| `pnpm build` | Compila shared, API e web |
| `pnpm typecheck` | Checagem de tipos em todos os pacotes |
| `pnpm test` | Testes unitários |
| `pnpm db:migrate` | Cria e aplica migration de desenvolvimento |
| `pnpm db:seed` | Cria o primeiro administrador |
| `pnpm db:studio` | Prisma Studio |
| `pnpm infra:up` / `pnpm infra:down` | Sobe/derruba Postgres, Redis e Mailhog |

---

## Estrutura

```
apps/
  api/                 NestJS
    prisma/            schema e seed
    src/
      common/          crypto, prisma, guards, auditoria
      config/          validação de ambiente
      modules/         auth, users, teams, settings, mail, health
  web/                 React + Vite
    src/
      components/      componentes de interface
      layouts/         shells de aplicação e autenticação
      lib/             cliente HTTP com refresh automático
      pages/           telas
      stores/          estado de sessão
packages/
  shared/              tipos e regras compartilhados (build CJS + ESM)
docs/                  contexto, restrições da Meta e ADRs
```

---

## Notas de segurança

- O access token vive **apenas em memória** no navegador. O refresh token fica em cookie `httpOnly` com `path=/auth`.
- Tokens de convite e recuperação são armazenados como **hash SHA-256** — o valor em claro só existe no e-mail.
- A senha do SMTP e, a partir da Fase 2, os tokens da Meta são cifrados com **AES-256-GCM**.
- Autorização por papel é decidida no backend. As barreiras do frontend são conveniência de navegação, não segurança.
- Trocar a senha ou desativar um usuário **revoga todas as sessões** daquele usuário.
