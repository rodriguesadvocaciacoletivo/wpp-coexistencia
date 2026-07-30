export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Log em uma linha de JSON.
 *
 * Na Vercel os logs são texto corrido em um painel de busca. Uma frase em
 * português é ótima para ler e péssima para procurar: "quantos eventos
 * morreram na última hora" vira caça a substring. Com JSON dá para filtrar por
 * `event` e `deadLettered` e obter a resposta.
 *
 * Complementa o logger do Nest, não substitui: mensagens destinadas a humanos
 * continuam no `Logger`. Aqui vai só o que se pretende consultar depois.
 */
export function logEvent(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({
    level,
    event,
    at: new Date().toISOString(),
    ...fields,
  });

  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.log(line);
}
