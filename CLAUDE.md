# Gabi OS — guia para o Claude Code

App web de gestão pessoal e profissional da Gabriela, em português (pt-BR), moeda BRL e fuso
America/Sao_Paulo. Tem três ambientes (workspaces): **Trabalho TURBO**, **Pessoal Gabriela** e
**Trabalho Mentoria**. Antes de mudar algo grande, leia `README.md` e `docs/ARQUITETURA.md`.

## Regras do projeto (combinadas com a usuária)

- Nada de protótipo, tela decorativa ou dado fictício: todo número vem de registros reais.
- Não afirmar que uma integração funciona sem testá-la de verdade.
- Toda interface, mensagem de erro e comentário em português do Brasil.
- Só considerar uma tarefa concluída depois de implementada **e** testada (CI verde).
- A usuária lança o financeiro manualmente; Open Finance não é necessário.

## Stack

Next.js 15 (App Router, Server Components + Server Actions) · React 19 · TypeScript · Tailwind 4 ·
componentes no estilo shadcn sobre Radix · Prisma 6 + PostgreSQL 16 · Zod · Argon2id · Vitest ·
Playwright · dnd-kit · FullCalendar · TipTap · rrule · Recharts · sonner · cmdk.

## Onde fica cada coisa

- `src/server/*` — regras de negócio. Funções recebem `userId` explícito e chamam
  `requireWorkspaceAccess(userId, workspaceId, { module, write })` antes de ler/gravar.
  Módulos: tasks, calendar, notes, goals, habits, finance, crm, mentees, content.
  - `finance/` (contas, lançamentos, cartões, remuneração TURBO, vendas, resumos, importação OFX/CSV)
  - `crm.ts`, `mentees.ts`, `content.ts`, `goals.ts`, `maas.ts`, `reviews.ts`, `reports.ts`, `team.ts`
  - `integrations/` (Google Calendar e Instagram/Meta — testados só com respostas simuladas)
- `src/lib/*` — funções puras e testáveis (datas, dinheiro, recorrência, metas, MAAS, parsers).
- `src/app/(app)/<módulo>/` — páginas (`page.tsx` servidor) + `*-client.tsx` + `actions.ts`.
  Ações usam `run()` de `src/server/errors.ts` e retornam `{ ok, data, message } | { ok: false, error }`
  (o campo é **`data`**, não `value`).
- `src/components/ui/*` — design system. Em Server Components use `EmptyState` de
  `@/components/ui/empty-state` (o de `misc.tsx` é client e quebra ao receber ícone do servidor).
- `prisma/schema.prisma` e `prisma/migrations/` · `e2e/*.spec.ts` · `tests/` (fábricas e setup do banco).

## Regras financeiras (não quebrar)

- Dinheiro sempre em **centavos inteiros**. Datas sem hora em `@db.Date` (meia-noite UTC);
  use os helpers de `src/lib/dates.ts` (`ymdToDate`, `dateToYmd`, `zonedToUtc`, `todayYmd`…).
- Competência (`competenceDate`) ≠ caixa (`paidAt`); previsto (PLANNED) ≠ realizado (REALIZED).
- Pagamento de fatura é `Transfer` (CARD_PAYMENT), nunca despesa; a despesa do cartão é a parcela
  no mês da fatura.
- Remuneração TURBO recebida gera **uma** receita pessoal (`compensationRecordId` único).
- Recebível de venda pago gera **uma** receita (`receivableId` único) que não entra de novo no faturamento.
- Retirada da Mentoria (`Transfer` DISTRIBUTION) é receita pessoal e não reduz o lucro da Mentoria.
- Status (de compromisso, meta etc.) só muda por ação da usuária, nunca sozinho.

## Comandos

```bash
npm ci
npx prisma migrate dev --name <nome>   # nova migração (local, com Postgres rodando)
npm run dev
npm run typecheck
npm run test:unit
DATABASE_URL=postgresql://…/gabi_test npm run test:integration   # banco descartável
npm run build && npm run test:e2e
```

Sem Postgres local: `docker run -d --name gabi-db -e POSTGRES_USER=gabi -e POSTGRES_PASSWORD=gabi -e POSTGRES_DB=gabi -p 5432:5432 postgres:16`.

O GitHub Actions (`.github/workflows/ci.yml`) roda tudo a cada push em `main` e confere se o
schema e as migrações estão sincronizados. O workflow **Manutenção** gera migração e lockfile
quando não há como rodar o npm localmente.

## Testes E2E

- Rodam em série, com a conta `gabriela@exemplo.com` / `SenhaForte#2026` criada em `foundation.spec.ts`.
- Use seletores com escopo (`page.getByRole("dialog")`) e `exact: true` quando o rótulo se repete.
- Nunca `.catch(() => null)` em ações do Playwright: isso esconde erro de seletor.

## Publicação

- **Render** (serviço `gabi-os`, plano free, região Virginia): https://gabi-os.onrender.com.
  Publica sozinho a cada push em `main`. O build roda `prisma migrate deploy` (usa `DIRECT_URL`) e `next build`.
- **Neon** (projeto `gabi-os`, aws-us-east-1): banco de produção.
- Variáveis no Render: `DATABASE_URL` (pooler), `DIRECT_URL`, `ENCRYPTION_KEY`, `APP_URL`,
  `CRON_SECRET`, `ALLOW_REGISTRATION=false`, `NODE_VERSION=22`. Nunca commitar segredos.
- Plano free dorme após 15 min sem uso (primeira abertura ~50 s).
- Agendador: `.github/workflows/cron.yml` chama `GET /api/cron/notifications` com
  `Authorization: Bearer $CRON_SECRET` a cada 15 min (06:00–23:45 de Brasília). Exige o segredo
  `CRON_SECRET` no GitHub (mesmo valor do Render); a URL vem da variável `APP_URL` do repositório
  (padrão: a do Render). O GitHub desativa agendamentos após 60 dias sem commits no repositório.

## Commits

Mensagens em português, no formato `tipo(escopo): descrição` (feat, fix, test, docs, chore).
