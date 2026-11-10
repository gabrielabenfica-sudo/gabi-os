-- Vínculo entre linhas da planilha (aba Tarefas) e tarefas do Gabi OS.
-- Só o servidor usa esta tabela: RLS ligado e sem políticas (a Data API não enxerga).
create table if not exists public.sheet_sync_rows (
  user_id uuid not null,
  spreadsheet_id text not null,
  row_key text not null,
  task_id text,
  last_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, spreadsheet_id, row_key)
);
alter table public.sheet_sync_rows enable row level security;
revoke all on public.sheet_sync_rows from authenticated;
