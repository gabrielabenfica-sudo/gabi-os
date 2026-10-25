import type { CalendarConnection, ExternalCalendar, Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { AppError, NotFoundError } from "@/server/errors";
import { decrypt, encrypt } from "@/server/crypto";
import { requireWorkspaceAccess } from "@/server/workspaces";
import { fromGoogle, toGoogle, type GoogleEvent } from "@/lib/google-calendar-map";

/**
 * Integração com o Google Calendar (OAuth 2.0 + API REST v3).
 *
 * - Leitura: eventos dos calendários marcados entram no ambiente escolhido para
 *   cada calendário, numa janela de 60 dias para trás e 12 meses para frente
 *   (séries vêm expandidas em ocorrências).
 * - Escrita: compromissos criados/alterados/excluídos no app em um ambiente
 *   ligado a um calendário são enviados ao Google. Falhas não impedem o
 *   salvamento local: ficam pendentes e são reenviadas na próxima sincronização.
 * - Tokens ficam criptografados (AES-256-GCM). Nada é inventado: se a API
 *   responder erro, ele é registrado e mostrado em Configurações.
 *
 * Requer GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e APP_URL.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";
export const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar"];
const WINDOW_PAST_DAYS = 60;
const WINDOW_FUTURE_DAYS = 365;

export class IntegrationError extends AppError {}

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.APP_URL;
  if (!clientId || !clientSecret || !appUrl) return null;
  return { clientId, clientSecret, redirectUri: `${appUrl.replace(/\/$/, "")}/api/integrations/google/callback` };
}

export function googleAuthUrl(state: string) {
  const cfg = googleConfig();
  if (!cfg) throw new IntegrationError("Google Calendar não configurado no servidor (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e APP_URL).");
  const p = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${p}`;
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; scope?: string; id_token?: string; error?: string; error_description?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !json.access_token) throw new IntegrationError(`Google recusou a autorização: ${json.error_description ?? json.error ?? res.status}`);
  return json;
}

function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1]!, "base64url").toString("utf8")) as { email?: string };
    return payload.email ?? null;
  } catch {
    return null;
  }
}

/** Troca o código do OAuth por tokens e grava a conexão. */
export async function completeGoogleAuth(userId: string, code: string) {
  const cfg = googleConfig();
  if (!cfg) throw new IntegrationError("Google Calendar não configurado.");
  const t = await tokenRequest({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: "authorization_code" });
  const email = emailFromIdToken(t.id_token);
  const existing = await db.calendarConnection.findFirst({ where: { userId, provider: "google", accountEmail: email } });
  const data = {
    accessTokenEnc: encrypt(t.access_token),
    ...(t.refresh_token ? { refreshTokenEnc: encrypt(t.refresh_token) } : {}),
    expiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000),
    scope: t.scope ?? null,
    status: "ACTIVE" as const,
    lastError: null,
  };
  const conn = existing
    ? await db.calendarConnection.update({ where: { id: existing.id }, data })
    : await db.calendarConnection.create({ data: { userId, provider: "google", accountEmail: email, ...data } });
  if (!conn.refreshTokenEnc) throw new IntegrationError("O Google não devolveu um token de atualização. Remova o acesso do app na sua conta Google e conecte de novo.");
  await refreshCalendarList(userId, conn.id);
  return conn;
}

async function accessToken(conn: CalendarConnection, force = false): Promise<string> {
  if (!force && conn.accessTokenEnc && conn.expiresAt && conn.expiresAt > new Date()) return decrypt(conn.accessTokenEnc);
  const cfg = googleConfig();
  if (!cfg) throw new IntegrationError("Google Calendar não configurado.");
  if (!conn.refreshTokenEnc) throw new IntegrationError("Conexão sem token de atualização. Conecte de novo.");
  try {
    const t = await tokenRequest({ refresh_token: decrypt(conn.refreshTokenEnc), client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "refresh_token" });
    await db.calendarConnection.update({ where: { id: conn.id }, data: { accessTokenEnc: encrypt(t.access_token), expiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000) } });
    return t.access_token;
  } catch (e) {
    await db.calendarConnection.update({ where: { id: conn.id }, data: { status: "ERROR", lastError: (e as Error).message } });
    throw e;
  }
}

/** Chamada à API com renovação automática do token (uma tentativa em 401). */
async function gfetch<T>(conn: CalendarConnection, path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const token = await accessToken(conn, retried);
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  if (res.status === 401 && !retried) return gfetch<T>(conn, path, init, true);
  if (res.status === 204 || res.status === 410 && init.method === "DELETE") return undefined as T;
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!res.ok) {
    const err = new IntegrationError(`Google Calendar: ${json.error?.message ?? `erro ${res.status}`}`);
    (err as IntegrationError & { status?: number }).status = res.status;
    throw err;
  }
  return json;
}

async function loadConnection(userId: string, connectionId: string) {
  const conn = await db.calendarConnection.findFirst({ where: { id: connectionId, userId } });
  if (!conn) throw new NotFoundError("Conexão");
  return conn;
}

async function log(userId: string, operation: string, status: string, message?: string, details?: Prisma.InputJsonValue) {
  await db.integrationSyncLog.create({ data: { userId, provider: "google", operation, status, message: message?.slice(0, 1000), details, finishedAt: new Date() } });
}

/** Atualiza a lista de calendários da conta (novos entram desmarcados, exceto o principal). */
export async function refreshCalendarList(userId: string, connectionId: string) {
  const conn = await loadConnection(userId, connectionId);
  type Item = { id: string; summary?: string; summaryOverride?: string; backgroundColor?: string; primary?: boolean; accessRole?: string };
  const items: Item[] = [];
  let pageToken: string | undefined;
  do {
    const r = await gfetch<{ items?: Item[]; nextPageToken?: string }>(conn, `/users/me/calendarList?maxResults=250${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`);
    items.push(...(r.items ?? []));
    pageToken = r.nextPageToken;
  } while (pageToken);
  for (const c of items) {
    await db.externalCalendar.upsert({
      where: { connectionId_externalId: { connectionId, externalId: c.id } },
      create: { connectionId, externalId: c.id, name: c.summaryOverride ?? c.summary ?? c.id, color: c.backgroundColor ?? null, isPrimary: !!c.primary, selected: !!c.primary },
      update: { name: c.summaryOverride ?? c.summary ?? c.id, color: c.backgroundColor ?? null, isPrimary: !!c.primary },
    });
  }
  return items.length;
}

export async function listGoogleConnections(userId: string) {
  return db.calendarConnection.findMany({
    where: { userId, provider: "google" },
    include: { calendars: { include: { workspace: { select: { id: true, name: true } } }, orderBy: [{ isPrimary: "desc" }, { name: "asc" }] } },
    orderBy: { createdAt: "asc" },
  });
}

export async function updateExternalCalendar(userId: string, calendarId: string, input: { selected?: boolean; workspaceId?: string | null }) {
  const cal = await db.externalCalendar.findFirst({ where: { id: calendarId, connection: { userId } } });
  if (!cal) throw new NotFoundError("Calendário");
  if (input.workspaceId) await requireWorkspaceAccess(userId, input.workspaceId, { module: "calendar", write: true });
  return db.externalCalendar.update({ where: { id: calendarId }, data: { ...(input.selected !== undefined ? { selected: input.selected } : {}), ...(input.workspaceId !== undefined ? { workspaceId: input.workspaceId } : {}) } });
}

export async function disconnectGoogle(userId: string, connectionId: string) {
  const conn = await loadConnection(userId, connectionId);
  if (conn.refreshTokenEnc) {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(decrypt(conn.refreshTokenEnc))}`, { method: "POST" }).catch(() => null);
  }
  // Os compromissos importados continuam no app como compromissos locais
  await db.calendarEvent.updateMany({ where: { externalCalendar: { connectionId } }, data: { syncState: "LOCAL" } });
  await db.calendarConnection.delete({ where: { id: connectionId } });
  await log(userId, "disconnect", "SUCCESS");
}

// ═══════════════════════════════════════════════════════════════
// Sincronização
// ═══════════════════════════════════════════════════════════════

type CalendarWithConn = ExternalCalendar & { connection: CalendarConnection };

async function pushOne(cal: CalendarWithConn, eventId: string) {
  const ev = await db.calendarEvent.findUnique({ where: { id: eventId } });
  if (!ev) return;
  const path = `/calendars/${encodeURIComponent(cal.externalId)}/events`;
  if (ev.deletedAt) {
    if (ev.externalId) {
      await gfetch(cal.connection, `${path}/${encodeURIComponent(ev.externalId)}`, { method: "DELETE" }).catch((e: IntegrationError & { status?: number }) => {
        if (e.status !== 404 && e.status !== 410) throw e;
      });
    }
    await db.calendarEvent.update({ where: { id: ev.id }, data: { syncState: "SYNCED" } });
    return;
  }
  const body = JSON.stringify(toGoogle(ev));
  const remote = ev.externalId
    ? await gfetch<GoogleEvent>(cal.connection, `${path}/${encodeURIComponent(ev.externalId)}`, { method: "PATCH", body })
    : await gfetch<GoogleEvent>(cal.connection, path, { method: "POST", body });
  await db.calendarEvent.update({
    where: { id: ev.id },
    data: { externalCalendarId: cal.id, externalId: remote.id, externalEtag: remote.etag ?? null, externalUpdatedAt: remote.updated ? new Date(remote.updated) : null, syncState: "SYNCED", conflictData: undefined },
  });
}

/** Calendário de destino para compromissos novos de um ambiente (o principal primeiro). */
async function destinationFor(workspaceId: string, userId: string) {
  return db.externalCalendar.findFirst({
    where: { workspaceId, selected: true, connection: { userId, status: "ACTIVE" } },
    include: { connection: true },
    orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
  });
}

/**
 * Chamada depois de qualquer alteração local. Nunca lança erro: se o envio falhar,
 * o compromisso fica pendente para a próxima sincronização.
 */
export async function pushLocalChange(userId: string, eventId: string) {
  try {
    const ev = await db.calendarEvent.findUnique({ where: { id: eventId }, include: { externalCalendar: { include: { connection: true } } } });
    if (!ev) return;
    let cal: CalendarWithConn | null = ev.externalCalendar && ev.externalCalendar.connection.status === "ACTIVE" ? ev.externalCalendar : null;
    if (!cal && !ev.externalId && !ev.deletedAt) cal = await destinationFor(ev.workspaceId, userId);
    if (!cal) return;
    if (!ev.externalCalendarId) await db.calendarEvent.update({ where: { id: ev.id }, data: { externalCalendarId: cal.id, syncState: "PENDING_PUSH" } });
    await pushOne(cal, ev.id);
  } catch (e) {
    await db.calendarEvent.updateMany({ where: { id: eventId, syncState: { notIn: ["PENDING_DELETE"] } }, data: { syncState: "PENDING_PUSH" } }).catch(() => null);
    await log(userId, "push", "ERROR", (e as Error).message, { eventId }).catch(() => null);
  }
}

/** Busca todos os eventos da janela (com paginação). */
async function fetchWindow(cal: CalendarWithConn, now: Date) {
  const timeMin = new Date(now.getTime() - WINDOW_PAST_DAYS * 86_400_000).toISOString();
  const timeMax = new Date(now.getTime() + WINDOW_FUTURE_DAYS * 86_400_000).toISOString();
  const out: GoogleEvent[] = [];
  let pageToken: string | undefined;
  let pages = 0;
  do {
    const p = new URLSearchParams({ singleEvents: "true", showDeleted: "true", maxResults: "2500", timeMin, timeMax });
    if (pageToken) p.set("pageToken", pageToken);
    const r = await gfetch<{ items?: GoogleEvent[]; nextPageToken?: string }>(cal.connection, `/calendars/${encodeURIComponent(cal.externalId)}/events?${p}`);
    out.push(...(r.items ?? []));
    pageToken = r.nextPageToken;
  } while (pageToken && ++pages < 20);
  return { items: out, timeMin: new Date(timeMin), timeMax: new Date(timeMax) };
}

export type SyncResult = { calendar: string; created: number; updated: number; deleted: number; pushed: number; skipped: number };

export async function syncCalendar(userId: string, cal: CalendarWithConn, tz: string, now = new Date()): Promise<SyncResult> {
  if (!cal.workspaceId) return { calendar: cal.name, created: 0, updated: 0, deleted: 0, pushed: 0, skipped: 0 };
  const result: SyncResult = { calendar: cal.name, created: 0, updated: 0, deleted: 0, pushed: 0, skipped: 0 };

  // 1) Envia o que ficou pendente
  const pending = await db.calendarEvent.findMany({ where: { externalCalendarId: cal.id, syncState: { in: ["PENDING_PUSH", "PENDING_DELETE"] } }, select: { id: true } });
  for (const p of pending) {
    await pushOne(cal, p.id);
    result.pushed++;
  }

  // 2) Traz a janela do Google
  const { items, timeMin, timeMax } = await fetchWindow(cal, now);
  const local = await db.calendarEvent.findMany({
    where: { externalCalendarId: cal.id },
    select: { id: true, externalId: true, rrule: true, deletedAt: true, syncState: true, start: true },
  });
  const byExternal = new Map(local.filter((l) => l.externalId).map((l) => [l.externalId!, l]));
  // Séries criadas no app: as ocorrências expandidas pelo Google não viram eventos separados
  const localMasters = new Set(local.filter((l) => l.rrule && l.externalId && !l.deletedAt).map((l) => l.externalId!));
  const seen = new Set<string>();

  for (const g of items) {
    if (g.recurringEventId && localMasters.has(g.recurringEventId)) {
      result.skipped++;
      continue;
    }
    if (localMasters.has(g.id)) continue;
    seen.add(g.id);
    const existing = byExternal.get(g.id);
    const fields = fromGoogle(g, tz);
    if (!fields) {
      if (existing && !existing.deletedAt) {
        await db.calendarEvent.update({ where: { id: existing.id }, data: { deletedAt: now, syncState: "SYNCED" } });
        result.deleted++;
      }
      continue;
    }
    const data = { ...fields, attendees: fields.attendees ?? undefined, syncState: "SYNCED" };
    if (existing) {
      await db.calendarEvent.update({ where: { id: existing.id }, data: { ...data, deletedAt: null } });
      result.updated++;
    } else {
      await db.calendarEvent.create({ data: { ...data, workspaceId: cal.workspaceId, externalCalendarId: cal.id, externalId: g.id } });
      result.created++;
    }
  }

  // 3) Sumiu do Google dentro da janela → exclui no app
  for (const l of local) {
    if (!l.externalId || l.deletedAt || seen.has(l.externalId) || localMasters.has(l.externalId)) continue;
    if (l.start < timeMin || l.start > timeMax) continue;
    await db.calendarEvent.update({ where: { id: l.id }, data: { deletedAt: now, syncState: "SYNCED" } });
    result.deleted++;
  }
  await db.externalCalendar.update({ where: { id: cal.id }, data: { lastSyncAt: now } });
  return result;
}

/** Sincroniza todos os calendários marcados (e ligados a um ambiente) de uma conexão. */
export async function syncGoogleConnection(userId: string, connectionId: string, tz: string) {
  const conn = await loadConnection(userId, connectionId);
  const calendars = await db.externalCalendar.findMany({ where: { connectionId, selected: true, workspaceId: { not: null } }, include: { connection: true } });
  const results: SyncResult[] = [];
  try {
    for (const cal of calendars) results.push(await syncCalendar(userId, { ...cal, connection: conn }, tz));
    await db.calendarConnection.update({ where: { id: conn.id }, data: { lastSyncAt: new Date(), status: "ACTIVE", lastError: null } });
    await log(userId, "sync", "SUCCESS", undefined, results as unknown as Prisma.InputJsonValue);
    return results;
  } catch (e) {
    await db.calendarConnection.update({ where: { id: conn.id }, data: { lastError: (e as Error).message, status: "ERROR" } });
    await log(userId, "sync", "ERROR", (e as Error).message);
    throw e;
  }
}

/** Sincroniza se a última vez foi há mais de `maxAgeMinutes` (abrir a agenda chama isto). */
export async function syncGoogleIfStale(userId: string, tz: string, maxAgeMinutes = 10) {
  if (!googleConfig()) return { synced: false, changed: false };
  const conns = await db.calendarConnection.findMany({ where: { userId, provider: "google", status: { in: ["ACTIVE", "ERROR"] } } });
  let changed = false;
  let synced = false;
  for (const c of conns) {
    if (c.lastSyncAt && Date.now() - c.lastSyncAt.getTime() < maxAgeMinutes * 60_000) continue;
    try {
      const r = await syncGoogleConnection(userId, c.id, tz);
      synced = true;
      changed ||= r.some((x) => x.created || x.updated || x.deleted);
    } catch {
      /* erro já registrado na conexão */
    }
  }
  return { synced, changed };
}
