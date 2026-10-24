"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/current";
import { run } from "@/server/errors";
import { saveDashboardPrefs } from "@/server/dashboard";
import { setTaskDone } from "@/server/tasks";
import { setHabitEntry } from "@/server/habits";
import { todayYmd } from "@/lib/dates";

export async function saveDashboardPrefsAction(input: { order: string[]; hidden: string[] }) {
  const u = await requireUser();
  const r = await run(() => saveDashboardPrefs(u.id, input), "Painel personalizado.");
  if (r.ok) revalidatePath("/");
  return r;
}

export async function completeTaskFromDashboardAction(taskId: string) {
  const u = await requireUser();
  const r = await run(() => setTaskDone(u.id, taskId, true, u.timezone), "Tarefa concluída.");
  if (r.ok) revalidatePath("/");
  return r;
}

export async function toggleHabitTodayAction(habitId: string, done: boolean) {
  const u = await requireUser();
  const r = await run(() => setHabitEntry(u.id, habitId, todayYmd(u.timezone), done, u.timezone));
  if (r.ok) revalidatePath("/");
  return r;
}
