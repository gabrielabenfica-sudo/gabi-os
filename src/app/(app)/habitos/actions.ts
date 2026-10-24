"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/current";
import { run } from "@/server/errors";
import * as habits from "@/server/habits";

const refresh = () => revalidatePath("/", "layout");

export async function createHabitAction(input: habits.HabitInput) {
  const u = await requireUser();
  const r = await run(() => habits.createHabit(u.id, input), "Hábito criado.");
  if (r.ok) refresh();
  return r;
}

export async function updateHabitAction(id: string, input: habits.HabitInput) {
  const u = await requireUser();
  const r = await run(() => habits.updateHabit(u.id, id, input), "Hábito salvo.");
  if (r.ok) refresh();
  return r;
}

export async function setHabitActiveAction(id: string, active: boolean) {
  const u = await requireUser();
  const r = await run(() => habits.setHabitActive(u.id, id, active), active ? "Hábito reativado." : "Hábito arquivado.");
  if (r.ok) refresh();
  return r;
}

export async function deleteHabitAction(id: string) {
  const u = await requireUser();
  const r = await run(() => habits.deleteHabit(u.id, id), "Hábito excluído.");
  if (r.ok) refresh();
  return r;
}

export async function setHabitEntryAction(id: string, date: string, done: boolean) {
  const u = await requireUser();
  const r = await run(() => habits.setHabitEntry(u.id, id, date, done, u.timezone));
  if (r.ok) refresh();
  return r;
}
