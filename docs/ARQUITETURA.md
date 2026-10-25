# Arquitetura

## Visão geral

Monólito modular em Next.js (App Router). A interface usa Server Components para leitura e
Server Actions para escrita. Toda regra de negócio fica em `src/server/*`, em funções que recebem
o `userId` explicitamente. Assim elas são testáveis sem o framework e a autorização nunca depende
do cliente.

```
src/
  app/
    (auth)/          login, cadastro e ações de autenticação
    (app)/           área autenticada (layout com menu, dashboard, configurações…)
    api/             exportação, relatórios CSV, anexos, callbacks OAuth, cron, health check
  components/
    ui/              design system (botão, campos, card, diálogo, menus…)
    shell/           menu lateral, filtro de ambiente, paleta de comandos
  lib/               regras puras e testáveis (dinheiro, datas, recorrência, metas, MAAS,
                     métricas de conteúdo, leitura de OFX/CSV, conversões Google/Meta)
  server/            regras de negócio, autenticação, autorização, auditoria
    finance/         contas, lançamentos, cartões, remuneração, vendas, resumos, importação
    integrations/    Google Calendar e Instagram (Meta)
prisma/              schema e migrações versionadas
e2e/                 testes Playwright
tests/               setup do banco de teste e fábricas
```

## Ambientes e autorização

- Cada registro de negócio pertence a um `Workspace` (TURBO, PESSOAL ou MENTORIA).
- `WorkspaceMember` define o papel (OWNER, ADMIN, EDITOR, VIEWER) e, para EDITOR/VIEWER, a lista
  explícita de módulos permitidos. Financeiro e mentorados **nunca** ficam acessíveis por padrão a
  colaboradores.
- `requireWorkspaceAccess(userId, workspaceId, { module, write })` é chamado no servidor antes de
  qualquer leitura ou escrita.
- O filtro de ambiente no topo é um cookie validado no servidor contra os ambientes da usuária.
- Equipe (`/configuracoes/equipe`): a dona ou uma administradora convida por link de uso único
  (7 dias; só o SHA-256 do token fica no banco), escolhendo papel e módulos. Colaboradoras
  convidadas não ganham ambientes próprios. Dados de outro módulo embutidos numa tela são
  filtrados no servidor: a ficha do mentorado só traz vendas com permissão de financeiro e
  tarefas com permissão de tarefas; o lead só traz valores de venda com financeiro.
- MAAS e revisões são pessoais (pertencem à usuária, não a um ambiente) e nunca são compartilhados.

## Autenticação e sessões

- Senhas com Argon2id (parâmetros OWASP). Força mínima: 10 caracteres e 2 classes de caractere.
- Sessões no banco: o cookie guarda um token aleatório de 256 bits; o banco guarda só o SHA-256.
  Cookie `httpOnly`, `sameSite=lax`, `secure` em produção. Validade de 30 dias com renovação.
- Bloqueio após 5 tentativas falhas em 15 minutos (por e-mail) e limite por IP.
- Mensagem de erro genérica e verificação de hash mesmo para e-mail inexistente (evita enumeração).
- Trocar a senha encerra as demais sessões. As sessões ativas podem ser revogadas em Configurações.
- O cadastro fecha depois da primeira conta.
- Middleware redireciona para `/login` sem cookie; a validação real ocorre no servidor.
- Server Actions do Next.js verificam a origem (proteção CSRF); cabeçalhos de segurança aplicados
  globalmente (`X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`).

## Dados financeiros (regras já embutidas no modelo)

- Dinheiro em **centavos inteiros**; nenhuma conta usa ponto flutuante.
- `FinancialTransaction` = receita ou despesa, com **competência** (`competenceDate`) separada do
  **caixa** (`paidAt`) e situação PLANNED/REALIZED/CANCELLED. Previsto ≠ realizado.
- `Transfer` não é receita nem despesa: cobre transferências internas, **pagamento de fatura** e
  **retirada da Mentoria para a pessoa física** (`DISTRIBUTION`). Isso impede a contagem dupla.
- Compras no cartão vivem em `CardPurchase` → `Installment` → `CardInvoice`. A despesa é a parcela
  na fatura; o pagamento da fatura é uma transferência.
- Remuneração TURBO (`CompensationRecord`) registra o previsto. Quando recebida, gera **uma**
  receita no ambiente pessoal, vinculada por chave única.
- Venda da Mentoria (`Sale`) gera recebíveis (`Receivable`). Faturamento conta pela data da venda;
  caixa conta quando cada parcela é recebida. Cada recebível gera no máximo uma receita.
- Importações (OFX/CSV) usam `externalId` único por conta (FITID do OFX ou hash estável da linha
  do CSV) para evitar duplicidade. O arquivo é relido no servidor na confirmação (o cliente só
  escolhe linhas). Um PREVISTO compatível (mesmo tipo e valor, até 5 dias de diferença) é
  **conciliado** — vira pago — em vez de gerar outro lançamento. Importações podem ser desfeitas.

## Metas, MAAS e relatórios

- Meta quantitativa (UP: atingir; DOWN com valor inicial: reduzir; DOWN sem valor inicial:
  limite) ou qualitativa (etapas). O progresso e a situação (no ritmo, abaixo do ritmo, limite…)
  são calculados em `src/lib/goals.ts`; o status salvo só muda por ação da usuária.
- Metas automáticas leem os módulos (faturamento/lucro da Mentoria, resultado/despesas/reservas
  pessoais, remuneração TURBO, leads, conversão, conteúdos publicados, tarefas, hábitos) no
  período da meta. Uma leitura por dia é guardada em `GoalProgress` para o histórico.
- Objetivos são metas com `isObjective`, organizados pelas áreas do MAAS.
- Relatório consolidado e revisões reaproveitam os mesmos cálculos dos módulos (nada é recalculado
  de outro jeito), com exportação CSV.

## Integrações

- **Google Calendar** (`src/server/integrations/google-calendar.ts`): OAuth 2.0 com `state` em
  cookie httpOnly; tokens AES-256-GCM; renovação automática. Leitura dos calendários marcados e
  ligados a um ambiente, janela de 60 dias para trás e 12 meses para frente (`singleEvents`),
  com exclusão do que sumiu no Google. Escrita imediata das alterações locais nos ambientes
  ligados; falha marca `PENDING_PUSH`/`PENDING_DELETE` e é reenviada na próxima sincronização.
  Séries criadas no app não voltam duplicadas. O status do compromisso é só do app.
- **Instagram/Meta** (`src/server/integrations/meta.ts`): Login do Facebook, token de longa
  duração, perfis ligados por `externalUserId`. Sincroniza números do perfil (registro diário de
  origem `API`) e métricas das publicações recentes; publicações novas viram conteúdo publicado.
  Métricas que a API não devolver ficam vazias.
- Sincronização: ao abrir a agenda (se passaram 10 min) e pelo cron diário. Tudo fica em
  `IntegrationSyncLog` e o último erro aparece em Configurações → Integrações.
- **Open Finance**: não implementado. O acesso a dados bancários pelo Open Finance Brasil exige
  ser instituição autorizada ou contratar um agregador (Pluggy, Belvo…). A importação OFX/CSV
  cobre o caso de uso sem intermediários.
- Os testes de integração simulam as respostas das APIs (fetch substituído) no formato
  documentado; a validação contra contas reais depende das credenciais de produção.

## Auditoria e privacidade

- `AuditLog` registra cadastro, login/logout, troca de senha, alterações de perfil e de ambientes,
  exportações, alterações financeiras (com antes/depois), importações, convites e mudanças de
  permissão.
- Campos com `password`, `token` ou `secret` no nome nunca entram no log.
- Tokens OAuth ficam criptografados com AES-256-GCM (`src/server/crypto.ts`, chave em `ENCRYPTION_KEY`).
- A exportação JSON inclui todos os dados da usuária e exclui segredos.
