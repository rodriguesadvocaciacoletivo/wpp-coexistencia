# Restrições da Meta — verificação das premissas do briefing

**Data da verificação:** 2026-07-29
**Fontes:** documentação oficial Meta for Developers + documentação de BSP (360dialog).
**Propósito:** validar as premissas do `docs/00-briefing-contexto.md` antes de escrever a especificação fase a fase.

---

## 🔴 Conflito estrutural nº 1 — Coexistência exige Embedded Signup

O briefing coloca, na seção 7 (Fora do escopo):

> Embedded Signup (onboarding OAuth de WABAs) — cadastro é manual via IDs + token nesta versão.

E, na Fase 7, prevê coexistência. **As duas coisas são incompatíveis.**

A documentação oficial da Meta ("Onboard WhatsApp Business app users", também chamada de *Coexistence*) estabelece:

- **Embedded Signup é obrigatório**, com *session logging* habilitado. Não existe caminho de ativação de coexistência
  por preenchimento manual de `phone_number_id` + `waba_id` + token.
- O cliente precisa passar pelo fluxo de vinculação a partir do próprio app WhatsApp Business (leitura de QR code /
  confirmação no aparelho), autorizando o compartilhamento de histórico e contatos.
- É requisito ser **Solution Partner ou Tech Provider**.
- É requisito ter os três campos de webhook assinados no App Dashboard **antes** do onboarding.

### Implicação prática

O cadastro manual (Fase 2) continua válido para números **puramente Cloud API** — que é o caminho de Fases 1 a 6.
Mas a Fase 7 exige, além da aprovação Tech Provider, **implementar Embedded Signup** (fluxo de coexistência).
Isso é trabalho de produto, não um "incremento de configuração".

**Decisão pendente do cliente:** manter Embedded Signup fora de escopo (e aceitar que a Fase 7 vira um projeto próprio),
ou trazer Embedded Signup para dentro do escopo desta versão como pré-requisito da Fase 7.

---

## 🟡 Correção nº 2 — nomes dos campos de webhook

O briefing cita `message_echoes` e `smb_app_state_sync`. A lista completa e correta para coexistência é de **três**
campos, e falta um no escopo original:

| Campo (App Dashboard) | Campo (payload) | O que entrega |
|---|---|---|
| `history` | `history` | Mensagens passadas que o cliente optou por compartilhar (janela de 180 dias) |
| `smb_app_state_sync` | `smb_app_state_sync` | Contatos atuais e novos do cliente |
| `message_echoes` | `smb_message_echoes` | Novas mensagens enviadas pelo cliente via app WhatsApp Business |

O `history` já aparece na tela de webhooks do print enviado (v25.0), junto de `message_echoes`.
Ele **precisa entrar no modelo de dados e no worker** — é o que popula o histórico anterior na primeira sincronização.

---

## 🟡 Limitações operacionais da coexistência (afetam requisitos e expectativa do cliente)

Aplicam-se ao número enquanto operar em coexistência:

| Limitação | Detalhe |
|---|---|
| Throughput fixo | **20 mensagens/segundo**, sem escalonamento — impacta o design da fila de envio |
| Grupos | **Não suportados** via API em números em coexistência |
| Listas de transmissão | Ficam **somente leitura**; não é possível criar novas |
| Recursos desativados | Mensagens temporárias, visualização única e localização ao vivo |
| Janela de histórico | **180 dias** de mensagens passadas |
| Prazo de sincronização | Partner tem **24 horas** após o onboarding para sincronizar os dados |
| Mídia do histórico | Apenas mídias dos **últimos 14 dias** vêm com asset ID recuperável |
| Dispositivos vinculados | Máximo de **4 companion devices**; WhatsApp para Windows e WearOS **não suportados** e são desvinculados no onboarding |
| Manutenção da conta | O app WhatsApp Business precisa ser aberto ao menos a cada **13 dias** |
| Migração | Números em coexistência **não podem ser migrados entre WABAs** |
| Selo | Business Verification padrão não se aplica; **Official Business Account (selo azul) indisponível** — apenas Partner-Led ou Meta Verified for Business |

Nenhuma dessas limitações aparece no briefing. As mais críticas para o produto são **grupos não suportados**
(o print da tela de webhooks mostra `group_*` assinados, mas isso não vale para números em coexistência) e o
**teto de 20 mps**.

---

## 🟡 Ponto de atenção nº 3 — deprecação do Embedded Signup v2

Há relatos consistentes de que o **Embedded Signup v2 será descontinuado em 15/10/2026**, com recomendação de migrar
para a **v4**. Se Embedded Signup entrar no escopo, deve ser implementado direto na v4.

> ⚠️ Esta data veio de fonte secundária (blog de integrador), não do changelog oficial. **Confirmar** na documentação
> da Meta antes de fixar em plano de implementação.

---

## ✅ Premissas do briefing que se confirmam

- Tech Provider pode operar **direto, sem BSP**, onboardando negócios por conta própria.
- Business Verification (2–5 dias úteis) + App Review são pré-requisitos.
- Tech Providers usam **business tokens** (System User Token do negócio cliente) — coerente com a premissa P4.
- Os campos de coexistência realmente só ficam assináveis após a aprovação — o erro "Falha ao assinar no campo de
  webhook message_echoes" do print é o comportamento esperado para um app ainda não aprovado.
- Fases 1 a 6 realmente não dependem da aprovação Tech Provider.

---

## Fontes

- [Onboard WhatsApp Business app users — Meta for Developers](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)
- [Embedded Signup Overview — Meta for Developers](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview)
- [Become a Tech Provider — Meta for Developers](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers)
- [WhatsApp Coexistence — 360Dialog](https://docs.360dialog.com/partner/onboarding/whatsapp-coexistence)
- [Coexistence Webhooks — 360Dialog](https://docs.360dialog.com/partner/onboarding/whatsapp-coexistence/coexistence-webhooks)
- [WhatsApp Embedded Signup v4 Migration Checklist — UnifyPort](https://www.unifyport.ai/blog/whatsapp-embedded-signup-v4-coexistence-migration/) *(fonte secundária — confirmar)*
