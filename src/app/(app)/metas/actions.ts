"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/current";
import { run } from "@/server/errors";
import * as goals from "@/server/goals";

const refresh = () => revalidatePath("/", "layout");

async function act<T>(fn: (userId: string, tz: string) => Promise<T>, message?: string) {
  const u = await requireUser();
  const r = await run(() => fn(u.id, u.timezone), message);
  if (r.ok) refresh();
  return r;
}

export const createGoalAction = async (input: goals.GoalInput) => act((u) => goals.createGoal(u, input).then((g) => g.id), "Meta criada.");
export const updateGoalAction = async (id: string, input: Omit<goals.GoalInput, "workspaceId" | "steps">) => act((u) => goals.updateGoal(u, id, input).then(() => null), "Meta salva.");
export const setGoalStatusAction = async (id: string, status: string) => act((u) => goals.setGoalStatus(u, id, status).then(() => null), "Status atualizado.");
export const deleteGoalAction = async (id: string) => act((u) => goals.deleteGoal(u, id), "Meta excluída.");
export const recordGoalValueAction = async (id: string, input: { value: number; date: string; note?: string | null }) => act((u) => goals.recordGoalValue(u, id, input).then(() => null), "Valor registrado.");
export const deleteGoalProgressAction = async (id: string) => act((u) => goals.deleteGoalProgress(u, id), "Registro excluído.");
export const addGoalStepAction = async (id: string, input: { title: string; dueDate?: string | null }) => act((u) => goals.addGoalStep(u, id, input).then(() => null));
export const updateGoalStepAction = async (id: string, input: { done?: boolean; title?: string }) => act((u) => goals.updateGoalStep(u, id, input).then(() => null));
export const deleteGoalStepAction = async (id: string) => act((u) => goals.deleteGoalStep(u, id));
export async function getGoalAction(id: string) {
  const u = await requireUser();
  return run(() => goals.getGoal(u.id, id, u.timezone));
}
