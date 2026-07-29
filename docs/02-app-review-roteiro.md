# Roteiro de App Review — o que o produto precisa ter para gravar o vídeo

**Data:** 2026-07-29
**Objetivo:** garantir que o App Review (Advanced Access + Tech Provider) possa ser submetido **sem coexistência
funcionando**, usando apenas o que as Fases 1–4 entregam.
**Fonte:** [App Review sample submission — Meta](https://developers.facebook.com/docs/whatsapp/solution-providers/app-review/sample-submission)
e [Become a Tech Provider — Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers).

---

## Premissa central

Nenhuma das evidências exigidas pela Meta envolve coexistência. O App Review valida duas permissões, e ambas são
demonstráveis com uma inbox em modo `manual` (Cloud API puro):

| Permissão | O que precisa ser demonstrado |
|---|---|
| `whatsapp_business_messaging` | Uma mensagem criada e enviada **a partir da sua aplicação**, recebida no cliente WhatsApp |
| `whatsapp_business_management` | Gestão de **números de telefone** e **templates de mensagem** de clientes |

Regra explícita da Meta sobre o screencast:

> A gravação deve ser feita na **interface do negócio**, não na experiência do consumidor.

Ou seja: o vídeo é do **seu painel**, não da tela do WhatsApp do cliente final. O WhatsApp aparece só como
comprovação de entrega.

---

## 🔴 Lacuna identificada no escopo atual

O briefing prevê apenas **sincronizar** templates aprovados (`GET /{waba_id}/message_templates`) — leitura.
Não prevê **criar** templates pela aplicação.

A evidência esperada para `whatsapp_business_management` é justamente demonstrar **criação e gestão** de templates.
A Meta aceita, como alternativa, gravar a interface do WhatsApp Manager — mas isso enfraquece a submissão, porque
mostra o produto *dela*, não o seu, exercendo a permissão.

**Recomendação:** adicionar à Fase 4 uma tela mínima de criação de template
(`POST /{waba_id}/message_templates`): nome, idioma, categoria, corpo com variáveis, e o status retornado
(`PENDING` → `APPROVED` via webhook, que o sistema já trata). É um endpoint só, reaproveita todo o modelo de
`templates` já previsto, e converte a submissão de "aceitável" em "óbvia".

O mesmo raciocínio vale para **gestão de números**: hoje o escopo só valida o `phone_number_id` na conexão.
Exibir na tela da inbox os dados vindos da Graph API — nome de exibição, status de verificação, *quality rating*,
tier de mensagens — já caracteriza gestão de números e custa uma chamada `GET /{waba_id}/phone_numbers`.

---

## Como gravar antes de ter Advanced Access

Não há impasse de ovo-e-galinha: a Meta fornece um **número de teste** por app, com envio gratuito para até
5 destinatários cadastrados, funcionando em **Standard Access** — antes de qualquer aprovação. É com ele que o vídeo
é gravado.

Consequência para o desenvolvimento: a inbox em modo `manual` precisa funcionar com o número de teste da Meta
exatamente como funcionaria com um número real. Nada de caminho especial ou mock.

---

## Roteiro sugerido — vídeo `whatsapp_business_messaging`

Sem cortes, mostrando a URL da aplicação na barra do navegador.

1. Login no painel como administrador.
2. Abrir a aba **Conversas**, mostrar as três abas (Minhas / Não atribuídas / Todos).
3. Enviar uma mensagem do celular de teste para o número conectado → a conversa aparece em **Não atribuídas**
   em tempo real.
4. Atribuir a conversa a um agente.
5. Responder pelo composer com **texto**.
6. Mostrar a mensagem chegando no WhatsApp do destinatário (rápido, só como prova de entrega).
7. Voltar ao painel e mostrar os status na bolha: enviado → entregue → lido.
8. Enviar um **anexo** (imagem ou documento).
9. Mostrar uma **nota privada** e evidenciar que ela não é enviada ao contato.

## Roteiro sugerido — vídeo `whatsapp_business_management`

1. Abrir **Configurações → Caixas de entrada**.
2. Percorrer o wizard de criação: escolher canal, preencher `phone_number_id`, `waba_id` e token.
3. Mostrar a **validação contra a Graph API** acontecendo — inclusive um caso de credencial inválida sendo rejeitada.
4. Mostrar os **dados do número** puxados da API: nome de exibição, verificação, quality rating.
5. Mostrar a **sincronização de templates** trazendo os templates aprovados da WABA.
6. **Criar um template novo** pela aplicação e mostrá-lo entrando como `PENDING`.
7. Mostrar o **modal de templates** em uma conversa: busca, preenchimento de variáveis, preview.

---

## Descrições da submissão

A Meta espera que o texto identifique o papel de Tech Provider explicitamente:

- **`whatsapp_business_management`** — necessária para gerenciar os números de telefone e os templates de mensagem
  dos negócios clientes da plataforma.
- **`whatsapp_business_messaging`** — necessária para enviar e receber mensagens em nome de outros negócios,
  dando suporte ao atendimento aos clientes deles.

Em ambos os casos, explicitar **como os dados acessados são usados** — no seu caso: exibir e responder conversas em uma
caixa de entrada compartilhada por uma equipe de atendimento, com histórico persistido para continuidade do atendimento.

---

## Sequenciamento

O App Review pode ser submetido **ao final da Fase 4**, sem aguardar as Fases 5 e 6. A ordem fica:

```
Fase 1 → 2 → 3 → 4 → [gravar vídeos + submeter App Review] → Fase 5 → 6 → [aprovação] → Fase 7
```

Business Verification (2–5 dias úteis) pode e deve ser iniciada **em paralelo à Fase 1** — ela não depende de
nenhuma linha de código.

## Impacto no escopo das fases

| Fase | Adição decorrente deste documento |
|---|---|
| Fase 2 | Exibir dados do número vindos da Graph API (`GET /{waba_id}/phone_numbers`): display name, verificação, quality rating, tier |
| Fase 4 | Tela de **criação** de template (`POST /{waba_id}/message_templates`), além do sync já previsto |
