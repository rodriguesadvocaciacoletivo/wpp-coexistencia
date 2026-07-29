<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->

## Projeto: Plataforma de Atendimento WhatsApp (Cloud API Oficial + Coexistência)

Contexto de negócio e requisitos de alto nível — **ler antes de qualquer comando do Spec Kit**:

- `docs/00-briefing-contexto.md` — briefing v2.0 do cliente (visão, escopo funcional, 7 fases, riscos).
- `docs/01-restricoes-meta.md` — verificação das premissas contra a documentação da Meta. Coexistência exige
  Embedded Signup, resolvido pelo ADR 001.
- `docs/02-app-review-roteiro.md` — o que o produto precisa ter para gravar os vídeos do App Review.
  Adiciona escopo às Fases 2 e 4.
- `docs/adr/001-onboarding-duplo.md` — caixa de entrada com dois modos: `manual` e `coexistence`.
- `docs/03-lacunas-fase-1.md` — o que o briefing não define, o que foi assumido e o que ficou pendente.

**Estado:** Fase 1 implementada (ver `README.md`). Stack: NestJS + Prisma + PostgreSQL, React + Vite +
Tailwind, monorepo pnpm com `packages/shared`.

**Idioma:** toda documentação, especificação e interface em **pt-BR**.

**Regra de trabalho:** a especificação técnica detalhada (modelagem de banco, contratos de API, telas) é fornecida
pelo usuário **fase a fase**. Não antecipar fases futuras.
