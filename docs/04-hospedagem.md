# Hospedagem — ambiente de testes e produção

**Data:** 2026-07-29
**Contexto:** o ambiente de testes precisa ficar público (a Meta exige HTTPS válido para webhooks) e ser
descartável. A produção final vai para a VPS.

---

## ✅ A arquitetura adotada

> **Decisão do cliente (2026-07-30):** tudo na Vercel, com Postgres no Supabase. O Render foi descartado.
> A Fase 6 foi construída dentro dessa restrição — este documento descreve o resultado, não a alternativa.

```
Interface (React)  →  Vercel (mesmo projeto)
API (NestJS)       →  Vercel, função serverless em api/index.js
Postgres           →  Supabase
Fila de webhooks   →  o próprio Postgres
Agendamento        →  Vercel Cron
```

Interface e API no mesmo projeto e na mesma origem, o que também elimina o cookie entre domínios.

## Como cada peça sobrevive ao serverless

A Vercel executa funções: um processo nasce, responde e é congelado. Isso exige uma solução por peça.

| Peça | Como funciona aqui |
|---|---|
| **Fila de webhooks** | Tabela `webhook_events` no Postgres. A reserva usa `FOR UPDATE SKIP LOCKED`, então várias invocações drenam em paralelo sem pegar o mesmo evento. |
| **Consumidor da fila** | Não há worker. O dreno roda depois do ACK, via `waitUntil`, e o cron de 1 minuto é a rede de segurança para retentativas. |
| **Invocação morta no meio** | `locked_at` marca a reserva. Evento reservado há mais de 5 minutos é recolhido pelo dreno seguinte. É o que substitui o "derrubar o worker não perde evento". |
| **Jobs periódicos** | `@nestjs/schedule` não roda em serverless. Os mesmos métodos ficam expostos em `/api/jobs/*` e a Vercel chama nos horários de `vercel.json`. |
| **Pool do Postgres** | `DATABASE_URL` aponta para o pooler do Supabase (porta 6543) com `connection_limit=1`. Cada invocação usa uma conexão e devolve. |

### `waitUntil`, e por que ele era indispensável

O código original disparava o processamento com `setImmediate` depois de responder. Fora da Vercel funciona:
o processo continua vivo. Na Vercel, **não** — a invocação é congelada no instante em que responde, e o
trabalho pendente morre com ela. Os eventos eram persistidos e nunca processados.

`waitUntil` (de `@vercel/functions`) informa à plataforma que a invocação só pode ser encerrada quando a
promessa terminar. O ACK continua saindo na hora; o processamento é que passa a ter garantia de acontecer.

## O que continua sem funcionar na Vercel

Duas coisas não têm solução dentro desta arquitetura. Ficam registradas para não serem redescobertas em
produção:

| Peça | Situação |
|---|---|
| **WebSocket** (Fase 3) | Não funciona: não há conexão persistente. A tela não recebe mensagem nova em tempo real — depende de recarregar ou de polling, que ainda não existe. |
| **Mídia recebida** | `StorageService` grava em disco local, que é efêmero na Vercel. Arquivos recebidos somem entre invocações. A saída natural é o Supabase Storage. |

---

## Cron da Vercel: atenção ao plano

Os quatro cron jobs estão em `vercel.json`. O de dreno roda **a cada minuto** — é ele que faz a retentativa
acontecer sem alguém clicar.

O plano **Hobby limita cron a uma execução por dia**, o que reduz o dreno agendado a quase nada. O caminho
feliz continua íntegro (o `waitUntil` processa na hora), mas um evento que falhar só seria retentado no dia
seguinte. Para o agendamento de minuto valer, é preciso o plano **Pro**.

Todas as rotas de `/api/jobs/*` exigem `CRON_SECRET` no header `Authorization: Bearer`. Sem a variável
configurada elas respondem 403 — preferível a deixar um endereço que processa a fila aberto a quem descobrir
a URL.

---

## Consequência: cookie entre domínios

Com interface e API em domínios diferentes, o cookie do refresh token precisa de `SameSite=None; Secure` —
sem isso o navegador não o envia, e a sessão cai a cada 15 minutos.

Controlado por `COOKIE_CROSS_SITE`:

| Ambiente | Valor | Cookie |
|---|---|---|
| Local | `false` | `SameSite=Lax` |
| Vercel + Render | `true` | `SameSite=None; Secure` |
| VPS com nginx único | `false` | `SameSite=Lax` |

Na VPS, com front e API atrás do mesmo nginx, tudo volta a ser mesma origem — e `Lax`, que é mais restritivo
e portanto preferível, volta a valer.

---

## Supabase: duas strings de conexão, e elas não são intercambiáveis

Em **Project Settings → Database → Connection string**, o Supabase oferece dois endereços. O sistema usa os
dois, para coisas diferentes:

| Variável | Porta | Para quê | Por quê |
|---|---|---|---|
| `DATABASE_URL` | 6543 (pooler) | Runtime da aplicação | O PgBouncer multiplexa conexões e evita esgotar o limite do plano gratuito |
| `DIRECT_URL` | 5432 (direta) | `prisma migrate` | Migrations executam DDL e comandos de sessão que o pooler em modo *transaction* não aceita |

Na `DATABASE_URL`, acrescente `?pgbouncer=true&connection_limit=1` — sem isso o Prisma usa *prepared
statements*, que o PgBouncer nesse modo não suporta, e as queries falham de forma intermitente.

> Usar só a conexão direta nas duas variáveis funciona e é mais simples. O risco aparece quando várias
> instâncias da API sobem ao mesmo tempo e estouram o limite de conexões do projeto.

O Supabase é usado **apenas como Postgres gerenciado**. Auth, Storage e as APIs REST/Realtime dele não entram:
a autenticação é própria (necessária para os papéis e o vínculo com caixas de entrada) e as mídias do WhatsApp
vão para storage S3-compatível na Fase 3.

---

## Passo a passo

### 1. API no Render

Conecte o repositório e aponte para o `render.yaml` na raiz (Blueprint). Ele cria a API e o Redis.

Depois do primeiro deploy, preencha no painel as variáveis marcadas com `sync: false`:

- `DATABASE_URL` e `DIRECT_URL` — as duas strings do Supabase.
- `ENCRYPTION_KEY` — gere com o comando abaixo. **Guarde**: perder essa chave torna ilegíveis a senha do
  SMTP e, a partir da Fase 2, todos os tokens da Meta já salvos.
- `APP_URL` e `CORS_ORIGINS` — a URL da Vercel (preencher depois do passo 2).
- Dados de SMTP, se quiser que o primeiro convite saia antes de configurar pela interface.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

O primeiro administrador é criado por seed. No shell do serviço no Render:

```bash
cd apps/api && SEED_ADMIN_EMAIL=voce@empresa.com.br SEED_ADMIN_PASSWORD=umaSenhaForte123 npx tsx prisma/seed.ts
```

### 2. Interface na Vercel

Importe o repositório. Existem dois `vercel.json`, e a Vercel lê **apenas o que estiver dentro do
Root Directory configurado no painel**:

| Root Directory no painel | Arquivo lido | Observação |
|---|---|---|
| Vazio (raiz do repositório) — **recomendado** | `vercel.json` | Funciona sem nenhum ajuste extra |
| `apps/web` | `apps/web/vercel.json` | Exige marcar *Include source files outside of the Root Directory in the Build Step*, senão o pacote `packages/shared` não existe no build |

> ⚠️ **Erro `No Output Directory named "dist" found after the Build completed`**
>
> É o sintoma clássico de o `vercel.json` não ter sido lido: sem ele, a Vercel procura o padrão `dist`
> em vez do caminho configurado. Confira, em *Project Settings → General*:
>
> 1. **Root Directory** — deixe vazio (raiz do repositório).
> 2. **Build & Development Settings** — nenhum campo pode estar sobrescrito manualmente.
>    Um valor digitado no painel tem precedência sobre o `vercel.json`. Se *Output Directory*,
>    *Build Command* ou *Install Command* estiverem preenchidos, limpe os três (o botão *Override*
>    precisa estar desligado).
> 3. **Framework Preset** — deve estar em *Other*. Se estiver como *Vite*, a Vercel assume
>    `dist` na raiz do repositório, que não existe neste monorepo.

O build correto, verificado em clone limpo, é:

```
pnpm install --frozen-lockfile --filter @coexistente/web...
pnpm --filter @coexistente/shared build && pnpm --filter @coexistente/web build
→ apps/web/dist
```

O `--filter @coexistente/web...` restringe a instalação ao frontend e ao pacote compartilhado. Sem ele,
a Vercel instalaria também NestJS e Prisma, que ela não usa — cerca de 20 segundos a mais por deploy e
uma superfície de falha desnecessária.

Configure uma única variável de ambiente:

| Variável | Valor |
|---|---|
| `VITE_API_URL` | `https://coexistente-api.onrender.com/api` |

Volte ao Render e preencha `APP_URL` e `CORS_ORIGINS` com a URL da Vercel.

### 3. Webhook da Meta (Fase 2 em diante)

O endereço a cadastrar no app do Meta Developers é o da **API**, não o da interface:

```
https://coexistente-api.onrender.com/api/webhooks/meta
```

---

## Ponto de atenção no plano gratuito do Render

Serviços gratuitos hibernam após 15 minutos sem tráfego e levam ~50 segundos para acordar. Para desenvolver
está ótimo; para receber webhooks da Meta, não: a Meta tem timeout curto e **reenvia** o evento, mas
repetidas falhas degradam a entrega.

Antes de conectar um número real na Fase 2, suba o serviço para o plano pago mais barato. A idempotência
por `wa_message_id` (Fase 6) protege contra o efeito colateral dos reenvios, mas ela ainda não existe.

---

## Migração para a VPS

O `docker-compose.yml` da raiz já descreve Postgres, Redis e Mailhog. Para a VPS o caminho é acrescentar a
API e o nginx ao mesmo compose, servindo a interface como arquivos estáticos.

Nesse momento:

- `COOKIE_CROSS_SITE` volta a `false`.
- `VITE_API_URL` vira `/api`.
- O endereço do webhook na Meta é atualizado para o domínio definitivo.

Nada de código muda.
