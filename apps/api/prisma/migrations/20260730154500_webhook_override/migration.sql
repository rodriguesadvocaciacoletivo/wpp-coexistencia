-- Registro automático do webhook.
--
-- Quando ativo, a assinatura da WABA passa a enviar `override_callback_uri` e
-- os eventos chegam direto nesta API, sem depender da URL configurada no painel
-- do app no Meta Developers.
--
-- Começa desligado em todas as caixas já existentes: o override substitui o
-- destino, e ligar sozinho tiraria o número de qualquer outro sistema que o
-- receba hoje.
ALTER TABLE "inboxes" ADD COLUMN "webhook_override" BOOLEAN NOT NULL DEFAULT false;
