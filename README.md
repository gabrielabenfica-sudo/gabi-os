# Gabi OS

Central de gestão da Gabriela (Trabalho TURBO, Pessoal e Mentoria).

## Como está montado

- **App (pasta raiz):** React + Vite. Publicado como site estático no Render.
  Fala direto com o banco Neon pelo `@neon/neon-js` (login + Data API).
- **Banco:** Neon, projeto `gabi-os`, banco `gabios`. Cada tabela tem Row-Level
  Security: cada pessoa só lê e grava os próprios dados.
- **Servidor (`server/`):** Node, publicado como web service no Render. Roda só o
  que precisa de segredos: assistente (Claude), integrações (Google Agenda e
  Instagram) e a carga inicial.
- **`supabase/migrations/`:** histórico do esquema original (vindo da Enter).

## Variáveis

App (build):
- `VITE_NEON_URL` — URL do banco Neon (sem senha), ex. `https://ep-xxx.c-14.us-east-1.aws.neon.tech/gabios`
- `VITE_API_URL` — URL do servidor, ex. `https://gabi-os-api.onrender.com`

Servidor:
- `DATABASE_URL` — string de conexão do Neon (banco `gabios`)
- `PUBLIC_URL` — URL do próprio servidor (usada no retorno do OAuth)
- `APP_ORIGIN` — URL do app
- `ANTHROPIC_API_KEY` — chave da Anthropic para o assistente (opcional)
- `SEED_DISABLED` — `true` para nunca carregar os dados iniciais

## Ao criar tabelas ou colunas novas

A Data API do Neon guarda uma lista das tabelas. Depois de qualquer mudança no esquema,
atualize essa lista (Console do Neon > Data API > "Refresh schema cache", ou reaplicando a
configuração da Data API). Sem isso, o app recebe erro 404 ao salvar na tabela nova.

## Planilha “Resultados Marketing — Turbo” → Tarefas

A aba **Tarefas** da planilha alimenta o quadro de Tarefas do **Trabalho TURBO**.

- O script `integracoes/planilha-tarefas.gs` fica dentro da planilha (Extensões > Apps Script).
  Ele envia as linhas para `POST /functions/v1/sheet-sync` quando a planilha é editada e a cada
  15 minutos. O cabeçalho `x-sync-token` precisa bater com `SHEET_SYNC_TOKEN` no servidor
  (o token não fica no repositório).
- Entram só linhas com “Tarefa” preenchida e Proprietário = Gabriela (ou vazio).
- Mapeamento: Prioridade → prioridade; Status Pendente → A fazer, Respondido → Em revisão,
  Resolvido → Concluído; Data gravação → início; Data postagem → prazo; Fase, Produtos e
  Observações → descrição.
- Só o que muda **na planilha** é aplicado de novo. O que você muda no app (ex.: arrastar o
  cartão) não é desfeito. Tarefa apagada no app não volta.
- Vínculo linha ↔ tarefa: tabela `sheet_sync_rows` (só o servidor acessa; ver `server/sql/`).
- Testes das regras: `cd server && node --test`.

Variável nova no servidor: `SHEET_SYNC_TOKEN`.
