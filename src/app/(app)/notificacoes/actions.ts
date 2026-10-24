"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/current";
import { run } from "@/server/errors";
import * as n from "@/server/notifications";
import { todayYmd, startOfWeekYmd, addDaysYmd } from "@/lib/dates";

const refresh = () => revalidatePath("/", "layout");

export async function markReadAction(id: string) {
  const u = await requireUser();
  const r = await run(() => n.markRead(u.id, id));
  if (r.ok) refresh();
  return r;
}

export async function markAllReadAction() {
  const u = await requireUser();
  const r = await run(() => n.markAllRead(u.id), "Tudo marcado como lido.");
  if (r.ok) refresh();
  return r;
}

export async function deleteNotificationAction(id: string) {
  const u = await requireUser();
  const r = await run(() => n.deleteNotification(u.id, id));
  if (r.ok) refresh();
  return r;
}

export async function updatePrefsAction(input: n.NotificationPrefs) {
  const u = await requireUser();
  const r = await run(() => n.updatePrefs(u.id, input), "Preferências salvas.");
  if (r.ok) refresh();
  return r;
}

/** Gera o resumo agora (útil para ver como fica, sem esperar o horário). */
export async function previewDigestAction(kind: "DAILY" | "WEEKLY") {
  const u = await requireUser();
  return run(() =>
    kind === "DAILY"
      ? n.buildDailyDigest(u.id, todayYmd(u.timezone), u.timezone)
      : n.buildWeeklyReview(u.id, addDaysYmd(startOfWeekYmd(todayYmd(u.timezone)), -7), u.timezone),
  );
}
