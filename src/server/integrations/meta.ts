import type { Prisma, SocialConnection } from "@prisma/client";
import { db } from "@/server/db";
import { AppError, NotFoundError } from "@/server/errors";
import { decrypt, encrypt } from "@/server/crypto";
import { accessibleWorkspaceIds, requireWorkspaceAccess } from "@/server/workspaces";
import { todayYmd, ymdToDate } from "@/lib/dates";
import { mapMediaType, normalizePermalink, pickInsight, titleFromCaption, type MetaInsight } from "@/lib/meta-map";

/**
 * Instagram (contas profissionais) pela Graph API da Meta.
 *
 * - Login com Facebook (a conta do Instagram precisa ser Business/Creator e estar
 *   ligada a uma Página). Token de longa duração (~60 dias), criptografado.
 * - Sincroniza: seguidores e número de publicações do perfil (registro diário com
 *   origem "API"), alcance/visualizações/interações do perfil no dia anterior,
 *   e as publicações recentes com suas métricas. Publicações que já estão no app
 *   (mesmo link ou mesmo id) são atualizadas; as demais são importadas como
 *   conteúdo publicado.
 * - Métricas que a API não devolver ficam vazias — nada é estimado.
 *
 * Requer META_APP_ID, META_APP_SECRET e APP_URL.
 */

export const GRAPH_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
export const META_SCOPES = ["instagram_basic", "instagram_manage_insights", "pages_show_list", "pages_read_engagement", "business_management"];

export class MetaError extends AppError {}

export function metaConfig() {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const appUrl = process.env.APP_URL;
  if (!appId || !appSecret || !appUrl) return null;
  return { appId, appSecret, redirectUri: `${appUrl.replace(/\/$/, "")}/api/integrations/meta/callback` };
}

export function metaAuthUrl(state: string) {
  const cfg = metaConfig();
  if (!cfg) throw new MetaError("Integração com a Meta não configurada no servidor (META_APP_ID, META_APP_SECRET e APP_URL).");
  const p = new URLSearchParams({ client_id: cfg.appId, redirect_uri: cfg.redirectUri, state, response_type: "code", scope: META_SCOPES.join(",") });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${p}`;
}

async function graph<T>(path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (token) url.searchParams.set("access_token", token);
  const res = await fetch(url);
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!res.ok || json.error) {
    const err = new MetaError(`Meta: ${json.error?.message ?? `erro ${res.status}`}`);
    (err as MetaError & { code?: number }).code = json.error?.code;
    throw err;
  }
  return json;
}

type IgAccount = { id: string; username?: string; name?: string; followers_count?: number; media_count?: number };
type Page = { id: string; name: string; instagram_business_account?: IgAccount };

/** Troca o código por token de longa duração e grava a conexão. */
export async function completeMetaAuth(userId: string, code: string) {
  const cfg = metaConfig();
  if (!cfg) throw new MetaError("Integração com a Meta não configurada.");
  const short = await graph<{ access_token: string }>("/oauth/access_token", "", { client_id: cfg.appId, client_secret: cfg.appSecret, redirect_uri: cfg.redirectUri, code }).catch((e) => {
    throw new MetaError(`A Meta recusou a autorização: ${(e as Error).message}`);
  });
  const long = await graph<{ access_token: string; expires_in?: number }>("/oauth/access_token", "", {
    grant_type: "fb_exchange_token",
    client_id: cfg.appId,
    client_secret: cfg.appSecret,
    fb_exchange_token: short.access_token,
  });
  const existing = await db.socialConnection.findFirst({ where: { userId, provider: "meta" } });
  const data = {
    accessTokenEnc: encrypt(long.access_token),
    expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null,
    scope: META_SCOPES.join(","),
    status: "ACTIVE" as const,
    lastError: null,
  };
  const conn = existing ? await db.socialConnection.update({ where: { id: existing.id }, data }) : await db.socialConnection.create({ data: { userId, provider: "meta", ...data } });
  await autoLinkProfiles(userId, conn);
  return conn;
}

function token(conn: SocialConnection) {
  if (!conn.accessTokenEnc) throw new MetaError("Conexão sem token. Conecte de novo.");
  if (conn.expiresAt && conn.expiresAt < new Date()) throw new MetaError("O acesso à Meta expirou. Conecte de novo em Configurações → Integrações.");
  return decrypt(conn.accessTokenEnc);
}

/** Contas do Instagram disponíveis na conexão (via Páginas do Facebook). */
export async function listInstagramAccounts(userId: string) {
  const conn = await db.socialConnection.findFirst({ where: { userId, provider: "meta" } });
  if (!conn) return [];
  const r = await graph<{ data: Page[] }>("/me/accounts", token(conn), { fields: "id,name,instagram_business_account{id,username,name,followers_count,media_count}", limit: "100" });
  return r.data.filter((p) => p.instagram_business_account).map((p) => ({ pageName: p.name, ...p.instagram_business_account! }));
}

/** Liga automaticamente perfis do app com o mesmo @. */
async function autoLinkProfiles(userId: string, conn: SocialConnection) {
  const accounts = await listInstagramAccounts(userId).catch(() => []);
  const ws = await accessibleWorkspaceIds(userId, "content");
  for (const a of accounts) {
    if (!a.username) continue;
    await db.socialProfile.updateMany({
      where: { workspaceId: { in: ws }, connectionId: null, username: { equals: a.username, mode: "insensitive" } },
      data: { connectionId: conn.id, externalUserId: a.id },
    });
  }
}

export async function linkProfile(userId: string, profileId: string, igUserId: string | null) {
  const profile = await db.socialProfile.findUnique({ where: { id: profileId } });
  if (!profile) throw new NotFoundError("Perfil");
  await requireWorkspaceAccess(userId, profile.workspaceId, { module: "content", write: true });
  if (!igUserId) return db.socialProfile.update({ where: { id: profileId }, data: { connectionId: null, externalUserId: null } });
  const conn = await db.socialConnection.findFirst({ where: { userId, provider: "meta" } });
  if (!conn) throw new MetaError("Conecte a Meta primeiro.");
  const accounts = await listInstagramAccounts(userId);
  if (!accounts.some((a) => a.id === igUserId)) throw new MetaError("Conta do Instagram não encontrada nesta conexão.");
  return db.socialProfile.update({ where: { id: profileId }, data: { connectionId: conn.id, externalUserId: igUserId } });
}

export async function getMetaConnection(userId: string) {
  return db.socialConnection.findFirst({ where: { userId, provider: "meta" }, include: { profiles: { select: { id: true, name: true, username: true, externalUserId: true } } } });
}

export async function disconnectMeta(userId: string) {
  const conn = await db.socialConnection.findFirst({ where: { userId, provider: "meta" } });
  if (!conn) return;
  if (conn.accessTokenEnc) await fetch(`${GRAPH}/me/permissions?access_token=${encodeURIComponent(decrypt(conn.accessTokenEnc))}`, { method: "DELETE" }).catch(() => null);
  await db.socialProfile.updateMany({ where: { connectionId: conn.id }, data: { connectionId: null, externalUserId: null } });
  await db.socialConnection.delete({ where: { id: conn.id } });
  await log(userId, "disconnect", "SUCCESS");
}

async function log(userId: string, operation: string, status: string, message?: string, details?: Prisma.InputJsonValue) {
  await db.integrationSyncLog.create({ data: { userId, provider: "meta", operation, status, message: message?.slice(0, 1000), details, finishedAt: new Date() } });
}

type Media = { id: string; caption?: string; media_type?: string; media_product_type?: string; permalink?: string; timestamp?: string; like_count?: number; comments_count?: number };

async function insights(path: string, tok: string, metrics: string[], extra: Record<string, string> = {}): Promise<MetaInsight[]> {
  // A Meta muda os nomes de métricas entre versões: se o pacote falhar, tenta uma a uma
  try {
    return (await graph<{ data: MetaInsight[] }>(path, tok, { metric: metrics.join(","), ...extra })).data;
  } catch {
    const out: MetaInsight[] = [];
    for (const m of metrics) {
      try {
        out.push(...(await graph<{ data: MetaInsight[] }>(path, tok, { metric: m, ...extra })).data);
      } catch {
        /* métrica indisponível para esta conta/publicação */
      }
    }
    return out;
  }
}

export type MetaSyncResult = { profile: string; followers: number | null; mediaUpdated: number; mediaImported: number };

/** Sincroniza um perfil ligado a uma conta do Instagram. */
export async function syncInstagramProfile(userId: string, profileId: string, tz: string, now = new Date()): Promise<MetaSyncResult> {
  const profile = await db.socialProfile.findUnique({ where: { id: profileId }, include: { connection: true } });
  if (!profile) throw new NotFoundError("Perfil");
  await requireWorkspaceAccess(userId, profile.workspaceId, { module: "content", write: true });
  if (!profile.connection || !profile.externalUserId) throw new MetaError("Este perfil não está ligado a uma conta do Instagram.");
  const tok = token(profile.connection);
  const ig = profile.externalUserId;
  const today = todayYmd(tz);

  // Perfil: seguidores e publicações (hoje) + interações de ontem
  const info = await graph<IgAccount>(`/${ig}`, tok, { fields: "followers_count,media_count,username" });
  const since = Math.floor((now.getTime() - 2 * 86_400_000) / 1000);
  const until = Math.floor(now.getTime() / 1000);
  const accountInsights = await insights(`/${ig}/insights`, tok, ["reach", "views", "likes", "comments", "shares", "saves"], { period: "day", metric_type: "total_value", since: String(since), until: String(until) });
  const snap = {
    followers: info.followers_count ?? null,
    posts: info.media_count ?? null,
    reach: pickInsight(accountInsights, "reach"),
    views: pickInsight(accountInsights, "views"),
    likes: pickInsight(accountInsights, "likes"),
    comments: pickInsight(accountInsights, "comments"),
    shares: pickInsight(accountInsights, "shares"),
    saves: pickInsight(accountInsights, "saves"),
  };
  await db.profileMetricSnapshot.upsert({
    where: { profileId_date_source: { profileId, date: ymdToDate(today), source: "API" } },
    create: { profileId, date: ymdToDate(today), source: "API", ...snap },
    update: { ...snap, fetchedAt: now },
  });

  // Publicações recentes
  const media = (await graph<{ data: Media[] }>(`/${ig}/media`, tok, { fields: "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count", limit: "50" })).data;
  const published = await db.contentStatus.findFirst({ where: { workspaceId: profile.workspaceId, isPublished: true } });
  const cutoff = now.getTime() - 60 * 86_400_000;
  let mediaUpdated = 0;
  let mediaImported = 0;
  for (const m of media) {
    // Compara pelo caminho do post (/p/…, /reel/…), com ou sem "www" e parâmetros
    const permalink = m.permalink ? new URL(normalizePermalink(m.permalink)).pathname : null;
    let item = await db.contentItem.findFirst({
      where: { workspaceId: profile.workspaceId, deletedAt: null, OR: [{ externalMediaId: m.id }, ...(permalink && permalink.length > 3 ? [{ publishedUrl: { contains: permalink, mode: "insensitive" as const } }] : [])] },
    });
    const ts = m.timestamp ? new Date(m.timestamp) : null;
    if (!item) {
      if (!published || !ts || ts.getTime() < cutoff) continue;
      item = await db.contentItem.create({
        data: {
          workspaceId: profile.workspaceId,
          profileId,
          statusId: published.id,
          title: titleFromCaption(m.caption),
          format: mapMediaType(m.media_type, m.media_product_type),
          publishDate: ts,
          publishedAt: ts,
          publishedUrl: m.permalink ?? null,
          externalMediaId: m.id,
          notes: "Importado do Instagram.",
        },
      });
      mediaImported++;
    } else {
      await db.contentItem.update({ where: { id: item.id }, data: { externalMediaId: m.id, profileId: item.profileId ?? profileId, publishedUrl: item.publishedUrl ?? m.permalink ?? null } });
      mediaUpdated++;
    }
    const mi = await insights(`/${m.id}/insights`, tok, ["reach", "views", "saved", "shares"]);
    const metric = {
      reach: pickInsight(mi, "reach"),
      views: pickInsight(mi, "views"),
      saves: pickInsight(mi, "saved"),
      shares: pickInsight(mi, "shares"),
      likes: m.like_count ?? null,
      comments: m.comments_count ?? null,
    };
    await db.contentMetric.upsert({
      where: { contentItemId_date_source: { contentItemId: item.id, date: ymdToDate(today), source: "API" } },
      create: { contentItemId: item.id, date: ymdToDate(today), source: "API", ...metric },
      update: { ...metric, fetchedAt: now },
    });
  }
  await db.socialConnection.update({ where: { id: profile.connection.id }, data: { lastSyncAt: now, status: "ACTIVE", lastError: null } });
  const result = { profile: profile.username, followers: snap.followers, mediaUpdated, mediaImported };
  await log(userId, "sync", "SUCCESS", undefined, result);
  return result;
}

export async function syncAllInstagram(userId: string, tz: string) {
  const conn = await db.socialConnection.findFirst({ where: { userId, provider: "meta" } });
  if (!conn) throw new MetaError("Conecte a Meta primeiro.");
  const profiles = await db.socialProfile.findMany({ where: { connectionId: conn.id, externalUserId: { not: null }, archived: false } });
  const results: MetaSyncResult[] = [];
  try {
    for (const p of profiles) results.push(await syncInstagramProfile(userId, p.id, tz));
    return results;
  } catch (e) {
    await db.socialConnection.update({ where: { id: conn.id }, data: { status: "ERROR", lastError: (e as Error).message } });
    await log(userId, "sync", "ERROR", (e as Error).message);
    throw e;
  }
}
