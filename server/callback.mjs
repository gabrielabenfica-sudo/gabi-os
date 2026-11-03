// OAuth redirect target for Google Calendar and Instagram (Meta).
import { sql, APP_ORIGIN } from "./lib.mjs";
import { redirectUri } from "./integrations.mjs";

const GRAPH = "https://graph.facebook.com/v21.0";

function safeOrigin(origin) {
  try {
    const url = new URL(origin);
    if (url.protocol === "http:" || url.protocol === "https:") return url.origin;
  } catch (_error) {
    // fall through
  }
  return APP_ORIGIN;
}

const redirect = (location) => new Response(null, { status: 302, headers: { Location: location } });

export async function integrationsCallback(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  let origin = safeOrigin(APP_ORIGIN);
  let provider = "google_calendar";

  try {
    if (!state) return new Response("Estado de autorização ausente.", { status: 400 });
    const [stateRow] = await sql`select * from public.oauth_states where state = ${state} limit 1`;
    if (!stateRow) return new Response("Autorização expirada. Tente conectar novamente.", { status: 400 });

    origin = safeOrigin(stateRow.app_origin);
    provider = stateRow.provider;
    const userId = stateRow.user_id;
    await sql`delete from public.oauth_states where state = ${state}`;

    if (providerError) return redirect(`${origin}/conexoes?erro=${encodeURIComponent(providerError)}`);
    if (!code) return new Response("Código de autorização ausente.", { status: 400 });

    const [cfg] = await sql`select * from public.integration_config where provider = ${provider} limit 1`;
    if (!cfg?.client_id || !cfg?.client_secret) return new Response("Credenciais não configuradas.", { status: 400 });

    let accessToken = "";
    let refreshToken = null;
    let expiresAt = null;
    let label = null;

    if (provider === "google_calendar") {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: cfg.client_id,
          client_secret: cfg.client_secret,
          redirect_uri: redirectUri(),
          grant_type: "authorization_code",
        }),
      });
      const token = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(token.error_description ?? "Falha ao trocar o código do Google.");
      accessToken = token.access_token;
      refreshToken = token.refresh_token ?? null;
      expiresAt = new Date(Date.now() + (token.expires_in ?? 3600) * 1000).toISOString();

      const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (profileRes.ok) label = (await profileRes.json()).email ?? null;
    } else {
      const shortRes = await fetch(
        `${GRAPH}/oauth/access_token?${new URLSearchParams({
          client_id: cfg.client_id,
          client_secret: cfg.client_secret,
          redirect_uri: redirectUri(),
          code,
        }).toString()}`,
      );
      const shortToken = await shortRes.json();
      if (!shortRes.ok) throw new Error(shortToken?.error?.message ?? "Falha ao conectar o Instagram.");

      const longRes = await fetch(
        `${GRAPH}/oauth/access_token?${new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: cfg.client_id,
          client_secret: cfg.client_secret,
          fb_exchange_token: shortToken.access_token,
        }).toString()}`,
      );
      const longToken = await longRes.json();
      accessToken = longToken.access_token ?? shortToken.access_token;
      const expiresIn = Number(longToken.expires_in ?? 0);
      expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

      const pagesRes = await fetch(
        `${GRAPH}/me/accounts?fields=name,instagram_business_account{username}&access_token=${encodeURIComponent(accessToken)}`,
      );
      if (pagesRes.ok) {
        const first = ((await pagesRes.json()).data ?? [])[0];
        label = first?.instagram_business_account?.username
          ? `@${first.instagram_business_account.username}`
          : (first?.name ?? "Instagram");
      }
    }

    await sql`
      insert into public.integration_credentials (user_id, provider, access_token, refresh_token, expires_at, metadata, updated_at)
      values (${userId}, ${provider}, ${accessToken}, ${refreshToken}, ${expiresAt}, '{}'::jsonb, now())
      on conflict (user_id, provider) do update set
        access_token = excluded.access_token,
        refresh_token = coalesce(excluded.refresh_token, public.integration_credentials.refresh_token),
        expires_at = excluded.expires_at,
        updated_at = now()`;

    await sql`
      insert into public.integrations (user_id, provider, status, account_label, metadata, updated_at)
      values (${userId}, ${provider}, 'connected', ${label}, '{}'::jsonb, now())
      on conflict (user_id, provider) do update set
        status = 'connected', account_label = excluded.account_label, metadata = '{}'::jsonb, updated_at = now()`;

    return redirect(`${origin}/conexoes?conectado=${provider}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("integrations-callback failed", provider, message);
    return redirect(`${origin}/conexoes?erro=${encodeURIComponent(message)}`);
  }
}
