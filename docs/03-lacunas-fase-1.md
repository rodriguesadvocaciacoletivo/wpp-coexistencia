# Lacunas da especificação encontradas ao construir a Fase 1

**Data:** 2026-07-29
**Como ler:** cada item traz o que o briefing não define, a decisão que foi tomada para não travar a
implementação, e o que muda se você decidir diferente. Nada aqui bloqueia a Fase 1 — mas alguns itens
ficam mais caros de mudar depois da Fase 3.

---

## 🔴 Decidir antes da Fase 3

### 1. Excluir usuário é permanente — e conversas ficam órfãs

O briefing prevê `DELETE /users/:id` e também um status `disabled`. Ambos foram implementados: desativar
bloqueia o acesso e preserva o registro; excluir remove a linha.

**O problema:** a partir da Fase 3, conversas terão `assignee_id` apontando para usuários. Excluir um agente
que atendeu 400 conversas apaga a autoria desse histórico.

**Decisão implementada:** exclusão permanente, permitida apenas quando não é o próprio usuário nem o último
administrador ativo.

**Recomendação:** trocar para soft delete antes da Fase 3, preservando o nome para exibição no histórico.
Se concordar, isso vira uma migration pequena agora e uma dor de cabeça grande depois.

### 2. Times não têm papel definido no atendimento

O briefing cita times e atribuição de conversa a time, mas não define: um agente pode estar em vários times?
Time tem responsável? Atribuir a um time notifica todos os membros ou entra numa fila?

**Decisão implementada:** um agente pode pertencer a vários times; times não têm líder; a composição é
definida de forma declarativa (a interface envia a lista final de membros).

**Fica pendente:** o comportamento de atribuição a time, que só faz sentido definir junto com a spec da Fase 3.

---

## 🟡 Definições que foram assumidas

### 3. Política de senha

Não especificada. **Assumido:** mínimo 10 caracteres, com pelo menos uma letra e um número. A regra vive em
`packages/shared` e é aplicada nos dois lados — mudar o critério é mudar uma função.

### 4. Como nasce o primeiro administrador

O briefing descreve convites, mas não diz quem convida o primeiro. **Implementado:** um seed
(`pnpm db:seed`) cria o administrador inicial a partir de `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD` do
`.env`. É idempotente e não sobrescreve conta existente. Não há auto-cadastro público — coerente com o escopo.

### 5. SMTP: fallback por variável de ambiente

Não previsto no briefing, mas necessário. Sem ele o sistema trava em si mesmo: não dá para convidar ninguém
sem SMTP configurado, e a tela de configuração exige estar logado. O seed resolve o login, mas o primeiro
convite ainda precisaria de um servidor de e-mail.

**Implementado:** a configuração salva no banco tem precedência; as variáveis de ambiente valem só enquanto
não houver configuração salva. Em desenvolvimento apontam para o Mailhog.

### 6. Convidado aparece na listagem antes de aceitar

**Implementado:** o usuário é criado imediatamente com status `invited` e sem senha. Isso torna o e-mail único
desde o primeiro momento e deixa o convite visível na tela de usuários, em vez de existir só dentro de um token.
Revogar o convite remove a conta pendente.

### 7. Proteção do último administrador

Não mencionada no briefing. **Implementado:** não é possível rebaixar, desativar ou excluir o último
administrador ativo, nem desativar/excluir a própria conta.

### 8. Falha de SMTP não invalida o convite

**Implementado:** o convite é criado mesmo que o e-mail não saia, e a API devolve `emailSent: false`. A interface
distingue "convite enviado" de "usuário criado, mas o e-mail falhou" — assim o administrador não fica esperando
uma mensagem que nunca chegou. O convite pode ser reenviado depois de corrigir o SMTP.

---

## ⚪ Não implementado — confirmar se entra em alguma fase

| Item | Situação |
|---|---|
| **Upload de avatar** | O campo `avatarUrl` existe no modelo, mas não há upload. O briefing cita avatar sem especificar origem. |
| **Tela de consulta da auditoria** | Os eventos são gravados em `audit_logs`, mas não há interface para lê-los. O briefing pede o registro, não a tela. |
| **Gerenciamento de sessões ativas** | `refresh_tokens` já guarda user agent e IP, o que permite uma tela de "dispositivos conectados" e "encerrar outras sessões". Não especificado, não implementado. |
| **Autenticação em dois fatores** | Fora do escopo. Vale reconsiderar: a plataforma vai armazenar System User Tokens da Meta, e quem entra na conta de um administrador consegue enviar mensagem em nome do cliente. |
| **Preferência de idioma e fuso por usuário** | Interface fixa em pt-BR. A estrutura permite i18n, mas não há seletor. |
| **Expiração automática de convites e tokens** | Registros expirados continuam no banco (a validação é por data, então não há risco de uso). A limpeza periódica entra com o scheduler, na Fase 2. |

---

## Decisões técnicas tomadas nesta fase

Nenhuma contraria o briefing — as opções estavam abertas ("NestJS ou Fastify", "stack sugerida, ajustável").

| Decisão | Motivo |
|---|---|
| **NestJS** em vez de Fastify puro | Guards de RBAC, injeção de dependência e integração de primeira classe com BullMQ e WebSocket, que são exatamente as peças das Fases 3 e 6. |
| **Prisma** como ORM | Migrations versionadas e tipos gerados a partir do schema. |
| **`@node-rs/argon2`** em vez de `argon2` | Binários pré-compilados para Windows. O pacote `argon2` exige node-gyp e falharia na sua máquina. |
| **Refresh token em cookie `httpOnly`** | Em `localStorage`, qualquer script injetado extrai o token e o reutiliza de outra máquina. |
| **`packages/shared` com build duplo (CJS + ESM)** | A API é CommonJS e o bundle do frontend é ESM. Um formato só quebra um dos dois lados. |
| **Prisma não derruba a API se o banco estiver fora** | Em Docker Compose a API às vezes sobe antes do Postgres; encerrar o processo transformaria dois segundos de indisponibilidade em crash loop. `/health` reporta o estado. |
