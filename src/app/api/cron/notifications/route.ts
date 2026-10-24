import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/server/db";
import { generateDueNotifications } from "@/server/notifications";

export const dynamic = "force-dynamic";

/**
 * Agendador (ex.: Vercel Cron a cada 15 minutos). Exige o cabeçalho
 * Authorization: Bearer <CRON_SECRET>. Sem CRON_SECRET configurado, fica desativado.
 * As notificações também são geradas quando a usuária abre o app.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const users = await db.user.findMany({ where: { deletedAt: null }, select: { id: true, timezone: true } });
  let created = 0;
  const errors: string[] = [];
  for (const u of users) {
    try {
      created += (await generateDueNotifications(u.id, u.timezone)).created;
    } catch (e) {
      errors.push(`${u.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return NextResponse.json({ users: users.length, created, errors });
}
