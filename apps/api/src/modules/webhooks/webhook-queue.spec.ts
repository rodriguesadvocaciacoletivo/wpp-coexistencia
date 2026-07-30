import { describe, expect, it } from 'vitest';
import { isQueueHealthy } from '@coexistente/shared';
import { MAX_ATTEMPTS, backoffMs } from './webhook-queue.service';

describe('backoffMs', () => {
  it('cresce a cada tentativa', () => {
    // Compara os pisos, já que há jitter por cima.
    expect(backoffMs(1)).toBeGreaterThanOrEqual(20_000);
    expect(backoffMs(2)).toBeGreaterThanOrEqual(40_000);
    expect(backoffMs(3)).toBeGreaterThanOrEqual(80_000);
  });

  it('respeita o teto de uma hora', () => {
    // Sem teto, a 20ª tentativa cairia daqui a 12 dias.
    for (const attempts of [10, 20, 50]) {
      expect(backoffMs(attempts)).toBeLessThanOrEqual(3_600_000 * 1.2);
    }
  });

  it('aplica jitter, para a rajada não voltar toda junta', () => {
    const samples = new Set(
      Array.from({ length: 30 }, () => backoffMs(3)),
    );

    expect(samples.size).toBeGreaterThan(1);
  });

  it('nunca devolve valor negativo ou zero', () => {
    for (let attempts = 0; attempts <= MAX_ATTEMPTS; attempts += 1) {
      expect(backoffMs(attempts)).toBeGreaterThan(0);
    }
  });
});

describe('isQueueHealthy', () => {
  const base = {
    queued: 0,
    processing: 0,
    failed: 0,
    dead: 0,
    processedLastHour: 0,
    oldestPendingSeconds: null,
  };

  it('fila vazia é saudável', () => {
    expect(isQueueHealthy(base)).toBe(true);
  });

  it('rajada recém-chegada não é problema', () => {
    // Dezenas de eventos de 10 segundos atrás é operação normal.
    expect(
      isQueueHealthy({ ...base, queued: 80, oldestPendingSeconds: 10 }),
    ).toBe(true);
  });

  it('um único pendente antigo é problema', () => {
    // Indica que o dreno não está rodando.
    expect(
      isQueueHealthy({ ...base, queued: 1, oldestPendingSeconds: 600 }),
    ).toBe(false);
  });

  it('evento parado é sempre problema', () => {
    expect(isQueueHealthy({ ...base, dead: 1 })).toBe(false);
  });

  it('falha aguardando nova tentativa não derruba a saúde sozinha', () => {
    // O recuo é esperado; o que importa é há quanto tempo está pendente.
    expect(
      isQueueHealthy({ ...base, failed: 3, oldestPendingSeconds: 30 }),
    ).toBe(true);
  });
});
