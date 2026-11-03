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
