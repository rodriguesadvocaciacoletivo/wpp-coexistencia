# Sistema Coexistente Wpp

Plataforma de atendimento multiagente via **WhatsApp Cloud API oficial da Meta**, com suporte planejado a
**coexistência** (mesmo número operando no app WhatsApp Business e na Cloud API).

> **Fases entregues:** 1 (fundação), 2 (conexão Cloud API), 3 (conversas) e 4 (templates e janela de 24h).
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

## O que a Fase 2 entrega

**Conexão com a Cloud API**
- Wizard em três passos: escolha do modo de conexão, credenciais e agentes.
- Validação contra a Graph API antes de gravar — inclusive conferindo se o número pertence à WABA informada.
- Erros da Meta traduzidos em mensagens acionáveis (token expirado, permissão faltando, ativo inexistente).
- System User Token cifrado em AES-256-GCM, write-only: nunca retorna em nenhuma resposta.
- Assinatura automática dos webhooks na WABA.
- Registro automático do endereço do webhook, opcional por caixa: a plataforma informa a própria URL
  à Meta (`override_callback_uri`) e dispensa preencher o painel do Meta Developers. Desligado por
  padrão porque **substitui** o destino — ligar tira o número de qualquer outro sistema que o receba.
  Não vale para status de template, que continua indo à URL do painel; o re-sync de 6h cobre isso.
- Modo coexistência visível e bloqueado, com o motivo — depende da aprovação como Tech Provider.

**Templates**
- Sincronização completa com paginação; a Meta é a fonte de verdade e o que sumiu de lá some daqui.
- Criação de template pela aplicação, com validação local das regras da Meta antes do envio.
- Exclusão, com o aviso de que a Meta remove todos os idiomas do mesmo nome.

**Operação**
- Health check das conexões a cada 30 minutos; falha marca a caixa com erro e o motivo aparece na tela.
- Re-sync de templates a cada 6 horas, como rede de segurança para eventos de webhook perdidos.
- Limpeza diária de convites e tokens vencidos.
- Teto de throughput por caixa gravado no banco (20 msg/s em coexistência), lido pela fila de envio na Fase 3.

## O que a Fase 3 entrega

**Recepção**
- Endpoint público `GET/POST /api/webhooks/meta` com verificação de posse e validação de assinatura HMAC sobre o corpo cru.
- ACK imediato: o evento é persistido e respondido, e só então processado.
- Idempotência por `wa_message_id` — webhook reentregue não duplica mensagem.
- Tolerância a eventos fora de ordem: um `delivered` atrasado não rebaixa um `read` já confirmado.
- Todos os tipos recebidos: texto, imagem, vídeo, áudio, documento, figurinha, localização, contatos e reação. Tipo desconhecido é preservado, não descartado.
- Mídia baixada no recebimento e servida pela própria API — as URLs da Meta expiram em minutos.

**Atendimento**
- Abas Minhas, Não atribuídas e Todos, com contadores e filtros por caixa, prioridade e busca.
- Conversa única por contato e caixa: resolver não cria conversa nova, e mensagem nova reabre a existente.
- Atribuição, transferência, time, prioridade e resolução — cada mudança vira evento na timeline.
- Notas internas que nunca chegam ao contato e não alteram a prévia da conversa.
- Envio de texto, imagem, vídeo, documento e áudio gravado no navegador.
- Status na bolha: enviado, entregue, lido e falha com o motivo da Meta.
- Abrir a conversa marca as mensagens como lidas, inclusive no aparelho do contato.
- Bloqueio de texto livre fora da janela de 24h, como a Meta exige.
- WebSocket empurra mensagens, status e atribuições em tempo real.

## O que a Fase 4 entrega

**Templates no atendimento**
- Modal de escolha com busca por nome **e** por texto do corpo, sem depender de acento.
- Templates agrupados por nome, com seletor de idioma — a Meta trata cada idioma como um registro,
  para quem atende é uma mensagem só.
- Só aparecem os aprovados: os demais não podem ser enviados, e mostrá-los no meio do atendimento
  só gera tentativa frustrada. O catálogo completo, com motivo de recusa, fica na tela da caixa.
- Variáveis de cabeçalho, corpo e botão de URL, com pré-visualização do que o contato vai receber.
- Envio bloqueado enquanto faltar variável — a Meta recusaria o envio inteiro.
- Valores são normalizados antes do envio: quebra de linha, tabulação e espaços repetidos derrubam
  o template com o erro 132000, e colar de planilha traz isso o tempo todo.

**Janela de 24 horas**
- Indicador no cabeçalho da conversa com o tempo restante, recalculado sozinho.
- O composer se fecha sozinho quando a janela expira (conferido a cada 30s), sem recarregar a página.
- Com a janela fechada, o aviso traz o botão que abre o modal — o caminho de saída fica no lugar
  onde o atendente esbarrou no bloqueio.
- Template continua disponível **dentro** da janela: também serve para lembrete e confirmação.
- Enviar template **não** reabre a janela. Só mensagem do contato faz isso, e é assim na Meta.

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
      modules/         auth, users, teams, settings, mail, health,
                       inboxes, meta, templates, conversations,
                       webhooks, realtime, storage
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
