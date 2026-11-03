// Google Calendar and Instagram integrations (status, setup, OAuth connect, sync).
import { corsHeaders, getUser, json, sql, userClient, PUBLIC_URL, APP_ORIGIN } from "./lib.mjs";

const GRAPH = "https://graph.facebook.com/v21.0";

const SCOPES = {
  google_calendar: "https://www.googleapis.com/auth/calendar",
  instagram: "instagram_basic,instagram_manage_insights,pages_show_list,pages_read_engagement,business_management",
};

export const redirectUri = () => `${PUBLIC_URL}/functions/v1/integrations-callback`;

function authorizationUrl(provider, clientId, state) {
  const redirect = redirectUri();
  if (provider === "google_calendar") {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirect,
      response_type: "code",
      scope: SCOPES.google_calendar,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    scope: SCOPES.instagram,
    state,
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
}

async function credential(userId, provider) {
  const rows = await sql`
    select * from public.integration_credentials
    where user_id = ${userId}::uuid and provider = ${provider} limit 1`;
  return rows[0] ?? null;
}

async function config(provider) {
  const rows = await sql`select * from public.integration_config where provider = ${provider} limit 1`;
  return rows[0] ?? null;
}

async function googleAccessToken(userId) {
  const cred = await credential(userId, "google_calendar");
  if (!cred?.access_token) throw new Error("Google Agenda não está conectada.");

  const expiresAt = cred.expires_at ? new Date(cred.expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 60_000) return cred.access_token;
  if (!cred.refresh_token) throw new Error("A conexão com o Google expirou. Conecte novamente.");

  const cfg = await config("google_calendar");
  if (!cfg) throw new Error("Credenciais do Google não configuradas.");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.client_id,
      client_secret: cfg.client_secret,
      grant_type: "refresh_token",
      refresh_token: cred.refresh_token,
    }),
  });
  const token = await res.json();
  if (!res.ok) throw new Error(token.error_description ?? "Falha ao renovar o acesso ao Google.");

  const expires = new Date(Date.now() + (token.expires_in ?? 3600) * 1000).toISOString();
  await sql`
    update public.integration_credentials
    set access_token = ${token.access_token}, expires_at = ${expires}, updated_at = now()
    where id = ${cred.id}`;
  return token.access_token;
}

async function syncGoogle(userId, client) {
  const token = await googleAccessToken(userId);
  const now = Date.now();
  const timeMin = new Date(now - 30 * 86_400_000).toISOString();
  const timeMax = new Date(now + 120 * 86_400_000).toISOString();

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&maxResults=250&orderBy=startTime&timeMin=${timeMin}&timeMax=${timeMax}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error?.message ?? "Falha ao ler o Google Agenda.");

  const remote = payload.items ?? [];
  const { data: existing } = await client
    .from("events")
    .select("id, external_id")
    .eq("user_id", userId)
    .not("external_id", "is", null);
  const byExternal = new Map((existing ?? []).map((row) => [row.external_id, row.id]));

  const { data: workspaces } = await client.from("workspaces").select("id").eq("user_id", userId).order("position");
  const defaultWorkspace = workspaces?.[0]?.id;
  if (!defaultWorkspace) throw new Error("Crie uma área de trabalho antes de sincronizar.");

  let imported = 0;
  let updated = 0;
  for (const item of remote) {
    if (item.status === "cancelled") continue;
    const startIso = item.start?.dateTime ?? (item.start?.date ? `${item.start.date}T00:00:00-03:00` : null);
    const endIso = item.end?.dateTime ?? (item.end?.date ? `${item.end.date}T00:00:00-03:00` : null);
    if (!startIso || !endIso) continue;
    const row = {
      workspace_id: defaultWorkspace,
      title: item.summary ?? "(sem título)",
      description: item.description ?? null,
      start_at: startIso,
      end_at: endIso,
      all_day: Boolean(item.start?.date),
      timezone: item.start?.timeZone ?? "America/Sao_Paulo",
      location: item.location ?? null,
      external_id: item.id,
      sync_state: "SYNCED",
    };
    const knownId = byExternal.get(item.id);
    if (knownId) {
      const { error } = await client.from("events").update(row).eq("id", knownId);
      if (!error) updated += 1;
    } else {
      const id = crypto.randomUUID();
      const { error } = await client.from("events").insert({ ...row, id, user_id: userId, priority: "MEDIUM" });
      if (!error) {
        byExternal.set(item.id, id);
        imported += 1;
      }
    }
  }

  // Local events created in the app are pushed to the Google calendar once.
  const { data: local } = await client
    .from("events")
    .select("*")
    .eq("user_id", userId)
    .eq("sync_state", "LOCAL")
    .is("external_id", null)
    .limit(30);

  let pushed = 0;
  for (const event of local ?? []) {
    const body = {
      summary: event.title,
      description: event.description ?? undefined,
      location: event.location ?? undefined,
      start: { dateTime: event.start_at, timeZone: event.timezone ?? "America/Sao_Paulo" },
      end: { dateTime: event.end_at, timeZone: event.timezone ?? "America/Sao_Paulo" },
    };
    if (event.rrule) body.recurrence = [`RRULE:${event.rrule}`];
    const created = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const createdBody = await created.json();
    if (created.ok && createdBody.id) {
      await client.from("events").update({ external_id: createdBody.id, sync_state: "SYNCED" }).eq("id", event.id);
      pushed += 1;
    }
  }

  await client
    .from("integrations")
    .update({ last_synced_at: new Date().toISOString(), metadata: { imported, updated, pushed } })
    .eq("user_id", userId)
    .eq("provider", "google_calendar");

  return { imported, updated, pushed, total: remote.length };
}

async function syncInstagram(userId, client) {
  const cred = await credential(userId, "instagram");
  if (!cred?.access_token) throw new Error("Instagram não está conectado.");
  const token = cred.access_token;

  const pagesRes = await fetch(
    `${GRAPH}/me/accounts?fields=name,instagram_business_account{id,username,followers_count}&access_token=${encodeURIComponent(token)}`,
  );
  const pagesBody = await pagesRes.json();
  if (!pagesRes.ok) throw new Error(pagesBody?.error?.message ?? "Falha ao ler as contas do Instagram.");

  // One Meta connection covers every professional account linked to the Pages
  // the user administers — several Instagram profiles at once.
  const accounts = (pagesBody.data ?? [])
    .filter((page) => page.instagram_business_account)
    .map((page) => ({ ...page.instagram_business_account, page: page.name }));

  const { data: profiles } = await client
    .from("social_profiles")
    .select("id, username, name")
    .eq("user_id", userId)
    .eq("archived", false);

  const allUsernames = (profiles ?? []).map((profile) => `@${profile.username}`);

  if (!accounts.length) {
    await client
      .from("integrations")
      .update({
        metadata: {
          error:
            "Nenhuma conta profissional do Instagram encontrada. As métricas exigem conta Empresa ou Criador vinculada a uma Página do Facebook.",
          matched: [],
          missing: allUsernames,
        },
      })
      .eq("user_id", userId)
      .eq("provider", "instagram");
    return { profiles: 0, matched: [], missing: allUsernames };
  }

  const today = new Date().toISOString().slice(0, 10);
  const matched = [];

  for (const account of accounts) {
    const username = String(account.username ?? "").toLowerCase();
    const profile = (profiles ?? []).find((row) => String(row.username ?? "").toLowerCase() === username);
    if (!profile) continue;

    let followers = account.followers_count ?? null;
    let reach = null;

    try {
      const detailsRes = await fetch(`${GRAPH}/${account.id}?fields=followers_count&access_token=${encodeURIComponent(token)}`);
      if (detailsRes.ok) {
        const details = await detailsRes.json();
        followers = details.followers_count ?? followers;
      }
    } catch (_error) {
      // keep the followers count from the page listing
    }

    try {
      const insightsRes = await fetch(
        `${GRAPH}/${account.id}/insights?metric=reach&period=day&metric_type=total_value&access_token=${encodeURIComponent(token)}`,
      );
      if (insightsRes.ok) {
        const insights = await insightsRes.json();
        reach = insights?.data?.[0]?.total_value?.value ?? null;
      }
    } catch (_error) {
      reach = null;
    }

    const { data: existing } = await client
      .from("social_snapshots")
      .select("id")
      .eq("user_id", userId)
      .eq("profile_id", profile.id)
      .eq("snapshot_date", today)
      .maybeSingle();

    const values = { followers, reach, source: "API", fetched_at: new Date().toISOString() };

    if (existing) {
      await client.from("social_snapshots").update(values).eq("id", existing.id);
    } else {
      await client.from("social_snapshots").insert({
        id: crypto.randomUUID(),
        user_id: userId,
        profile_id: profile.id,
        snapshot_date: today,
        ...values,
      });
    }
    matched.push(`@${profile.username}`);
  }

  const missing = allUsernames.filter((username) => !matched.includes(username));

  await client
    .from("integrations")
    .update({ last_synced_at: new Date().toISOString(), metadata: { profiles: matched.length, matched, missing } })
    .eq("user_id", userId)
    .eq("provider", "instagram");

  return { profiles: matched.length, matched, missing, accounts: accounts.length };
}

export async function integrations(req) {
  try {
    const user = await getUser(req);
    if (!user) return json({ error: "unauthorized" }, 401);
    const client = userClient(user.token);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = String(body.action ?? "status");

    if (action === "status") {
      const { data: rows } = await client.from("integrations").select("*").eq("user_id", user.id);
      const configs = await sql`select provider, client_id from public.integration_config`;
      const configured = new Set(configs.filter((row) => Boolean(row.client_id)).map((row) => row.provider));
      return json({
        provider: "status",
        redirect_uri: redirectUri(),
        integrations: ["google_calendar", "instagram"].map((provider) => {
          const row = (rows ?? []).find((item) => item.provider === provider);
          return {
            provider,
            configured: configured.has(provider),
            status: row?.status ?? "disconnected",
            account_label: row?.account_label ?? null,
            last_synced_at: row?.last_synced_at ?? null,
            metadata: row?.metadata ?? {},
          };
        }),
      });
    }

    if (action === "save_config") {
      const provider = String(body.provider ?? "");
      if (!SCOPES[provider]) return json({ error: "Provider desconhecido." }, 400);
      const clientId = String(body.client_id ?? "").trim();
      const clientSecret = String(body.client_secret ?? "").trim();
      if (!clientId || !clientSecret) return json({ error: "Preencha o Client ID e o Client Secret." }, 400);
      await sql`
        insert into public.integration_config (provider, client_id, client_secret, updated_at)
        values (${provider}, ${clientId}, ${clientSecret}, now())
        on conflict (provider) do update
          set client_id = excluded.client_id, client_secret = excluded.client_secret, updated_at = now()`;
      return json({ ok: true, redirect_uri: redirectUri() });
    }

    if (action === "connect") {
      const provider = String(body.provider ?? "");
      if (!SCOPES[provider]) return json({ error: "Provider desconhecido." }, 400);
      const cfg = await config(provider);
      if (!cfg?.client_id) {
        return json({ error: "Configure as credenciais deste serviço antes de conectar.", configured: false }, 400);
      }
      const state = crypto.randomUUID();
      const origin = String(body.origin ?? "").replace(/\/$/, "") || APP_ORIGIN;
      await sql`
        insert into public.oauth_states (state, user_id, provider, app_origin)
        values (${state}, ${user.id}::uuid, ${provider}, ${origin})`;
      return json({ url: authorizationUrl(provider, cfg.client_id, state) });
    }

    if (action === "disconnect") {
      const provider = String(body.provider ?? "");
      await sql`delete from public.integration_credentials where user_id = ${user.id}::uuid and provider = ${provider}`;
      await client
        .from("integrations")
        .update({ status: "disconnected", account_label: null, metadata: {}, last_synced_at: null })
        .eq("user_id", user.id)
        .eq("provider", provider);
      return json({ ok: true });
    }

    if (action === "sync") {
      const provider = String(body.provider ?? "");
      const result =
        provider === "google_calendar"
          ? await syncGoogle(user.id, client)
          : provider === "instagram"
            ? await syncInstagram(user.id, client)
            : null;
      if (!result) return json({ error: "Provider desconhecido." }, 400);
      return json({ ok: true, provider, result });
    }

    return json({ error: "Ação desconhecida." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("integrations failed", message);
    return json({ error: message }, 400);
  }
}

export { corsHeaders };
