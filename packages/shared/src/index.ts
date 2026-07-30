/**
 * Tipos e constantes compartilhados entre a API e o frontend.
 *
 * Regra: este pacote não tem dependências de runtime. Só tipos, enums e
 * funções puras — de modo que possa ser importado dos dois lados sem
 * arrastar nada consigo.
 */

export * from './auth.js';
export * from './users.js';
export * from './teams.js';
export * from './settings.js';
export * from './inboxes.js';
export * from './templates.js';
export * from './labels.js';
export * from './conversations.js';
