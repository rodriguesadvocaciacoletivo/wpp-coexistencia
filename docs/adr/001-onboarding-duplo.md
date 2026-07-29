# ADR 001 — Caixa de entrada com dois modos de onboarding

**Status:** Aceito
**Data:** 2026-07-29
**Contexto relacionado:** [`docs/00-briefing-contexto.md`](../00-briefing-contexto.md) · [`docs/01-restricoes-meta.md`](../01-restricoes-meta.md)
**Afeta:** Fase 2 (Conexão Cloud API), Fase 3 (fila de envio), Fase 7 (Coexistência)

---

## Contexto

O briefing original previa um único caminho de conexão: formulário manual com `phone_number_id`, `waba_id` e
System User Token, no estilo do wizard do Chatwoot. A verificação junto à documentação da Meta
(ver [`01-restricoes-meta.md`](../01-restricoes-meta.md)) mostrou que **coexistência não é alcançável por esse caminho** —
ela exige Embedded Signup com confirmação dentro do app WhatsApp Business do cliente.

Como o produto se chama "Sistema Coexistente" e a coexistência é o diferencial central, tratar isso como um detalhe de
Fase 7 significaria refatorar o modelo de `inboxes` justamente no momento mais caro do projeto.

## Decisão

A caixa de entrada suporta **dois modos de onboarding**, escolhidos pelo administrador na criação:

- **`manual`** — Cloud API puro. Formulário com `phone_number_id`, `waba_id` e System User Token.
- **`coexistence`** — Embedded Signup, com o número permanecendo ativo no app WhatsApp Business do cliente.

A abstração de provisionamento é construída **na Fase 2**. Apenas o modo `manual` é implementado nesse momento.
O modo `coexistence` entra como implementação stub protegida por feature flag, e é preenchida na Fase 7.

## Divergências entre os modos

Tudo que vem depois da conexão — conversas, mensagens, templates, etiquetas, atribuição, agentes, webhooks de
`messages` e `statuses` — é **idêntico** nos dois modos. A divergência se limita a:

| Aspecto | `manual` | `coexistence` |
|---|---|---|
| Entrada de dados | Formulário do wizard | Popup do Embedded Signup (session logging obrigatório) |
| Obtenção do token | System User Token colado pelo cliente | `code` do ES trocado por business token escopado ao cliente |
| Registro do número | `POST /{phone_number_id}/register` com PIN | Não se aplica — número já registrado |
| Campos de webhook | `messages`, `statuses`, `message_template_status_update` | + `history`, `smb_app_state_sync`, `message_echoes` |
| Job pós-conexão | Sync de templates | Sync de templates + histórico e contatos, **prazo de 24h** |
| Teto de throughput | Escalonável conforme tier da Meta | **Fixo em 20 msg/s** |
| Grupos | Suportados | Não suportados |
| Origem de mensagens `out` | Sempre `platform` | `platform` ou `coexistence_echo` |

## Consequências no modelo de dados

Na tabela `inboxes`:

- `onboarding_type` — enum `manual` | `coexistence`, **imutável após a criação**.
- `throughput_limit_mps` — inteiro, populado na conexão. `20` para coexistência; valor do tier para manual.
  **Deve ser lido pelo worker de envio**, nunca constante hardcoded.
- `token_type` — enum `system_user` | `business`, já que o ciclo de vida e a renovação diferem.
- `coexistence_synced_at` — nullable, marca a conclusão da sincronização inicial dentro da janela de 24h.

No backend, o provisionamento é uma interface (`InboxProvisioner`) com duas implementações selecionadas por
`onboarding_type`.

## Consequências na interface

O wizard ganha um passo inicial — "Como você quer conectar?" — com dois cards:

- **API Oficial (Cloud API)** — habilitado desde a Fase 2.
- **Coexistência (manter o app no celular)** — desabilitado até a aprovação Tech Provider, exibindo o motivo.

A tela de criação deve avisar explicitamente que **a escolha não pode ser alterada depois**.

## Alternativas consideradas

**Implementar só o modo manual e adaptar depois.** Rejeitado: força refatoração do modelo de `inboxes`, da fila de
envio e do wizard na Fase 7, que já é a fase de maior risco por depender de aprovação externa.

**Implementar o Embedded Signup desde já.** Rejeitado por três razões concretas: o fluxo de coexistência não é sequer
ofertado no popup enquanto o app não for Tech Provider aprovado, tornando o desenvolvimento não testável; o contrato de
troca do `code` está em transição (migração Embedded Signup v2 → v4, com prazo reportado para 15/10/2026 —
a confirmar na fonte oficial); e os estados de erro do fluxo (código expirado, abandono no meio, app do cliente
desatualizado) só podem ser mapeados com o fluxo real disponível.

## Pendências

- Confirmar na fonte oficial da Meta a data de deprecação do Embedded Signup v2 e implementar direto na v4.
- Confirmar se a variante de validação recebida pelo app será código numérico ou QR code (a documentação descreve
  código; integradores relatam QR).
- Conversão de uma inbox `manual` existente para `coexistence` está **fora de escopo** — números em coexistência não
  podem ser migrados entre WABAs.
