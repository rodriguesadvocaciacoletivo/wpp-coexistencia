# Briefing de Contexto — Plataforma de Atendimento WhatsApp (Cloud API Oficial + Coexistência)

**Status:** insumo de contexto e requisitos de alto nível para o Spec Kit.
**Versão:** 2.0
**Data de registro:** 2026-07-29
**Uso:** este documento NÃO é a especificação técnica. Ele alimenta `/speckit-constitution` e `/speckit-specify`.
A especificação detalhada será fornecida pelo usuário **fase a fase**.

---

## 1. Visão geral

Plataforma web de atendimento multiagente via WhatsApp, inspirada no Chatwoot, operando exclusivamente sobre a
**WhatsApp Cloud API oficial da Meta**, sem intermediação de BSPs (360dialog, Twilio, Gupshup). O sistema será
registrado junto à Meta como **Tech Provider**, com suporte futuro a **coexistência** — o mesmo número operando
simultaneamente no app WhatsApp Business e na Cloud API via `message_echoes` / `smb_app_state_sync`.

### 1.1 Objetivos

- Centralizar o atendimento WhatsApp de múltiplos números/caixas de entrada em uma única interface.
- Gestão de equipe (administradores e agentes) com atribuição, transferência, priorização e resolução de conversas.
- Operar dentro das regras da Meta: janela de 24h, templates aprovados, webhooks assinados, tokens seguros.
- Preparar a base para coexistência sem bloquear o desenvolvimento do núcleo (Fases 1–6 independem da aprovação).

### 1.2 Premissas e dependências externas

| # | Dependência | Impacto |
|---|---|---|
| P1 | Business Verification aprovada no Meta Business Manager | Pré-requisito para App Review |
| P2 | Advanced Access em `whatsapp_business_messaging` e `whatsapp_business_management` via App Review | Necessário para operar WABAs de terceiros como Tech Provider |
| P3 | Aprovação como Tech Provider | Libera os campos `message_echoes` e `smb_app_state_sync` |
| P4 | System User Token com escopos corretos por WABA conectada | Necessário para envio e sync de templates |
| P5 | Servidor com HTTPS válido e endpoint público estável | Exigência da Meta para webhooks |

Enquanto P3 não for atendida, o sistema opera integralmente com os webhooks padrão (`messages`, `statuses`,
`message_template_status_update`). A coexistência (Fase 7) é incremento pós-aprovação.

> ⚠️ Ver `docs/01-restricoes-meta.md` — há um conflito estrutural conhecido entre "Embedded Signup fora de escopo"
> e o requisito de coexistência.

---

## 2. Arquitetura e stack sugerida

> Stack sugerida — ajustável na fase de setup sem impacto no escopo funcional.

| Camada | Tecnologia | Observações |
|---|---|---|
| Frontend | React + Vite + TypeScript | SPA; TailwindCSS; state via Zustand/React Query |
| Backend | Node.js (NestJS ou Fastify) + TypeScript | API REST + gateway WebSocket |
| Banco | PostgreSQL | Fonte de verdade de conversas, mensagens, usuários |
| Fila | Redis + BullMQ | Processamento assíncrono de webhooks e envios |
| Tempo real | WebSocket (Socket.IO) | Novas mensagens, status, atribuições em tempo real |
| Storage de mídia | S3-compatível (ou disco + CDN) | Mídias baixadas da Meta expiram; persistir localmente |
| E-mail | SMTP configurável (nodemailer) | Host, porta, usuário, senha, TLS configuráveis pelo admin |
| Criptografia de tokens | AES-256-GCM com chave em env/KMS | System User Tokens nunca em texto plano |
| Deploy | Docker Compose (VPS) | app + worker + postgres + redis + nginx (TLS) |

### 2.1 Componentes

1. **API HTTP** — autenticação, CRUDs, envio de mensagens, consulta de conversas.
2. **Webhook receiver** — endpoint público `GET/POST /webhooks/meta`; valida e enfileira em < 200ms, sem processar inline.
3. **Worker de fila** — consome eventos da Meta e jobs de envio; aplica idempotência, retry e dead letter.
4. **Gateway WebSocket** — push em tempo real para os agentes conectados (mensagens, status, atribuições, resolução).
5. **Scheduler** — jobs recorrentes: re-sync de templates, expiração de convites/tokens de senha, limpeza de mídia órfã.

---

## 3. Modelo de dados (entidades principais)

| Entidade | Campos principais |
|---|---|
| `users` | id, nome, email (único), senha_hash (bcrypt/argon2), papel (`admin`/`agent`), status (`invited`/`active`/`disabled`), avatar, timestamps |
| `invitations` | id, email, papel, token (hash), expira_em, aceito_em |
| `password_resets` | id, user_id, token (hash), expira_em, usado_em |
| `teams` | id, nome, descrição |
| `team_members` | team_id, user_id |
| `inboxes` | id, nome, telefone_exibição, phone_number_id, waba_id, token_criptografado, status_conexão (`connected`/`error`/`pending`), última_validação, timestamps |
| `inbox_members` | inbox_id, user_id (quais agentes atendem a caixa) |
| `contacts` | id, wa_id (E.164), nome_perfil, avatar_url, timestamps |
| `conversations` | id, inbox_id, contact_id, status (`open`/`resolved`), assignee_id (nullable), team_id (nullable), prioridade (`none`/`low`/`medium`/`high`/`urgent`), última_msg_em, janela_24h_expira_em, unread_count, timestamps |
| `messages` | id, conversation_id, direção (`in`/`out`), tipo (`text`/`image`/`document`/`video`/`audio`/`template`/`private_note`), conteúdo (jsonb), wa_message_id (único — idempotência), status (`pending`/`sent`/`delivered`/`read`/`failed`), erro (jsonb), autor_id (nullable — echo/contato), origem (`platform`/`coexistence_echo`), timestamps |
| `attachments` | id, message_id, tipo, url_storage, mime, tamanho, nome_original |
| `labels` | id, nome (único), cor |
| `conversation_labels` | conversation_id, label_id |
| `templates` | id, inbox_id, nome, idioma, categoria (`UTILITY`/`MARKETING`/`AUTHENTICATION`), status (`APPROVED`/`PENDING`/`REJECTED`/`PAUSED`), componentes (jsonb: header/body/footer/buttons + variáveis), sincronizado_em |
| `webhook_events` | id, event_id/wa_message_id (único), payload (jsonb), status (`queued`/`processed`/`failed`/`dead`), tentativas, processado_em |
| `smtp_settings` | host, porta, usuário, senha_criptografada, tls, remetente_nome, remetente_email |
| `audit_logs` | id, user_id, ação, entidade, entidade_id, metadata, timestamp |

Regras estruturais:

- Conversa é única por par `inbox_id + contact_id` (uma conversa contínua por contato por caixa; resolver não cria nova
  conversa, reabre a existente).
- `wa_message_id` com índice único garante idempotência de mensagens.
- `private_note` é um tipo de mensagem interno; nunca é enviado à Meta.

---

## 4. Escopo funcional detalhado

### 4.1 Autenticação e equipe

**Login e sessão**

- Login com e-mail e senha; hash com bcrypt/argon2.
- **JWT de acesso** (curto, ~15 min) + **refresh token** (rotacionado, ~7 dias, revogável).
- Logout revoga o refresh token; endpoint `POST /auth/refresh`.
- Rate limit em login e recuperação de senha.

**Papéis e permissões**

| Ação | Admin | Agente |
|---|---|---|
| Gerenciar usuários, convites e times | ✔ | ✖ |
| Gerenciar caixas de entrada e SMTP | ✔ | ✖ |
| CRUD de etiquetas | ✔ | ✖ (aplica/remove nas conversas) |
| Ver todas as conversas das caixas que participa | ✔ (todas) | ✔ |
| Atender, atribuir, transferir, resolver | ✔ | ✔ |

**Convite de agente**

- Admin cadastra nome + e-mail + papel → sistema gera token (48h) e envia e-mail com link de definição de senha.
- Convite pode ser reenviado ou revogado; ao definir a senha, o usuário vira `active`.

**Recuperação de senha**

- `POST /auth/forgot` envia e-mail com token de uso único (1h); resposta neutra (não revela se o e-mail existe).

**SMTP configurável**

- Tela de configuração (host, porta, usuário, senha, TLS/STARTTLS, remetente) com botão "enviar e-mail de teste".
- Templates de e-mail: boas-vindas/criação de conta, convite de agente, recuperação de senha.

### 4.2 Caixas de entrada (conexão com WhatsApp)

**Fluxo de criação (wizard estilo Chatwoot)**

1. Escolher canal (WhatsApp Cloud API).
2. Preencher: nome da caixa, número de telefone, `phone_number_id`, `waba_id`, System User Token.
3. Validação imediata na Graph API: `GET /{phone_number_id}` e `GET /{waba_id}` com o token informado.
   Falhou → erro claro, não salva.
4. Registro/assinatura de webhooks do app na WABA (`POST /{waba_id}/subscribed_apps`).
5. Sync automático de templates (`GET /{waba_id}/message_templates`, paginação completa).
6. Selecionar agentes que atendem a caixa → concluir.

**Regras**

- Token criptografado (AES-256-GCM) em repouso; nunca retorna em nenhuma resposta da API (write-only, exibido mascarado).
- Editar token revalida a conexão.
- Health check periódico da conexão; falha marca `status_conexão = error` e alerta admins.
- Exclusão de caixa: soft delete; conversas e histórico preservados para consulta.

**Sync de templates**

- Na criação, ao editar token, via webhook `message_template_status_update` e por job periódico (ex.: 6h).
- Guarda estrutura completa (header/body/footer/botões) e variáveis `{{n}}` para render do modal.

### 4.3 Conversas

**Listagem**

- Três filtros fixos: **Minhas** (assignee = eu), **Não atribuídas** (assignee null, status open), **Todos**.
- Filtros combináveis: caixa de entrada, etiqueta, status (aberta/resolvida), prioridade.
- Item da lista: avatar/nome do contato, prévia da última mensagem, horário, badge de não lidas, agente responsável, etiquetas.
- Ordenação por última atividade; contadores por aba em tempo real.

**Ciclo de vida**

- Mensagem recebida de contato sem conversa aberta → cria contato (se novo) + conversa `open`, não atribuída.
- Mensagem recebida em conversa `resolved` → reabre automaticamente.
- **Resolver**: status `resolved`, sai das abas ativas. **Reabrir**: manual ou automático.
- Toda mudança relevante (atribuição, transferência, prioridade, resolver/reabrir, etiquetas) gera evento de sistema
  na timeline da conversa.

**Atribuição e transferência**

- Auto-atribuição ("atribuir a mim"), atribuição por admin/agente a qualquer membro da caixa, atribuição a time.
- Transferência entre agentes notifica o novo responsável (WebSocket + contador).
- Prioridade: none/low/medium/high/urgent, editável no painel lateral.

**Painel lateral direito**

- Dados do contato (nome, telefone, avatar) com edição de nome.
- Atribuição de agente, atribuição de time, prioridade, etiquetas da conversa.
- Ações: resolver/reabrir.

**Composição de mensagens**

- Abas **Responder** (vai para o WhatsApp) e **Mensagem Privada** (nota interna amarela, visível só à equipe).
- Suporte a: texto (emoji picker), imagem, documento, vídeo, áudio (gravação no navegador + upload de arquivo).
- Upload: arquivo → storage próprio → upload à Meta (`POST /{phone_number_id}/media`) → envio com `media_id`.
- Limites da Meta validados no front e no back (imagem 5MB, vídeo/áudio 16MB, documento 100MB; tipos MIME aceitos).
- Status por mensagem na bolha: pendente → enviado (✓) → entregue (✓✓) → lido (✓✓ azul) → falha
  (ícone + motivo do erro da Meta).

**Recepção**

- Tipos aceitos: texto, imagem, vídeo, áudio, documento, sticker, localização, contatos, reação, reply/contexto.
- Mídia recebida: baixar da Meta imediatamente (URLs expiram) e persistir no storage próprio.
- Marcar como lida na Meta (`messages` read receipt) quando o agente abre a conversa.

### 4.4 Templates e janela de 24h

**Janela de 24h**

- Cada mensagem recebida do contato define `janela_24h_expira_em = agora + 24h`.
- Janela aberta → texto livre e mídia liberados.
- Janela fechada → composer bloqueia texto livre, exibe aviso e oferece o modal de templates.
- Countdown/indicador visual do estado da janela na conversa.

**Modal de templates**

- Lista dos templates `APPROVED` da caixa: nome, idioma, categoria, corpo com `{{variáveis}}`.
- Busca por nome; preenchimento de variáveis com pré-visualização renderizada antes do envio.
- Envio via `POST /{phone_number_id}/messages` com `type: template` e componentes montados.
- Template enviado aparece na conversa renderizado com as variáveis substituídas.
- Templates `REJECTED`/`PAUSED` visíveis com status, porém não selecionáveis.

### 4.5 Etiquetas

- CRUD (admin): nome único + cor; edição reflete em todas as conversas; exclusão remove associações (com confirmação).
- Aplicar/remover etiquetas na conversa (admin e agente), múltiplas por conversa.
- Filtro de conversas por etiqueta na listagem.

### 4.6 Webhooks e processamento de eventos

**Endpoint**

- `GET /webhooks/meta`: verificação com `hub.verify_token` + `hub.challenge`.
- `POST /webhooks/meta`: valida `X-Hub-Signature-256` (HMAC SHA-256 com App Secret); assinatura inválida → 403 e log.
- Responde `200` imediatamente após persistir/enfileirar (< 200ms); processamento nunca inline.

**Fila e resiliência**

- Cada evento vira registro em `webhook_events` + job na fila.
- **Idempotência**: `wa_message_id`/`event_id` único; duplicado é descartado silenciosamente.
- Retry com backoff exponencial (ex.: 5 tentativas); esgotou → dead letter + alerta; reprocessamento manual pelo admin.
- Eventos fora de ordem tolerados (ex.: `status delivered` antes do `message` correspondente).

**Eventos tratados**

| Evento | Ação |
|---|---|
| `messages` | Cria/atualiza contato, conversa e mensagem; baixa mídia; renova janela 24h; push WebSocket |
| `statuses` | Atualiza status da mensagem (sent/delivered/read/failed) e registra erro da Meta se houver |
| `message_template_status_update` | Atualiza status do template no banco |
| `smb_message_echoes` (Fase 7) | Insere mensagem `out` com origem `coexistence_echo` na conversa |
| `smb_app_state_sync` (Fase 7) | Sincroniza estado (contatos/conversas) do app oficial |
| `history` (Fase 7) | Importa histórico prévio compartilhado pelo cliente no opt-in de coexistência |

### 4.7 Coexistência (Fase 7 — pós Tech Provider)

- Assinatura dos campos `message_echoes`, `smb_app_state_sync` e `history` nas WABAs.
- Mensagens enviadas pelo app WhatsApp Business aparecem na plataforma como saída (echo), identificadas visualmente
  ("enviada pelo celular").
- Echos não disparam reabertura de janela nem duplicam envios; idempotência por `wa_message_id`.
- Sync inicial de estado (`smb_app_state_sync`): importar contatos/histórico disponibilizado pela Meta.
- Resolução de conflitos: plataforma trata a Cloud API como fonte de verdade de envio; app é fonte adicional de eventos.

---

## 5. Requisitos não funcionais

| Categoria | Requisito |
|---|---|
| Segurança | Tokens Meta e senha SMTP criptografados (AES-256-GCM); senhas com bcrypt/argon2; HTTPS obrigatório; validação HMAC em todos os webhooks; rate limit em auth; RBAC no backend (nunca só no front); audit log de ações administrativas |
| Performance | Webhook ACK < 200ms; mensagem recebida visível ao agente < 2s (fila + WebSocket); listagem de conversas paginada (cursor) |
| Escalabilidade | Worker horizontal (fila); WebSocket com adapter Redis para múltiplas instâncias |
| Confiabilidade | Idempotência ponta a ponta; retry + dead letter; nenhuma perda de evento em pico |
| Observabilidade | Logs estruturados (JSON) com correlação por evento/conversa; métricas de fila (profundidade, falhas); health checks `/health` |
| LGPD | Dados de contato usados apenas para atendimento; exclusão de contato sob demanda; mídia em storage privado com URLs assinadas |
| I18n | Interface em pt-BR (estrutura preparada para outros idiomas) |

---

## 6. API interna (principais endpoints)

```
POST   /auth/login | /auth/refresh | /auth/logout | /auth/forgot | /auth/reset
GET    /users | POST /users/invite | PATCH /users/:id | DELETE /users/:id
GET    /teams | POST /teams | PATCH /teams/:id | POST /teams/:id/members
GET    /inboxes | POST /inboxes | PATCH /inboxes/:id | DELETE /inboxes/:id
POST   /inboxes/:id/validate | POST /inboxes/:id/sync-templates | GET /inboxes/:id/templates
GET    /conversations?filter=mine|unassigned|all&inbox&label&status&priority&cursor
GET    /conversations/:id | GET /conversations/:id/messages?cursor
POST   /conversations/:id/messages           (texto/mídia/template/nota privada)
PATCH  /conversations/:id                    (assignee, team, prioridade, status)
POST   /conversations/:id/labels | DELETE /conversations/:id/labels/:labelId
GET    /labels | POST /labels | PATCH /labels/:id | DELETE /labels/:id
GET/PUT /settings/smtp | POST /settings/smtp/test
GET/POST /webhooks/meta
```

**Eventos WebSocket (server → client):** `message.created`, `message.status_updated`, `conversation.created`,
`conversation.updated` (atribuição/prioridade/status), `conversation.label_changed`, `template.synced`,
`inbox.connection_changed`.

---

## 7. Fora do escopo (nesta versão)

- Outros canais (Instagram, Messenger, e-mail, webchat).
- Chatbot, automações, respostas prontas e fluxos.
- Relatórios/dashboards de métricas de atendimento.
- Campanhas de disparo em massa.
- Integração com CRMs externos.
- App mobile nativo.
- Embedded Signup (onboarding OAuth de WABAs) — cadastro é manual via IDs + token nesta versão.
  **⚠️ Conflita com a Fase 7 — ver `docs/01-restricoes-meta.md`.**

---

## 8. Fases de implementação com critérios de aceite

### Fase 1 — Fundação

**Entrega:** setup do projeto (repos, Docker, CI), banco + migrations, auth completa (login, JWT/refresh, logout),
papéis admin/agente, times/membros, SMTP configurável + e-mails de boas-vindas, convite e recuperação de senha.
**Aceite:** admin faz login; convida agente por e-mail; agente define senha pelo link e acessa; recuperação de senha
funciona; e-mail de teste SMTP enviado com sucesso; agente não acessa telas/endpoints de admin.

### Fase 2 — Conexão Cloud API

**Entrega:** wizard de caixa de entrada, validação na Graph API, criptografia do token, assinatura de webhooks na WABA,
sync automático + manual de templates, health check de conexão.
**Aceite:** credenciais inválidas são rejeitadas com erro claro; credenciais válidas conectam e os templates aprovados
aparecem listados; token nunca aparece em respostas da API; queda de conexão marca a caixa com erro.

### Fase 3 — Conversas (núcleo)

**Entrega:** recepção via webhook padrão, criação automática de contato/conversa, abas Minhas/Não atribuídas/Todos,
envio de texto/mídia/áudio, download e persistência de mídia recebida, atribuição/transferência, prioridade,
resolver/reabrir, notas privadas, WebSocket em tempo real.
**Aceite:** mensagem enviada do celular aparece na plataforma < 2s; agente responde e o contato recebe; status
✓/✓✓/✓✓ azul refletem na bolha; mídia enviada e recebida abre corretamente; transferir conversa notifica o novo agente;
conversa resolvida reabre ao receber nova mensagem; nota privada não chega ao contato.

### Fase 4 — Templates e janela de 24h

**Entrega:** modal de templates com busca, variáveis e preview; envio de template; bloqueio/liberação do composer
conforme janela; indicador visual da janela.
**Aceite:** com janela fechada, texto livre é bloqueado e template é enviado com sucesso; variáveis preenchidas
aparecem corretas no aparelho do contato; resposta do contato reabre a janela e libera texto livre.

### Fase 5 — Etiquetas

**Entrega:** CRUD de etiquetas, associação em conversas, filtro por etiqueta.
**Aceite:** etiqueta criada/editada reflete nas conversas; filtro por etiqueta retorna só as conversas associadas;
exclusão remove associações após confirmação.

### Fase 6 — Webhooks robustos e escalabilidade

**Entrega:** fila com retry/backoff, dead letter com reprocessamento manual, idempotência ponta a ponta, tolerância a
eventos fora de ordem, métricas e logs estruturados.
**Aceite:** webhook duplicado não duplica mensagem; derrubar o worker durante rajada de eventos não perde nenhum
(processa ao subir); evento com falha permanente vai à dead letter e pode ser reprocessado pelo admin; ACK do
webhook < 200ms sob carga.

### Fase 7 — Tech Provider e coexistência

**Entrega:** assinatura de `message_echoes`, `smb_app_state_sync` e `history`, ingestão de echos com identificação
visual, sync de estado inicial, tratamento de conflitos.
**Aceite:** mensagem enviada pelo app oficial aparece na plataforma como saída "enviada pelo celular", sem duplicar;
respostas pelo app e pela plataforma convivem na mesma conversa em ordem correta.

**Marco externo entre as Fases 6 e 7:** aprovação da Meta (Business Verification + App Review + Tech Provider).
Fases 1–6 não dependem desse marco.

---

## 9. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Demora/reprovação no App Review ou Tech Provider | Fases 1–6 independem; roteiro de review preparado com screencasts e caso de uso claro |
| Mudanças de versão da Graph API | Versão da API centralizada em config; changelog da Meta monitorado |
| Expiração/revogação de System User Token | Health check periódico + alerta a admins + status de conexão visível |
| URLs de mídia da Meta expirando | Download imediato no processamento do webhook e persistência em storage próprio |
| Rate limits da Cloud API (pair rate limit, throughput) | Fila de envio com throttling por número; tratamento dos códigos de erro 130429/131048 com retry |
| Bloqueio/banimento do número por qualidade | Exibir quality rating da WABA; uso correto de categorias de template |
| Eventos duplicados ou fora de ordem | Idempotência por `wa_message_id` + tolerância a out-of-order |
| Coexistência exige Embedded Signup (não previsto no escopo) | Ver `docs/01-restricoes-meta.md` — decisão pendente do cliente |

---

## 10. Referências visuais (do briefing original)

1. Tela de configuração de webhooks no Meta Developers, com `message_echoes` falhando ao assinar
   ("Falha ao assinar no campo de webhook message_echoes") enquanto o app não é Tech Provider aprovado.
   Campos visíveis: `group_participants_update`, `group_settings_update`, `group_status_update`, `history`,
   `message_echoes`, `message_template_components_update`, `message_template_quality_update`,
   `message_template_status_update` — todos em v25.0.
2. Wizard de criação de caixa de entrada do Chatwoot: Escolha o Canal → Criar Caixa de Entrada
   (Nome, Número de telefone, ID do número de telefone, ID da conta do WhatsApp Business, Chave da API)
   → Adicionar Agentes → Então!
3. Tela de conversa do Chatwoot: abas Minhas/Não atribuídas/Todos, lista de conversas, painel lateral com contato,
   agente atribuído, time atribuído, prioridade e etiquetas, botão Resolver, abas Responder/Mensagem Privada,
   ícones de emoji/anexo/áudio/template.
4. Modal "Templates do Whatsapp" com busca, nome do template, idioma (pt_BR), corpo com `{{variáveis}}` e categoria
   (UTILITY).

---

## 11. Instrução operacional para o Spec Kit

Usar este documento como **insumo de contexto e requisitos de alto nível**.
**Não** gerar o escopo técnico detalhado (modelagem final de banco, contratos de API, telas) a partir dele —
aguardar a especificação detalhada complementar, que será fornecida **fase a fase** pelo usuário.
