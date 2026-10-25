"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/current";
import { run } from "@/server/errors";
import * as crm from "@/server/crm";
import * as mentees from "@/server/mentees";
import { createNote, linkNote } from "@/server/notes";

const refresh = () => revalidatePath("/", "layout");

async function act<T>(fn: (userId: string, tz: string) => Promise<T>, message?: string) {
  const u = await requireUser();
  const r = await run(() => fn(u.id, u.timezone), message);
  if (r.ok) refresh();
  return r;
}

// ─── Funil ─────────────────────────────────────────────────────
export const createStageAction = async (workspaceId: string, name: string) => act((u) => crm.createStage(u, workspaceId, name).then(() => null), "Etapa criada.");
export const renameStageAction = async (id: string, name: string) => act((u) => crm.renameStage(u, id, name).then(() => null), "Etapa renomeada.");
export const reorderStagesAction = async (workspaceId: string, ids: string[]) => act((u) => crm.reorderStages(u, workspaceId, ids));
export const deleteStageAction = async (id: string, moveToId: string) => act((u) => crm.deleteStage(u, id, moveToId), "Etapa excluída.");

// ─── Leads ─────────────────────────────────────────────────────
export const createLeadAction = async (input: crm.LeadInput) => act((u) => crm.createLead(u, input).then((l) => l.id), "Lead criado.");
export const updateLeadAction = async (id: string, input: Omit<crm.LeadInput, "workspaceId">) => act((u) => crm.updateLead(u, id, input).then(() => null), "Lead salvo.");
export const moveLeadAction = async (id: string, stageId: string, index: number) => act((u) => crm.moveLead(u, id, stageId, index).then(() => null));
export const markLeadLostAction = async (id: string, reason: string) => act((u) => crm.markLeadLost(u, id, reason), "Lead marcado como perdido.");
export const addLeadActivityAction = async (id: string, input: { type: string; content: string }) => act((u) => crm.addLeadActivity(u, id, input).then(() => null), "Registro adicionado.");
export const deleteLeadActivityAction = async (id: string) => act((u) => crm.deleteLeadActivity(u, id), "Registro excluído.");
export const deleteLeadAction = async (id: string) => act((u) => crm.deleteLead(u, id), "Lead excluído.");
export const convertLeadAction = async (id: string, input: Parameters<typeof crm.convertLead>[2]) => act((u) => crm.convertLead(u, id, input), "Venda registrada.");
export async function getLeadAction(id: string) {
  const u = await requireUser();
  return run(() => crm.getLead(u.id, id));
}

// ─── Mentorados ────────────────────────────────────────────────
export const createMenteeAction = async (input: mentees.MenteeInput) => act((u) => mentees.createMentee(u, input).then((m) => m.id), "Mentorado cadastrado.");
export const updateMenteeAction = async (id: string, input: Omit<mentees.MenteeInput, "workspaceId">) => act((u) => mentees.updateMentee(u, id, input).then(() => null), "Ficha salva.");
export const deleteMenteeAction = async (id: string) => act((u) => mentees.deleteMentee(u, id), "Mentorado excluído.");

export async function scheduleSessionAction(menteeId: string, input: Parameters<typeof mentees.scheduleSession>[2], allowConflict = false) {
  const u = await requireUser();
  const r = await run(() => mentees.scheduleSession(u.id, menteeId, input, u.timezone, { allowConflict }));
  if (r.ok && r.value.saved) refresh();
  return r;
}
export const updateSessionAction = async (id: string, input: { status?: string; summary?: string | null; nextSteps?: string | null }) => act((u) => mentees.updateSession(u, id, input).then(() => null), "Encontro atualizado.");
export const deleteSessionAction = async (id: string) => act((u) => mentees.deleteSession(u, id), "Encontro excluído.");

export const addMenteeGoalAction = async (id: string, input: { title: string; dueDate?: string | null }) => act((u) => mentees.addMenteeGoal(u, id, input).then(() => null), "Meta adicionada.");
export const updateMenteeGoalAction = async (id: string, input: { progress?: number; done?: boolean; title?: string }) => act((u) => mentees.updateMenteeGoal(u, id, input).then(() => null));
export const deleteMenteeGoalAction = async (id: string) => act((u) => mentees.deleteMenteeGoal(u, id), "Meta excluída.");
export const addMaterialAction = async (id: string, input: { title: string; url?: string | null }) => act((u) => mentees.addMaterial(u, id, input).then(() => null), "Material adicionado.");
export const deleteMaterialAction = async (id: string) => act((u) => mentees.deleteMaterial(u, id), "Material excluído.");
export const addTimelineEntryAction = async (id: string, input: { date: string; title: string; content?: string | null }) => act((u) => mentees.addTimelineEntry(u, id, input).then(() => null), "Registro adicionado.");
export const deleteTimelineEntryAction = async (id: string) => act((u) => mentees.deleteTimelineEntry(u, id), "Registro excluído.");
export const addMenteeTaskAction = async (id: string, input: { title: string; dueDate?: string | null }) => act((u) => mentees.addMenteeTask(u, id, input).then(() => null), "Tarefa criada.");

/** Cria uma anotação já vinculada (mentorado, lead ou conteúdo) e devolve o id para abrir no editor. */
export async function createLinkedNoteAction(workspaceId: string, entityType: "mentee" | "lead" | "content", entityId: string, title: string) {
  return act(async (u) => {
    const note = await createNote(u, { workspaceId, title });
    await linkNote(u, note.id, entityType, entityId);
    return note.id;
  });
}
