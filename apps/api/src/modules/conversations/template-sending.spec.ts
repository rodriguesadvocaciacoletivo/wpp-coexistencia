import { describe, expect, it } from 'vitest';
import {
  missingTemplateVariables,
  renderTemplateMessage,
  templateVariables,
  type TemplateComponent,
} from '@coexistente/shared';
import {
  buildTemplateComponents,
  sanitizeVariables,
} from './message-sending.service';

/** Template com variável em cabeçalho, corpo e botão de URL. */
const COMPONENTS: TemplateComponent[] = [
  { type: 'HEADER', format: 'TEXT', text: 'Olá, {{1}}!' },
  {
    type: 'BODY',
    text: 'Seu pedido {{1}} sai para entrega em {{2}} dias úteis.',
  },
  { type: 'FOOTER', text: 'Equipe Rodrigues' },
  {
    type: 'BUTTONS',
    buttons: [
      { type: 'QUICK_REPLY', text: 'Obrigado' },
      { type: 'URL', text: 'Rastrear', url: 'https://rastreio.com/{{1}}' },
    ],
  },
];

describe('variáveis de template', () => {
  it('lista na ordem em que o contato lê: cabeçalho, corpo, botões', () => {
    expect(templateVariables(COMPONENTS).map((v) => v.key)).toEqual([
      'header.1',
      'body.1',
      'body.2',
      'button.1.1',
    ]);
  });

  it('ignora botões sem variável ao numerar o índice', () => {
    const button = templateVariables(COMPONENTS).find(
      (v) => v.component === 'button',
    );

    // O botão de URL é o segundo da lista aprovada — a Meta casa parâmetro
    // com botão por essa posição, não pela ordem entre os que têm variável.
    expect(button?.buttonIndex).toBe(1);
  });

  it('acusa o que falta preencher', () => {
    const missing = missingTemplateVariables(COMPONENTS, {
      'header.1': 'Ana',
      'body.1': '4821',
    });

    expect(missing.map((v) => v.key)).toEqual(['body.2', 'button.1.1']);
  });

  it('considera valor só com espaços como não preenchido', () => {
    expect(
      missingTemplateVariables(COMPONENTS, { 'header.1': '   ' }).map(
        (v) => v.key,
      ),
    ).toContain('header.1');
  });
});

describe('sanitizeVariables', () => {
  const variables = templateVariables(COMPONENTS);

  it('normaliza quebra de linha e espaços repetidos', () => {
    // A Meta recusa parâmetro com \n, \t ou espaços seguidos (erro 132000).
    const result = sanitizeVariables(variables, {
      'header.1': 'Ana\nMaria',
      'body.1': '48\t21',
      'body.2': '3    ',
    });

    expect(result['header.1']).toBe('Ana Maria');
    expect(result['body.1']).toBe('48 21');
    expect(result['body.2']).toBe('3');
  });

  it('descarta chaves que não pertencem ao template', () => {
    const result = sanitizeVariables(variables, {
      'body.1': '4821',
      'body.99': 'injetado',
    });

    expect(result).not.toHaveProperty('body.99');
  });

  it('descarta valor que sobra vazio depois da limpeza', () => {
    expect(sanitizeVariables(variables, { 'body.1': '  ' })).toEqual({});
  });
});

describe('buildTemplateComponents', () => {
  const variables = templateVariables(COMPONENTS);
  const values = {
    'header.1': 'Ana',
    'body.1': '4821',
    'body.2': '3',
    'button.1.1': 'BR9988',
  };

  it('monta cabeçalho, corpo e botão no formato da Meta', () => {
    expect(buildTemplateComponents(variables, values)).toEqual({
      components: [
        { type: 'header', parameters: [{ type: 'text', text: 'Ana' }] },
        {
          type: 'body',
          parameters: [
            { type: 'text', text: '4821' },
            { type: 'text', text: '3' },
          ],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '1',
          parameters: [{ type: 'text', text: 'BR9988' }],
        },
      ],
    });
  });

  it('ordena os parâmetros por {{n}}, não pela ordem de preenchimento', () => {
    const result = buildTemplateComponents(variables, {
      ...values,
      'body.2': 'segundo',
      'body.1': 'primeiro',
    });

    const body = result.components?.find((c) => c.type === 'body');

    expect(body?.parameters).toEqual([
      { type: 'text', text: 'primeiro' },
      { type: 'text', text: 'segundo' },
    ]);
  });

  it('omite components quando o template não tem variável', () => {
    const simple: TemplateComponent[] = [
      { type: 'BODY', text: 'Estamos fora do horário de atendimento.' },
    ];

    expect(buildTemplateComponents(templateVariables(simple), {})).toEqual({});
  });
});

describe('renderTemplateMessage', () => {
  it('junta cabeçalho, corpo e rodapé com as variáveis substituídas', () => {
    const text = renderTemplateMessage(COMPONENTS, {
      'header.1': 'Ana',
      'body.1': '4821',
      'body.2': '3',
    });

    expect(text).toBe(
      'Olá, Ana!\n\nSeu pedido 4821 sai para entrega em 3 dias úteis.\n\nEquipe Rodrigues',
    );
  });

  it('mantém o marcador quando a variável não foi preenchida', () => {
    expect(renderTemplateMessage(COMPONENTS, {})).toContain('{{1}}');
  });
});
