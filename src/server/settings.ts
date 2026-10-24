import { z } from "zod";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { isValidTimezone } from "@/lib/dates";

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome.").max(100),
  timezone: z.string().refine(isValidTimezone, "Fuso horário inválido."),
  appName: z.string().trim().min(1, "Informe o nome do aplicativo.").max(40),
  theme: z.enum(["LIGHT", "DARK", "SYSTEM"]),
});

export async function updateProfile(userId: string, input: unknown) {
  const data = profileSchema.parse(input);
  const before = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, timezone: true, appName: true, theme: true },
  });
  const user = await db.user.update({ where: { id: userId }, data });
  await audit({ userId, entity: "User", entityId: userId, action: "update_profile", before, after: data });
  return user;
}

export async function updateTheme(userId: string, theme: "LIGHT" | "DARK" | "SYSTEM") {
  await db.user.update({ where: { id: userId }, data: { theme } });
}

export async function listSessions(userId: string) {
  return db.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    select: { id: true, createdAt: true, lastSeenAt: true, userAgent: true, ip: true, expiresAt: true },
    orderBy: { lastSeenAt: "desc" },
  });
}

export async function revokeSession(userId: string, sessionId: string) {
  const result = await db.session.deleteMany({ where: { id: sessionId, userId } });
  if (result.count) await audit({ userId, entity: "Session", entityId: sessionId, action: "revoke" });
  return result.count > 0;
}

export async function recentAudit(userId: string, take = 30) {
  return db.auditLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, entity: true, action: true, createdAt: true, workspace: { select: { name: true } } },
  });
}
