import { db } from "@/server/db";
import { randomToken, sha256 } from "@/server/crypto";

export const SESSION_COOKIE = "gabi_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const REFRESH_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000; // renova quando faltar < 15 dias
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      ip: meta.ip ?? null,
    },
  });
  return { token, expiresAt };
}

export type ValidatedSession = {
  sessionId: string;
  user: { id: string; name: string; email: string; timezone: string; theme: "LIGHT" | "DARK" | "SYSTEM"; appName: string; isAdmin: boolean };
  expiresAt: Date;
  renewed: boolean;
};

/** Valida o token; remove sessões expiradas e renova as próximas do vencimento. */
export async function validateSessionToken(token: string): Promise<ValidatedSession | null> {
  if (!token || token.length > 200) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: {
        select: { id: true, name: true, email: true, timezone: true, theme: true, appName: true, isAdmin: true, deletedAt: true },
      },
    },
  });
  if (!session) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() <= now || session.user.deletedAt) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  let expiresAt = session.expiresAt;
  let renewed = false;
  const data: { expiresAt?: Date; lastSeenAt?: Date } = {};
  if (expiresAt.getTime() - now < REFRESH_THRESHOLD_MS) {
    expiresAt = new Date(now + SESSION_TTL_MS);
    data.expiresAt = expiresAt;
    renewed = true;
  }
  if (now - session.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) data.lastSeenAt = new Date(now);
  if (Object.keys(data).length) await db.session.update({ where: { id: session.id }, data });

  const { deletedAt: _deleted, ...user } = session.user;
  return { sessionId: session.id, user, expiresAt, renewed };
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await db.session.deleteMany({ where: { id: sessionId } });
}

export async function invalidateSessionByToken(token: string): Promise<void> {
  await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

export async function invalidateOtherSessions(userId: string, keepSessionId: string): Promise<number> {
  const result = await db.session.deleteMany({ where: { userId, NOT: { id: keepSessionId } } });
  return result.count;
}
