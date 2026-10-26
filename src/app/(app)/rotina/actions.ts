"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/current";
import { run } from "@/server/errors";
import * as routines from "@/server/routines";

const refresh = () => revalidatePath("/", "layout");

export async function createRoutineAction(input: routines.RoutineInput) {
  const u = await requireUser();
  const r = await run(async () => (await routines.createRoutine(u.id, input)).id, input.kind === "SCHEDULE" ? "Rotina criada." : "Processo criado.");
  if (r.ok) refresh();
  return r;
}

export async function updateRoutineAction(id: string, input: routines.RoutineInput) {
  const u = await requireUser();
  const r = await run(async () => (await routines.updateRoutine(u.id, id, input)).id, input.kind === "SCHEDULE" ? "Rotina salva." : "Processo salvo.");
  if (r.ok) refresh();
  return r;
}

export async function setRoutineActiveAction(id: string, active: boolean) {
  const u = await requireUser();
  const r = await run(async () => void (await routines.setRoutineActive(u.id, id, active)), active ? "Reativada." : "Arquivada.");
  if (r.ok) refresh();
  return r;
}

export async function deleteRoutineAction(id: string) {
  const u = await requireUser();
  const r = await run(() => routines.deleteRoutine(u.id, id), "Excluída.");
  if (r.ok) refresh();
  return r;
}

export async function setRoutineCheckAction(itemId: string, date: string, done: boolean) {
  const u = await requireUser();
  const r = await run(async () => void (await routines.setRoutineCheck(u.id, itemId, date, done, u.timezone)));
  if (r.ok) refresh();
  return r;
}

export async function startRunAction(routineId: string) {
  const u = await requireUser();
  const r = await run(async () => void (await routines.startRun(u.id, routineId)), "Execução iniciada.");
  if (r.ok) refresh();
  return r;
}

export async function setRunStepAction(stepId: string, done: boolean) {
  const u = await requireUser();
  const r = await run(async () => void (await routines.setRunStep(u.id, stepId, done)));
  if (r.ok) refresh();
  return r;
}

export async function completeRunAction(runId: string, note: string | null) {
  const u = await requireUser();
  const r = await run(async () => void (await routines.completeRun(u.id, runId, note)), "Execução concluída.");
  if (r.ok) refresh();
  return r;
}

export async function deleteRunAction(runId: string) {
  const u = await requireUser();
  const r = await run(() => routines.deleteRun(u.id, runId), "Execução descartada.");
  if (r.ok) refresh();
  return r;
}
