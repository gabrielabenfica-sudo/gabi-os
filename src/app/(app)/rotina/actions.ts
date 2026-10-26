"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/current";
import { run } from "@/server/errors";
import * as routine from "@/server/routine";

async function act<T>(fn: (userId: string) => Promise<T>, message?: string | ((r: T) => string)) {
  const u = await requireUser();
  const r = await run(() => fn(u.id));
  if (r.ok) {
    revalidatePath("/rotina");
    if (message) r.message = typeof message === "function" ? message(r.data) : message;
  }
  return r;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

export const createRoutineItemAction = async (input: routine.RoutineItemInput) => act((u) => routine.createRoutineItem(u, input).then((i) => i.id), "Adicionado à rotina.");
export const updateRoutineItemAction = async (id: string, input: routine.RoutineItemInput) => act((u) => routine.updateRoutineItem(u, id, input).then(() => null), "Rotina atualizada.");
export const setRoutineItemDoneAction = async (id: string, done: boolean) => act((u) => routine.setRoutineItemDone(u, id, done).then(() => null));
export const deleteRoutineItemAction = async (id: string) => act((u) => routine.deleteRoutineItem(u, id), "Removido da rotina.");
export const clearRoutineDayAction = async (date: string) => act((u) => routine.clearRoutineDay(u, date), "Rotina do dia apagada.");
export const copyRoutineDayAction = async (from: string, to: string) =>
  act((u) => routine.copyRoutineDay(u, from, to), (n) => (n ? `${plural(n, "bloco copiado", "blocos copiados")}.` : "Esses blocos já estavam na rotina."));
export const applyRoutineTemplateAction = async (date: string) =>
  act((u) => routine.applyRoutineTemplate(u, date), (n) => (n ? `Rotina padrão aplicada: ${plural(n, "bloco", "blocos")}.` : "A rotina padrão já estava aplicada."));
export const saveDayAsTemplateAction = async (date: string, weekdays: number[]) =>
  act((u) => routine.saveDayAsTemplate(u, date, weekdays), "Rotina padrão atualizada.");

export const createTemplateItemAction = async (input: routine.TemplateItemInput) => act((u) => routine.createTemplateItem(u, input).then(() => null), "Bloco adicionado à rotina padrão.");
export const updateTemplateItemAction = async (id: string, input: routine.TemplateItemInput) => act((u) => routine.updateTemplateItem(u, id, input).then(() => null), "Rotina padrão atualizada.");
export const deleteTemplateItemAction = async (id: string) => act((u) => routine.deleteTemplateItem(u, id), "Bloco removido da rotina padrão.");
