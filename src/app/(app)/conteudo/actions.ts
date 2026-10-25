"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/current";
import { run } from "@/server/errors";
import * as content from "@/server/content";

const refresh = () => revalidatePath("/", "layout");

async function act<T>(fn: (userId: string, tz: string) => Promise<T>, message?: string) {
  const u = await requireUser();
  const r = await run(() => fn(u.id, u.timezone), message);
  if (r.ok) refresh();
  return r;
}

// Etapas
export const createContentStatusAction = async (workspaceId: string, name: string) => act((u) => content.createContentStatus(u, workspaceId, name).then(() => null), "Etapa criada.");
export const renameContentStatusAction = async (id: string, name: string) => act((u) => content.renameContentStatus(u, id, name).then(() => null), "Etapa renomeada.");
export const reorderContentStatusesAction = async (workspaceId: string, ids: string[]) => act((u) => content.reorderContentStatuses(u, workspaceId, ids));
export const deleteContentStatusAction = async (id: string, moveToId: string) => act((u) => content.deleteContentStatus(u, id, moveToId), "Etapa excluída.");

// Conteúdos
export const createContentAction = async (input: content.ContentInput) => act((u, tz) => content.createContent(u, input, tz).then((c) => c.id), "Conteúdo criado.");
export const updateContentAction = async (id: string, input: Omit<content.ContentInput, "workspaceId">) => act((u, tz) => content.updateContent(u, id, input, tz).then(() => null), "Conteúdo salvo.");
export const moveContentAction = async (id: string, statusId: string, index: number) => act((u) => content.moveContent(u, id, statusId, index).then(() => null));
export const rescheduleContentAction = async (id: string, field: "recordingDate" | "publishDate", date: string) =>
  act((u, tz) => content.rescheduleContent(u, id, field, date, tz).then(() => null), "Data alterada.");
export const duplicateContentAction = async (id: string) => act((u) => content.duplicateContent(u, id).then((c) => c.id), "Conteúdo duplicado.");
export const deleteContentAction = async (id: string) => act((u) => content.deleteContent(u, id), "Conteúdo excluído.");
export async function getContentAction(id: string) {
  const u = await requireUser();
  return run(() => content.getContent(u.id, id));
}
export const saveContentMetricAction = async (id: string, input: Parameters<typeof content.saveContentMetric>[2]) => act((u) => content.saveContentMetric(u, id, input).then(() => null), "Métricas salvas.");
export const deleteContentMetricAction = async (id: string) => act((u) => content.deleteContentMetric(u, id), "Registro excluído.");

// Referências
export const createReferenceAction = async (input: content.ReferenceInput) => act((u) => content.createReference(u, input).then(() => null), "Referência salva.");
export const updateReferenceAction = async (id: string, input: Omit<content.ReferenceInput, "workspaceId">) => act((u) => content.updateReference(u, id, input).then(() => null), "Referência salva.");
export const deleteReferenceAction = async (id: string) => act((u) => content.deleteReference(u, id), "Referência excluída.");
export const contentFromReferenceAction = async (id: string) => act((u, tz) => content.contentFromReference(u, id, tz).then((c) => c.id), "Ideia criada no fluxo de produção.");

// Perfis
export const createProfileAction = async (input: content.ProfileInput) => act((u) => content.createProfile(u, input).then(() => null), "Perfil criado.");
export const updateProfileAction = async (id: string, input: Omit<content.ProfileInput, "workspaceId">) => act((u) => content.updateProfile(u, id, input).then(() => null), "Perfil salvo.");
export const archiveProfileAction = async (id: string, archived: boolean) => act((u) => content.setProfileArchived(u, id, archived).then(() => null), archived ? "Perfil arquivado." : "Perfil reativado.");
export const saveProfileSnapshotAction = async (id: string, input: Parameters<typeof content.saveProfileSnapshot>[2]) => act((u) => content.saveProfileSnapshot(u, id, input).then(() => null), "Números registrados.");
export const deleteProfileSnapshotAction = async (id: string) => act((u) => content.deleteProfileSnapshot(u, id), "Registro excluído.");
