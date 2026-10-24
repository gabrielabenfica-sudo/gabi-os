import { db } from "@/server/db";

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

/** Bloqueia após N falhas na janela, por e-mail ou por IP. */
export async function isLoginBlocked(email: string, ip: string | null): Promise<boolean> {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MS);
  const byEmail = await db.loginAttempt.count({
    where: { email: email.toLowerCase(), success: false, createdAt: { gte: since } },
  });
  if (byEmail >= MAX_FAILED_ATTEMPTS) return true;
  if (ip) {
    const byIp = await db.loginAttempt.count({ where: { ip, success: false, createdAt: { gte: since } } });
    if (byIp >= MAX_FAILED_ATTEMPTS * 4) return true;
  }
  return false;
}

export async function recordLoginAttempt(email: string, ip: string | null, success: boolean): Promise<void> {
  await db.loginAttempt.create({ data: { email: email.toLowerCase(), ip, success } });
  if (success) {
    // Limpa falhas anteriores desse e-mail após login bem-sucedido
    await db.loginAttempt.deleteMany({ where: { email: email.toLowerCase(), success: false } });
  }
}
