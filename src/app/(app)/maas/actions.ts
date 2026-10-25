"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/current";
import { run } from "@/server/errors";
import * as maas from "@/server/maas";

async function act<T>(fn: (userId: string) => Promise<T>, message?: string) {
  const u = await requireUser();
  const r = await run(() => fn(u.id), message);
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export const saveAssessmentAction = async (input: maas.AssessmentInput) => act((u) => maas.saveAssessment(u, input).then((a) => a.id), "Avaliação salva.");
export const deleteAssessmentAction = async (id: string) => act((u) => maas.deleteAssessment(u, id), "Avaliação excluída.");
export const createAreaAction = async (name: string) => act((u) => maas.createArea(u, name).then(() => null), "Área criada.");
export const renameAreaAction = async (id: string, name: string) => act((u) => maas.renameArea(u, id, name).then(() => null), "Área renomeada.");
export const setAreaActiveAction = async (id: string, active: boolean) => act((u) => maas.setAreaActive(u, id, active).then(() => null), active ? "Área reativada." : "Área desativada.");
export const reorderAreasAction = async (ids: string[]) => act((u) => maas.reorderAreas(u, ids));
export const objectiveFromScoreAction = async (scoreId: string) => act((u) => maas.objectiveFromScore(u, scoreId).then((g) => g.id), "Objetivo criado.");
