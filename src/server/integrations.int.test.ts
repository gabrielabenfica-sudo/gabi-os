import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { listWorkspaces } from "@/server/workspaces";
import { encrypt, decrypt } from "@/server/crypto";
import { createTestUser } from "../../tests/factories";
import { createEvent, deleteEvent, updateEvent } from "./calendar";
import { syncGoogleConnection, updateExternalCalendar } from "./integrations/google-calendar";
import { syncInstagramProfile } from "./integrations/meta";
import { createContent, createProfile, listContentStatuses } from "./content";

/**
 * Estes testes exercitam a NOSSA lógica de sincronização com respostas simuladas
 * no formato documentado das APIs (fetch substituído). Não substituem um teste
 * real com uma conta Google/Meta — isso depende de credenciais de produção.
 */

const TZ = "America/Sao_Paulo";
type Call = { method: string; url: string; body?: unknown };

function stubFetch(handler: (c: Call) => { status?: number; json?: unknown } | undefined) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (input: string | URL, init: RequestInit = {}) => {
    const call: Call = { method: (init.method ?? "GET").toUpperCase(), url: String(input), body: init.body && typeof init.body === "string" ? JSON.parse(init.body) : init.body };
    calls.push(call);
    const r = handler(call) ?? { status: 404, json: { error: { message: `sem simulação para ${call.method} ${call.url}` } } };
    return new Response(r.status === 204 ? null : JSON.stringify(r.json ?? {}), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
  });
  return calls;
}

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = "test-client";
  process.env.GOOGLE_CLIENT_SECRET = "test-secret";
  process.env.META_APP_ID = "meta-app";
  process.env.META_APP_SECRET = "meta-secret";
  process.env.APP_URL = "http://localhost:3000";
});
afterEach(() => vi.unstubAllGlobals());

async function googleSetup(opts: { expired?: boolean } = {}) {
  const user = await createTestUser();
  const pessoal = (await listWorkspaces(user.id)).find((w) => w.kind === "PESSOAL")!;
  const conn = await db.calendarConnection.create({
    data: {
      userId: user.id,
      provider: "google",
      accountEmail: "gabi@gmail.com",
      accessTokenEnc: encrypt("access-1"),
      refreshTokenEnc: encrypt("refresh-1"),
      expiresAt: new Date(Date.now() + (opts.expired ? -60_000 : 3600_000)),
      status: "ACTIVE",
      calendars: { create: { externalId: "primary@gmail.com", name: "Gabi", isPrimary: true, selected: true } },
    },
    include: { calendars: true },
  });
  return { user, pessoal, conn, cal: conn.calendars[0]! };
}

describe("Google Calendar (respostas simuladas)", () => {
  it("importa eventos do calendário ligado, ignora cancelados e calendários sem ambiente", async () => {
    const { user, pessoal, conn, cal } = await googleSetup();
    const soon = new Date(Date.now() + 2 * 86_400_000);
    const iso = (d: Date) => d.toISOString();
    let remote = [
      { id: "g1", status: "confirmed", etag: '"1"', summary: "Dentista", start: { dateTime: iso(soon) }, end: { dateTime: iso(new Date(soon.getTime() + 3600_000)) } },
      { id: "g2", status: "confirmed", summary: "Viagem", start: { date: iso(soon).slice(0, 10) }, end: { date: iso(new Date(soon.getTime() + 2 * 86_400_000)).slice(0, 10) } },
      { id: "g3", status: "cancelled" },
    ];
    const calls = stubFetch((c) => (c.method === "GET" && c.url.includes("/events?") ? { json: { items: remote } } : undefined));

    // Sem ambiente ligado: nada sincroniza
    await syncGoogleConnection(user.id, conn.id, TZ);
    expect(calls.filter((c) => c.url.includes("/events?"))).toHaveLength(0);

    await updateExternalCalendar(user.id, cal.id, { workspaceId: pessoal.id });
    const [r] = await syncGoogleConnection(user.id, conn.id, TZ);
    expect(r).toMatchObject({ created: 2, deleted: 0 });
    const events = await db.calendarEvent.findMany({ where: { externalCalendarId: cal.id, deletedAt: null }, orderBy: { title: "asc" } });
    expect(events.map((e) => [e.title, e.allDay, e.workspaceId])).toEqual([["Dentista", false, pessoal.id], ["Viagem", true, pessoal.id]]);
    const url = new URL(calls.find((c) => c.url.includes("/events?"))!.url);
    expect(url.searchParams.get("singleEvents")).toBe("true");
    expect(url.pathname).toContain(encodeURIComponent("primary@gmail.com"));

    // Removido no Google → excluído no app; status local é preservado na atualização
    await db.calendarEvent.update({ where: { id: events[0]!.id }, data: { status: "DONE" } });
    remote = [{ ...remote[0]!, summary: "Dentista (remarcado)" }];
    const [r2] = await syncGoogleConnection(user.id, conn.id, TZ);
    expect(r2).toMatchObject({ updated: 1, deleted: 1 });
    const dent = await db.calendarEvent.findUniqueOrThrow({ where: { id: events[0]!.id } });
    expect(dent).toMatchObject({ title: "Dentista (remarcado)", status: "DONE", syncState: "SYNCED" });
    expect((await db.calendarEvent.findUniqueOrThrow({ where: { id: events[1]!.id } })).deletedAt).not.toBeNull();
    expect(await db.integrationSyncLog.count({ where: { userId: user.id, provider: "google", status: "SUCCESS" } })).toBeGreaterThan(0);
  });

  it("envia ao Google o que é criado, alterado e excluído no ambiente ligado; falha fica pendente", async () => {
    const { user, pessoal, cal } = await googleSetup({ expired: true });
    await updateExternalCalendar(user.id, cal.id, { workspaceId: pessoal.id });
    let fail = false;
    const calls = stubFetch((c) => {
      if (c.url.startsWith("https://oauth2.googleapis.com/token")) return { json: { access_token: "access-2", expires_in: 3600 } };
      if (fail) return { status: 503, json: { error: { message: "Backend Error" } } };
      if (c.method === "POST" && c.url.endsWith("/events")) return { json: { id: "remote-1", etag: '"a"', updated: new Date().toISOString() } };
      if (c.method === "PATCH") return { json: { id: "remote-1", etag: '"b"' } };
      if (c.method === "DELETE") return { status: 204 };
      return undefined;
    });
    const day = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const res = await createEvent(user.id, { workspaceId: pessoal.id, title: "Mentoria", startDate: day, startTime: "10:00", endDate: day, endTime: "11:00", rrule: "FREQ=WEEKLY;INTERVAL=1" }, TZ);
    if (!res.saved) throw new Error("não salvou");
    // Token expirado foi renovado antes da chamada
    expect(calls[0]!.url).toContain("oauth2.googleapis.com/token");
    const conn = await db.calendarConnection.findFirstOrThrow({ where: { userId: user.id } });
    expect(decrypt(conn.accessTokenEnc!)).toBe("access-2");
    const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/events"))!;
    expect(post.body).toMatchObject({ summary: "Mentoria", recurrence: ["RRULE:FREQ=WEEKLY;INTERVAL=1"] });
    let ev = await db.calendarEvent.findUniqueOrThrow({ where: { id: res.event.id } });
    expect(ev).toMatchObject({ externalId: "remote-1", externalCalendarId: cal.id, syncState: "SYNCED" });

    // Ocorrências da série criada no app não voltam duplicadas na leitura
    const inst = { id: "remote-1_20261030T130000Z", recurringEventId: "remote-1", summary: "Mentoria", start: { dateTime: new Date(Date.now() + 5 * 86_400_000).toISOString() }, end: { dateTime: new Date(Date.now() + 5 * 86_400_000 + 3600_000).toISOString() } };
    const prev = calls.length;
    const callsHandler = (c: Call) => (c.method === "GET" && c.url.includes("/events?") ? { json: { items: [inst] } } : undefined);
    vi.unstubAllGlobals();
    stubFetch(callsHandler);
    const [r] = await syncGoogleConnection(user.id, cal.connectionId, TZ);
    expect(r).toMatchObject({ created: 0, skipped: 1 });
    void prev;

    // Falha no envio não impede salvar no app
    vi.unstubAllGlobals();
    fail = true;
    stubFetch((c) => (c.method === "PATCH" ? { status: 503, json: { error: { message: "Backend Error" } } } : undefined));
    const upd = await updateEvent(user.id, ev.id, { workspaceId: pessoal.id, title: "Mentoria em grupo", startDate: day, startTime: "10:00", endDate: day, endTime: "11:00" }, TZ);
    expect(upd.saved).toBe(true);
    ev = await db.calendarEvent.findUniqueOrThrow({ where: { id: ev.id } });
    expect(ev).toMatchObject({ title: "Mentoria em grupo", syncState: "PENDING_PUSH" });

    // Na próxima sincronização, o pendente é enviado; excluir no app exclui no Google
    vi.unstubAllGlobals();
    const c2 = stubFetch((c) => {
      if (c.method === "PATCH") return { json: { id: "remote-1", etag: '"c"' } };
      if (c.method === "DELETE") return { status: 204 };
      if (c.method === "GET") return { json: { items: [{ id: "remote-1", status: "confirmed", summary: "Mentoria em grupo", start: { dateTime: ev.start.toISOString() }, end: { dateTime: ev.end.toISOString() } }] } };
      return undefined;
    });
    const [r3] = await syncGoogleConnection(user.id, cal.connectionId, TZ);
    expect(r3!.pushed).toBe(1);
    expect(c2.find((c) => c.method === "PATCH")!.body).toMatchObject({ summary: "Mentoria em grupo" });
    await deleteEvent(user.id, ev.id);
    expect(c2.some((c) => c.method === "DELETE" && c.url.endsWith("/events/remote-1"))).toBe(true);
    expect((await db.calendarEvent.findUniqueOrThrow({ where: { id: ev.id } })).syncState).toBe("SYNCED");
  });

  it("ambientes sem calendário ligado continuam só no app", async () => {
    const { user } = await googleSetup();
    const turbo = (await listWorkspaces(user.id)).find((w) => w.kind === "TURBO")!;
    const calls = stubFetch(() => undefined);
    const day = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const res = await createEvent(user.id, { workspaceId: turbo.id, title: "Reunião TURBO", startDate: day, startTime: "14:00", endDate: day, endTime: "15:00" }, TZ);
    expect(res.saved).toBe(true);
    expect(calls).toHaveLength(0);
  });
});

describe("Instagram (respostas simuladas)", () => {
  it("registra números do perfil, atualiza o post já cadastrado e importa os novos", async () => {
    const user = await createTestUser();
    const mentoria = (await listWorkspaces(user.id)).find((w) => w.kind === "MENTORIA")!;
    const profile = await createProfile(user.id, { workspaceId: mentoria.id, name: "Mentoria", username: "gabi.mentora" });
    const conn = await db.socialConnection.create({ data: { userId: user.id, provider: "meta", accessTokenEnc: encrypt("long-token"), expiresAt: new Date(Date.now() + 30 * 86_400_000), status: "ACTIVE" } });
    await db.socialProfile.update({ where: { id: profile.id }, data: { connectionId: conn.id, externalUserId: "1784" } });
    const published = (await listContentStatuses(user.id, mentoria.id)).find((s) => s.isPublished)!;
    const existing = await createContent(user.id, { workspaceId: mentoria.id, title: "Reel antigo", statusId: published.id, publishedUrl: "https://instagram.com/reel/AAA" }, TZ);
    const now = new Date();
    const calls = stubFetch((c) => {
      const u = new URL(c.url);
      expect(u.searchParams.get("access_token")).toBe("long-token");
      if (u.pathname.endsWith("/1784")) return { json: { followers_count: 1520, media_count: 88, username: "gabi.mentora" } };
      if (u.pathname.endsWith("/1784/insights")) return { json: { data: [{ name: "reach", total_value: { value: 900 } }, { name: "views", total_value: { value: 2400 } }] } };
      if (u.pathname.endsWith("/1784/media")) {
        return {
          json: {
            data: [
              { id: "m1", media_type: "VIDEO", media_product_type: "REELS", permalink: "https://www.instagram.com/reel/AAA/", timestamp: now.toISOString(), like_count: 120, comments_count: 9, caption: "Reel antigo" },
              { id: "m2", media_type: "CAROUSEL_ALBUM", media_product_type: "FEED", permalink: "https://www.instagram.com/p/BBB/", timestamp: now.toISOString(), like_count: 40, comments_count: 2, caption: "Checklist da semana\n#dicas" },
            ],
          },
        };
      }
      if (u.pathname.endsWith("/m1/insights")) return { json: { data: [{ name: "reach", values: [{ value: 3000 }] }, { name: "saved", values: [{ value: 50 }] }] } };
      if (u.pathname.endsWith("/m2/insights")) {
        // Simula a API recusando uma métrica do pacote: cai para uma a uma
        if (u.searchParams.get("metric")!.includes(",")) return { status: 400, json: { error: { message: "(#100) metric views not supported", code: 100 } } };
        if (u.searchParams.get("metric") === "reach") return { json: { data: [{ name: "reach", values: [{ value: 800 }] }] } };
        return { status: 400, json: { error: { message: "unsupported", code: 100 } } };
      }
      return undefined;
    });

    const r = await syncInstagramProfile(user.id, profile.id, TZ, now);
    expect(r).toMatchObject({ followers: 1520, mediaUpdated: 1, mediaImported: 1 });
    const snap = await db.profileMetricSnapshot.findFirstOrThrow({ where: { profileId: profile.id, source: "API" } });
    expect(snap).toMatchObject({ followers: 1520, posts: 88, reach: 900, views: 2400, saves: null });
    const old = await db.contentItem.findUniqueOrThrow({ where: { id: existing.id }, include: { metrics: true } });
    expect(old.externalMediaId).toBe("m1");
    expect(old.metrics[0]).toMatchObject({ source: "API", reach: 3000, saves: 50, likes: 120, comments: 9, views: null });
    const imported = await db.contentItem.findFirstOrThrow({ where: { externalMediaId: "m2" }, include: { metrics: true } });
    expect(imported).toMatchObject({ title: "Checklist da semana", format: "CAROUSEL", statusId: published.id, profileId: profile.id });
    expect(imported.metrics[0]).toMatchObject({ reach: 800, likes: 40 });
    expect(calls.some((c) => c.url.includes("graph.facebook.com/v21.0"))).toBe(true);

    // Rodar de novo no mesmo dia atualiza (não duplica)
    await syncInstagramProfile(user.id, profile.id, TZ, now);
    expect(await db.contentItem.count({ where: { workspaceId: mentoria.id, deletedAt: null } })).toBe(2);
    expect(await db.contentMetric.count({ where: { contentItemId: existing.id } })).toBe(1);
  });

  it("token expirado pede reconexão sem chamar a API", async () => {
    const user = await createTestUser();
    const mentoria = (await listWorkspaces(user.id)).find((w) => w.kind === "MENTORIA")!;
    const profile = await createProfile(user.id, { workspaceId: mentoria.id, name: "X", username: "x" });
    const conn = await db.socialConnection.create({ data: { userId: user.id, provider: "meta", accessTokenEnc: encrypt("t"), expiresAt: new Date(Date.now() - 1000), status: "ACTIVE" } });
    await db.socialProfile.update({ where: { id: profile.id }, data: { connectionId: conn.id, externalUserId: "1" } });
    const calls = stubFetch(() => undefined);
    await expect(syncInstagramProfile(user.id, profile.id, TZ)).rejects.toThrow(/expirou/);
    expect(calls).toHaveLength(0);
  });
});
