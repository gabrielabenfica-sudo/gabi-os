# Gabi OS — Central de Gestão

Aplicativo web de gestão pessoal, profissional, financeira e estratégica, com três ambientes
(**Trabalho TURBO**, **Pessoal** e **Trabalho Mentoria**) e módulos transversais.

## Situação atual

| Fase | Conteúdo | Status |
|------|----------|--------|
| 1 — Fundação | Arquitetura, banco completo, autenticação, sessões, design system, navegação, ambientes, configurações, exportação | ✅ Implementada e testada no CI |
| 2 — Organização | Dashboard com indicadores reais, agenda com conflitos, tarefas/Kanban, anotações, hábitos, notificações, busca global, anexos | ✅ Implementada e testada no CI |
| 3 — Financeiro | Contas, receitas, despesas, cartões, parcelamentos, remuneração TURBO, financeiro Mentoria, Empresa e Resultados | ✅ Implementada e testada no CI |
| 4 — Gestão profissional | CRM, leads, mentorados, conteúdo, calendário editorial, perfis, metas | ✅ Implementada e testada no CI |
| 5 — Desenvolvimento pessoal | MAAS, objetivos, relatórios, revisões | ⏳ Próxima |
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
| `CRON_SECRET` | Não | Ativa o agendador `/api/cron/notifications` (o `vercel.json` já agenda 1x/dia). Sem ele, resumos e lembretes são gerados quando você abre o app |

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

## Módulos da Fase 2

- **Tarefas** (`/tarefas`): Kanban com arrastar e soltar, lista, calendário, linha do tempo, agrupamento por responsável e por projeto; checklist, subtarefas, comentários, etiquetas, links, arquivos, tempo estimado e registrado, histórico, recorrência, modelos, duplicar e arquivar. Colunas personalizáveis por ambiente. Atraso é calculado pelo prazo e pelo status, nunca para concluídas.
- **Agenda** (`/agenda`): dia, semana, mês, lista e linha do tempo; os três ambientes juntos ou filtrados. Antes de salvar, verifica sobreposição com todos os ambientes (eventos "livres", de dia inteiro e cancelados não bloqueiam); você escolhe outro horário ou confirma. Arrastar para reagendar também verifica. Status nunca muda sozinho.
- **Anotações** (`/anotacoes`): cadernos por ambiente e subcadernos, editor com títulos, listas, checklists, tabelas, links e imagens, salvamento automático com proteção contra sobrescrever versão mais nova, favoritos, busca no conteúdo, lixeira, vínculos com tarefas/compromissos/projetos e anexos.
- **Hábitos** (`/habitos`): frequência diária, dias específicos ou X vezes por semana; marcação dos últimos 7 dias, calendário do período, percentual e sequência. Dia não marcado reduz o percentual, mas não vira pendência.
- **Notificações** (`/notificacoes`): resumo diário, revisão semanal e mensal (somente com dados registrados) e lembretes de compromissos; preferências de horário e dia.
- **Dashboard**: hoje, semana, mês ou período personalizado; cartões reordenáveis e ocultáveis; criação rápida; busca global com Ctrl+K.

## Módulos da Fase 3 (Financeiro)

- **Finanças pessoais** (`/financas/pessoal`) e **Financeiro da Mentoria** (`/financas/mentoria`): visão geral, lançamentos, contas, cartões e categorias; a Mentoria tem também vendas.
- **Lançamentos**: receitas e despesas avulsas, fixas, variáveis, recorrentes (repetir N meses) e parceladas (total dividido exatamente). Editar/excluir "só este" ou "este e os próximos". Previsto × pago/recebido sempre separados. Exportação CSV.
- **Contas**: saldo = saldo inicial + realizados ± transferências. Reservas = poupança e investimentos.
- **Cartões**: limite usado/disponível; cada parcela cai na fatura certa conforme fechamento e vencimento; pagamento (total ou parcial) é transferência, nunca despesa; estornos.
- **Remuneração TURBO** (`/turbo/remuneracao`): salário e bonificações por mês, regras de bonificação por faixas com atingimento, geração de salários previstos, simulador. Ao confirmar o recebimento, uma única receita é lançada no Pessoal.
- **Vendas da Mentoria**: à vista ou parcelada, recebíveis, inadimplência, comissão (despesa prevista), reembolso e cancelamento. Faturamento na data da venda; recebimento quando o dinheiro entra.
- **Empresa e Resultados** (`/resultados`): cada ambiente separado, comparativo com o mês anterior, histórico anual e patrimônio total. Retirada da Mentoria = transferência rastreável (receita pessoal, saída de caixa da Mentoria, sem reduzir o lucro).
- **Dashboard e notificações**: resumo financeiro do mês e avisos de contas a vencer (antecedência configurável).

## Módulos da Fase 4 (Gestão profissional)

- **CRM** (`/mentoria/crm`): funil em Kanban com etapas personalizáveis, valor potencial por etapa, próxima ação (atrasadas em destaque), histórico de contatos (ligação, mensagem, reunião, anotação) e mudanças de etapa registradas automaticamente. Indicadores do período: novos leads, vendas, conversão (ganhos ÷ ganhos + perdidos), valor em negociação, ciclo médio e origem dos leads. **Registrar venda** cria a venda no financeiro (mesmas regras da Fase 3), move o lead para “Venda realizada” e, se marcado, cadastra o mentorado — sem duplicar.
- **Mentorados** (`/mentoria/mentorados`): ficha com contato, produto, contrato e recebimentos; encontros (com opção de criar o compromisso na agenda, verificando conflitos com todos os ambientes), resumo e próximos passos; metas individuais com progresso; tarefas vinculadas; materiais e arquivos; anotações vinculadas; vendas e parcelas; linha do tempo automática (início, encontros realizados, metas atingidas, mudanças de status) e manual.
- **Conteúdo** (`/conteudo`): fluxo de produção em Kanban (etapas editáveis), calendário editorial do mês (arraste para reagendar gravação ou publicação), lista, ficha completa (gancho, roteiro, CTA, datas, link publicado), métricas por post, relatório do período com comparação de formatos e ranking por engajamento, perfis com registros de seguidores/alcance e meta de postagem semanal, e banco de referências que vira ideia com um clique. A data de publicação é marcada quando o conteúdo entra em “Publicado” — nunca sozinha. Engajamento = (curtidas + comentários + compartilhamentos + salvamentos) ÷ alcance (ou visualizações). A coleta automática pela API da Meta entra na Fase 6; até lá os números são registrados manualmente.
- **Metas** (`/metas`): quantitativas (aumentar ou reduzir; sem valor inicial, “reduzir” funciona como limite) ou qualitativas (por etapas), com horizonte mensal, trimestral, anual ou personalizado, ritmo esperado × realizado e histórico em gráfico. Cálculo automático com dados reais: faturamento, lucro e vendas da Mentoria; resultado, despesas e reservas pessoais; remuneração TURBO recebida; novos leads e conversão; conteúdos publicados; tarefas concluídas; realização dos hábitos.
- **Integração**: cartões no Dashboard (metas, próximas gravações e publicações, encontros e funil da Mentoria), seções nos resumos diário/semanal/mensal, busca global (leads, mentorados, conteúdos, metas) e criação rápida (lead, conteúdo, meta).

## Manutenção

O workflow **Manutenção** (aba *Actions*) atualiza o `package-lock.json` e cria novas migrações a partir
do `schema.prisma`, fazendo commit automaticamente.
