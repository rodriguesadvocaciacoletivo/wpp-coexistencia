import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Valida a assinatura `X-Hub-Signature-256` da Meta.
 *
 * A assinatura cobre os **bytes originais** do corpo. Reserializar o JSON antes
 * de calcular o HMAC produz um payload diferente do que foi assinado — ordem de
 * chaves, espaçamento e escapes mudam — e a validação falha sempre. Por isso a
 * aplicação sobe com `rawBody: true` e este módulo recebe um Buffer.
 *
 * Sem esta checagem, qualquer pessoa que descubra a URL do webhook consegue
 * injetar mensagens falsas na plataforma.
 */
export function isValidMetaSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader || !appSecret) {
    return false;
  }

  const [algorithm, received] = signatureHeader.split('=');

  if (algorithm !== 'sha256' || !received) {
    return false;
  }

  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');

  const expectedBuffer = Buffer.from(expected, 'hex');
  const receivedBuffer = Buffer.from(received, 'hex');

  // Comparar com `===` vazaria informação pelo tempo de execução: quanto mais
  // prefixo em comum, mais tarde a diferença aparece. Com assinaturas isso é
  // explorável para forjar o valor byte a byte.
  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
