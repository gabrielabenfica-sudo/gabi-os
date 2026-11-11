// Abas Stories e Reels → quadro de Conteúdo; aba Tendências → Referências (ambiente Trabalho TURBO).
// Mesma regra das tarefas: cria linhas novas; numa linha já enviada, só aplica o que mudou na
// planilha; o que foi apagado no app não volta.
import { sql as defaultSql, OWNER_EMAIL } from "./lib.mjs";
import { changedFields, matchContentStatus, reelFields, storyFields, trendFields } from "./sheet-map.mjs";

async function contexto(sql, spreadsheetId) {
  const [owner] = await sql`select id from neon_auth."user" where lower(email) = ${OWNER_EMAIL} limit 1`;
  if (!owner) throw new Error("Conta da Gabriela não encontrada.");
  const [ws] = await sql`
    select id from public.workspaces where user_id = ${owner.id}::uuid and kind = 'TURBO' order by position limit 1`;
  if (!ws) throw new Error("Ambiente Trabalho TURBO não encontrado.");
  const synced = await sql`
    select row_key, task_id, last_values from public.sheet_sync_rows
    where user_id = ${owner.id}::uuid and spreadsheet_id = ${spreadsheetId}`;
  return { userId: owner.id, wsId: ws.id, byKey: new Map(synced.map((s) => [s.row_key, s])), synced };
}

async function salvarVinculo(sql, userId, spreadsheetId, key, targetId, fields) {
  await sql`
    insert into public.sheet_sync_rows (user_id, spreadsheet_id, row_key, task_id, last_values)
    values (${userId}::uuid, ${spreadsheetId}, ${key}, ${targetId}, ${JSON.stringify(fields)}::jsonb)
    on conflict (user_id, spreadsheet_id, row_key)
    do update set task_id = excluded.task_id, last_values = excluded.last_values, updated_at = now()`;
}

function pickProfile(profiles, hint) {
  if (!hint) return null;
  const n = (p) => `${p.name ?? ""} ${p.username ?? ""}`.toLowerCase();
  const found =
    hint === "turbo"
      ? profiles.find((p) => /turbo/.test(n(p)) && !/an[uú]ncio|ads/.test(n(p)))
      : hint === "samuel"
        ? profiles.find((p) => /samuel/.test(n(p)))
        : profiles.find((p) => /gabi|gabriela/.test(n(p)));
  return found?.id ?? null;
}

export async function syncContent(spreadsheetId, rows, kind, today = new Date(), sql = defaultSql) {
  const { userId, wsId, byKey, synced } = await contexto(sql, spreadsheetId);
  const statuses = await sql`
    select id, name, is_published from public.content_statuses where workspace_id = ${wsId} order by position`;
  const profiles = await sql`
    select id, name, username from public.social_profiles where workspace_id = ${wsId} and coalesce(archived, false) = false`;
  const ids = synced.map((s) => s.task_id).filter(Boolean);
  const existentes = ids.length ? await sql`select id, status_id from public.content_items where id = any(${ids}::text[])` : [];
  const existe = new Map(existentes.map((c) => [c.id, c]));
  const statusId = (txt) => (matchContentStatus(txt, statuses) ?? statuses[0])?.id ?? null;
  const toFields = kind === "stories" ? (r) => storyFields(r, today) : (r) => reelFields(r, today);

  const out = { created: 0, updated: 0, unchanged: 0, ignored: 0, skippedDeleted: 0 };
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.key)) continue;
    seen.add(row.key);
    const f = toFields(row.values);
    const prev = byKey.get(row.key);
    if (prev) {
      if (!existe.has(prev.task_id)) {
        out.skippedDeleted++;
        continue;
      }
      const ch = changedFields(prev.last_values, f);
      if (!Object.keys(ch).length) {
        out.unchanged++;
        continue;
      }
      const has = (k) => k in ch;
      await sql`
        update public.content_items set
          title = case when ${has("title")} then coalesce(${ch.title ?? null}::text, title) else title end,
          format = case when ${has("format")} then ${ch.format ?? null}::text else format end,
          owner = case when ${has("owner")} then ${ch.owner ?? null}::text else owner end,
          publish_date = case when ${has("publish_date")} then ${ch.publish_date ?? null}::timestamptz else publish_date end,
          notes = case when ${has("notes")} then ${ch.notes ?? null}::text else notes end,
          status_id = case when ${has("status")} then ${statusId(ch.status)}::text else status_id end,
          profile_id = case when ${has("profile")} then ${pickProfile(profiles, ch.profile)}::text else profile_id end,
          updated_at = now()
        where id = ${prev.task_id}`;
      await salvarVinculo(sql, userId, spreadsheetId, row.key, prev.task_id, f);
      out.updated++;
      continue;
    }
    if (!f.title) {
      out.ignored++;
      continue;
    }
    const [pos] = await sql`select coalesce(max(position), 0) + 1 as p from public.content_items where workspace_id = ${wsId}`;
    const [criado] = await sql`
      insert into public.content_items (user_id, workspace_id, profile_id, status_id, title, platform, format, owner,
                                        publish_date, notes, position)
      values (${userId}::uuid, ${wsId}, ${pickProfile(profiles, f.profile)}, ${statusId(f.status)}, ${f.title}, 'instagram',
              ${f.format}, ${f.owner}, ${f.publish_date}::timestamptz, ${f.notes}, ${pos.p})
      returning id`;
    await salvarVinculo(sql, userId, spreadsheetId, row.key, criado.id, f);
    out.created++;
  }
  return out;
}

export async function syncReferences(spreadsheetId, rows, today = new Date(), sql = defaultSql) {
  const { userId, wsId, byKey, synced } = await contexto(sql, spreadsheetId);
  const ids = synced.map((s) => s.task_id).filter(Boolean);
  const existentes = ids.length ? await sql`select id from public.content_references where id = any(${ids}::text[])` : [];
  const existe = new Set(existentes.map((r) => r.id));

  const out = { created: 0, updated: 0, unchanged: 0, ignored: 0, skippedDeleted: 0 };
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.key)) continue;
    seen.add(row.key);
    const f = trendFields(row.values);
    const prev = byKey.get(row.key);
    if (prev) {
      if (!existe.has(prev.task_id)) {
        out.skippedDeleted++;
        continue;
      }
      const cmp = { ...f, tags: JSON.stringify(f.tags) };
      const ch = changedFields({ ...prev.last_values, tags: JSON.stringify(prev.last_values?.tags ?? []) }, cmp);
      if (!Object.keys(ch).length) {
        out.unchanged++;
        continue;
      }
      const has = (k) => k in ch;
      await sql`
        update public.content_references set
          theme = case when ${has("theme")} then coalesce(${f.theme}::text, theme) else theme end,
          url = case when ${has("url")} then ${f.url}::text else url end,
          creator = case when ${has("creator")} then ${f.creator}::text else creator end,
          notes = case when ${has("notes")} then ${f.notes}::text else notes end,
          tags = case when ${has("tags")} then ${JSON.stringify(f.tags)}::jsonb else tags end
        where id = ${prev.task_id}`;
      await salvarVinculo(sql, userId, spreadsheetId, row.key, prev.task_id, f);
      out.updated++;
      continue;
    }
    if (!f.theme) {
      out.ignored++;
      continue;
    }
    const [criado] = await sql`
      insert into public.content_references (user_id, workspace_id, url, creator, theme, format, notes, tags)
      values (${userId}::uuid, ${wsId}, ${f.url}, ${f.creator}, ${f.theme}, ${f.format}, ${f.notes}, ${JSON.stringify(f.tags)}::jsonb)
      returning id`;
    await salvarVinculo(sql, userId, spreadsheetId, row.key, criado.id, f);
    out.created++;
  }
  return out;
}
