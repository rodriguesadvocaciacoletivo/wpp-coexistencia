-- Fila de webhooks: recuo exponencial e reserva de evento.
--
-- `next_attempt_at` guarda quando o evento volta a ser elegível depois de uma
-- falha. `locked_at` marca a reserva, e permite recuperar eventos órfãos —
-- em serverless a invocação pode ser morta no meio do processamento, e sem
-- isso o evento ficaria preso em `processing` para sempre.
ALTER TABLE "webhook_events" ADD COLUMN "next_attempt_at" TIMESTAMP(3);
ALTER TABLE "webhook_events" ADD COLUMN "locked_at" TIMESTAMP(3);

-- Índice do claim: a consulta filtra por status e elegibilidade.
CREATE INDEX "webhook_events_status_next_attempt_at_idx" ON "webhook_events"("status", "next_attempt_at");

-- Eventos que ficaram parados em `failed` antes desta migration não têm
-- agendamento. Sem isto eles nunca seriam reclamados pelo dreno.
UPDATE "webhook_events" SET "next_attempt_at" = now() WHERE "status" = 'failed';
