import { describe, expect, it } from 'vitest';
import {
  isValidLabelColor,
  labelNameKey,
  normalizeLabelName,
} from '@coexistente/shared';

describe('normalizeLabelName', () => {
  it('remove espaços das pontas', () => {
    expect(normalizeLabelName('  Cobrança  ')).toBe('Cobrança');
  });

  it('colapsa espaços internos', () => {
    // "em espera" e "em  espera" seriam dois registros para o banco e a mesma
    // etiqueta para quem lê a lista.
    expect(normalizeLabelName('em  espera')).toBe('em espera');
  });

  it('preserva a caixa que o administrador escolheu', () => {
    expect(normalizeLabelName('Primeiro Contato')).toBe('Primeiro Contato');
  });
});

describe('labelNameKey', () => {
  it('ignora diferença de caixa', () => {
    expect(labelNameKey('Urgente')).toBe(labelNameKey('URGENTE'));
  });

  it('ignora acento', () => {
    // Quem digita "cobranca" no apuro não quer criar uma segunda etiqueta.
    expect(labelNameKey('Cobrança')).toBe(labelNameKey('cobranca'));
  });

  it('ignora espaço repetido e das pontas', () => {
    expect(labelNameKey(' Em  Espera ')).toBe(labelNameKey('em espera'));
  });

  it('mantém nomes de fato distintos separados', () => {
    expect(labelNameKey('Cobrança')).not.toBe(labelNameKey('Cobranças'));
  });
});

describe('isValidLabelColor', () => {
  it('aceita #RRGGBB', () => {
    expect(isValidLabelColor('#3b82f6')).toBe(true);
    expect(isValidLabelColor('#3B82F6')).toBe(true);
  });

  it('recusa formatos que a interface não sabe clarear', () => {
    expect(isValidLabelColor('#fff')).toBe(false);
    expect(isValidLabelColor('rgb(1,2,3)')).toBe(false);
    expect(isValidLabelColor('azul')).toBe(false);
    expect(isValidLabelColor('#3b82f6ff')).toBe(false);
  });
});
