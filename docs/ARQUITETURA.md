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
    api/             exportação, health check (e, depois, callbacks OAuth e cron)
  components/
    ui/              design system (botão, campos, card, diálogo, menus…)
    shell/           menu lateral, filtro de ambiente, paleta de comandos
  lib/               utilitários puros (dinheiro, datas)
  server/            regras de negócio, autenticação, autorização, auditoria
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
- Importações (OFX/CSV) usam `externalId` único por conta para evitar duplicidade.

## Auditoria e privacidade

- `AuditLog` registra cadastro, login/logout, troca de senha, alterações de perfil e de ambientes,
  exportações e (nas próximas fases) toda alteração financeira, com antes/depois.
- Campos com `password`, `token` ou `secret` no nome nunca entram no log.
- Tokens OAuth serão guardados com AES-256-GCM (`src/server/crypto.ts`).
- A exportação JSON inclui todos os dados da usuária e exclui segredos.
