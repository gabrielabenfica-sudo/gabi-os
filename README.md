# Gabi OS — Central de Gestão

Aplicativo web de gestão pessoal, profissional, financeira e estratégica, com três ambientes
(**Trabalho TURBO**, **Pessoal** e **Trabalho Mentoria**) e módulos transversais.

## Situação atual

| Fase | Conteúdo | Status |
|------|----------|--------|
| 1 — Fundação | Arquitetura, banco completo, autenticação, sessões, design system, navegação, ambientes, configurações, exportação | ✅ Implementada e testada no CI |
| 2 — Organização | Dashboard, agenda, tarefas/Kanban, anotações, hábitos, notificações | ⏳ Próxima |
| 3 — Financeiro | Contas, receitas, despesas, cartões, parcelamentos, remuneração TURBO, financeiro Mentoria, consolidado | ⏳ |
| 4 — Gestão profissional | CRM, leads, mentorados, vendas, conteúdo, calendário editorial, metas | ⏳ |
| 5 — Desenvolvimento pessoal | MAAS, objetivos, relatórios, revisões | ⏳ |
| 6 — Integrações | Google Calendar, Instagram (Meta), Open Finance, importação OFX/CSV | ⏳ |
| 7 — Validação | Revisão de segurança, UX, financeira, documentação final | ⏳ |

O menu só mostra módulos já implementados. Nenhuma tela é decorativa.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · componentes no padrão shadcn/ui
(Radix) · PostgreSQL 16 · Prisma 6 · Argon2id · Zod · Vitest · Playwright · GitHub Actions.

Detalhes e decisões em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## Rodar localmente

Pré-requisitos: Node.js 22 e PostgreSQL 16 (ou Docker).

```bash
# 1. Banco (via Docker, se não tiver Postgres instalado)
docker run -d --name gabi-db -e POSTGRES_USER=gabi -e POSTGRES_PASSWORD=gabi \
  -e POSTGRES_DB=gabi -p 5432:5432 postgres:16

# 2. Configuração
cp .env.example .env        # ajuste DATABASE_URL e gere ENCRYPTION_KEY

# 3. Dependências e banco
npm ci
npx prisma migrate deploy

# 4. Executar
npm run dev                 # http://localhost:3000
```

No primeiro acesso, clique em **Criar conta**. A primeira conta é a administradora e recebe os três
ambientes já configurados. Depois disso o cadastro fica fechado (a não ser que `ALLOW_REGISTRATION=true`).

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `DATABASE_URL` | Sim | Conexão PostgreSQL |
| `ENCRYPTION_KEY` | Sim em produção | 32 bytes em base64 para criptografar tokens de integração. Gere com `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `APP_URL` | Sim em produção | URL pública (callbacks OAuth) |
| `ALLOW_REGISTRATION` | Não | `true` libera novos cadastros após a primeira conta |

As variáveis das integrações (Google, Meta, e-mail) entram na Fase 6.

## Testes

```bash
npm run typecheck
npm run test:unit
DATABASE_URL=postgresql://…/gabi_test npm run test:integration   # usa um banco DESCARTÁVEL (é limpo a cada teste)
npm run build && npm run test:e2e                                 # sobe o app e testa no Chromium
```

O GitHub Actions roda tudo isso a cada push em `main`, com um Postgres próprio, e também verifica se
`schema.prisma` e as migrações estão sincronizados.

## Publicação (recomendado: Vercel + Neon)

1. Crie um banco Postgres gerenciado (Neon ou Supabase; ambos têm plano gratuito) e copie a URL de conexão.
2. Em vercel.com, importe este repositório.
3. Em *Settings → Environment Variables*, defina `DATABASE_URL`, `ENCRYPTION_KEY` e `APP_URL`.
4. Em *Settings → Build*, use o comando de build `npx prisma migrate deploy && npm run build`.
5. Faça o deploy e crie sua conta no endereço publicado.

## Manutenção

O workflow **Manutenção** (aba *Actions*) atualiza o `package-lock.json` e cria novas migrações a partir
do `schema.prisma`, fazendo commit automaticamente.
