// Recebe as linhas das abas da planilha (enviadas pelo Apps Script instalado nela):
// Tarefas → tarefas; Stories e Reels → conteúdo; Tendências → referências (ambiente Trabalho TURBO).
import { timingSafeEqual } from "node:crypto";
import { env, json, sql as defaultSql, OWNER_EMAIL } from "./lib.mjs";
import { changedFields, isMine, sheetKind, taskFieldsFromRow } from "./sheet-map.mjs";
import { syncContent, syncReferences } from "./sheets-content.mjs";

const MAX_ROWS = 2000;

function tokenOk(received) {
  const expected = env("SHEET_SYNC_TOKEN", "");
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// O servidor tem uma instância só: uma fila simples evita duas sincronizações ao mesmo tempo.
let fila = Promise.resolve();
const emFila = (fn) => {
  const p = fila.then(fn, fn);
  fila = p.catch(() => {});
  return p;
};

const HIST_FIELD = { title: "title", priority: "priority", start_date: "startDate", due_date: "dueDate" };

export async function sheetSync(req) {
  if (req.method !== "POST") return json({ error: "use POST" }, 405);
  if (!tokenOk(req.headers.get("x-sync-token") ?? "")) return json({ error: "forbidden" }, 403);
  const body = await req.json().catch(() => null);
  const spreadsheetId = typeof body?.spreadsheetId === "string" ? body.spreadsheetId.trim() : "";
  const rows = Array.isArray(body?.rows) ? body.rows : null;
  if (!spreadsheetId || !rows) return json({ error: "Envie spreadsheetId e rows." }, 400);
  const kind = sheetKind(typeof body?.sheet === "string" ? body.sheet : "Tarefas");
  if (!kind) return json({ error: `Aba não suportada: ${body?.sheet}` }, 400);
  if (rows.length > MAX_ROWS) return json({ error: `No máximo ${MAX_ROWS} linhas por envio.` }, 400);
  for (const r of rows) {
    if (!r || typeof r.key !== "string" || !r.key || typeof r.values !== "object" || !r.values) {
      return json({ error: "Cada linha precisa de key e values." }, 400);
    }
  }
  try {
    const result = await emFila(() =>
      kind === "tasks"
        ? syncRows(spreadsheetId, rows)
        : kind === "trends"
          ? syncReferences(spreadsheetId, rows)
          : syncContent(spreadsheetId, rows, kind),
    );
    return json({ ok: true, ...result });
  } catch (error) {
    console.error("sheet-sync failed", error);
    return json({ error: error instanceof Error ? error.message : "Falha ao sincronizar." }, 500);
  }
}

export async function syncRows(spreadsheetId, rows, today = new Date(), sql = defaultSql) {
  const [owner] = await sql`select id from neon_auth."user" where lower(email) = ${OWNER_EMAIL} limit 1`;
  if (!owner) throw new Error("Conta da Gabriela não encontrada.");
  const userId = owner.id;
  const [ws] = await sql`
    select id from public.workspaces where user_id = ${userId}::uuid and kind = 'TURBO' order by position limit 1`;
  if (!ws) throw new Error("Ambiente Trabalho TURBO não encontrado.");
  const statuses = await sql`
    select id, name, category, is_done from public.task_statuses
    where workspace_id = ${ws.id} order by position`;
  const statusFor = (cat) => statuses.find((s) => s.category === cat) ?? statuses.find((s) => s.category === "TODO") ?? statuses[0];

  const synced = await sql`
    select row_key, task_id, last_values from public.sheet_sync_rows
    where user_id = ${userId}::uuid and spreadsheet_id = ${spreadsheetId}`;
  const byKey = new Map(synced.map((s) => [s.row_key, s]));
  const taskIds = synced.map((s) => s.task_id).filter(Boolean);
  const tasks = taskIds.length
    ? await sql`select id, status_id, title, priority, start_date::text, due_date::text, history from public.tasks where id = any(${taskIds}::text[])`
    : [];
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  const out = { created: 0, updated: 0, unchanged: 0, ignored: 0, skippedDeleted: 0 };
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.key)) continue;
    seen.add(row.key);
    if (!isMine(row.values)) {
      out.ignored++;
      continue;
    }
    const fields = taskFieldsFromRow(row.values, today);
    const prev = byKey.get(row.key);
    const now = new Date().toISOString();

    if (prev) {
      const task = taskById.get(prev.task_id);
      if (!task) {
        // A tarefa foi apagada no app: não recria.
        out.skippedDeleted++;
        continue;
      }
      const ch = changedFields(prev.last_values, fields);
      if (!Object.keys(ch).length) {
        out.unchanged++;
        continue;
      }
      const history = Array.isArray(task.history) ? [...task.history] : [];
      let statusId = task.status_id;
      let completed = undefined;
      if ("status" in ch) {
        const st = statusFor(ch.status);
        if (st && st.id !== task.status_id) {
          const from = statuses.find((s) => s.id === task.status_id)?.name ?? null;
          history.push({ field: "status", from, to: st.name, at: now });
          statusId = st.id;
          completed = st.is_done ? now : null;
        }
      }
      for (const [k, h] of Object.entries(HIST_FIELD)) {
        if (k in ch) history.push({ field: h, from: task[k] ?? null, to: ch[k] ?? null, at: now });
      }
      const v = (k) => (k in ch ? ch[k] : task[k] ?? null);
      await sql`
        update public.tasks set
          title = ${v("title") ?? task.title},
          priority = ${v("priority")},
          assignee = case when ${"assignee" in ch} then ${ch.assignee ?? null}::text else assignee end,
          start_date = ${v("start_date")}::date,
          due_date = ${v("due_date")}::date,
          description = case when ${"description" in ch} then ${ch.description ?? null}::text else description end,
          status_id = ${statusId},
          completed_at = case when ${completed !== undefined} then ${completed ?? null}::timestamptz else completed_at end,
          history = ${JSON.stringify(history)}::jsonb,
          updated_at = now()
        where id = ${task.id}`;
      await sql`
        update public.sheet_sync_rows set last_values = ${JSON.stringify(fields)}::jsonb, updated_at = now()
        where user_id = ${userId}::uuid and spreadsheet_id = ${spreadsheetId} and row_key = ${row.key}`;
      out.updated++;
      continue;
    }

    if (!fields.title) {
      out.ignored++;
      continue;
    }
    const st = statusFor(fields.status);
    const [pos] = await sql`select coalesce(max(position), 0) + 1 as p from public.tasks where workspace_id = ${ws.id}`;
    const history = [{ field: "created", from: null, to: "Planilha Resultados Marketing", at: now }];
    const [created] = await sql`
      insert into public.tasks (user_id, workspace_id, status_id, title, description, assignee, priority, position,
                                start_date, due_date, completed_at, history)
      values (${userId}::uuid, ${ws.id}, ${st?.id ?? null}, ${fields.title}, ${fields.description}, ${fields.assignee},
              ${fields.priority}, ${pos.p}, ${fields.start_date}::date, ${fields.due_date}::date,
              ${st?.is_done ? now : null}::timestamptz, ${JSON.stringify(history)}::jsonb)
      returning id`;
    await sql`
      insert into public.sheet_sync_rows (user_id, spreadsheet_id, row_key, task_id, last_values)
      values (${userId}::uuid, ${spreadsheetId}, ${row.key}, ${created.id}, ${JSON.stringify(fields)}::jsonb)
      on conflict (user_id, spreadsheet_id, row_key)
      do update set task_id = excluded.task_id, last_values = excluded.last_values, updated_at = now()`;
    out.created++;
  }
  await sql`
    update public.integrations set last_synced_at = now(), updated_at = now()
    where user_id = ${userId}::uuid and provider = 'google_sheets'`;
  return out;
}
