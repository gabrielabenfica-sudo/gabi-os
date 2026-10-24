"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/current";
import { run } from "@/server/errors";
import * as tasks from "@/server/tasks";
import { listAttachments } from "@/server/attachments";
import { notesLinkedTo } from "@/server/notes";

const refresh = () => revalidatePath("/tarefas");

export async function createTaskAction(input: tasks.TaskCreateInput) {
  const u = await requireUser();
  const r = await run(() => tasks.createTask(u.id, input), "Tarefa criada.");
  if (r.ok) refresh();
  return r;
}

export async function updateTaskAction(taskId: string, input: tasks.TaskUpdateInput) {
  const u = await requireUser();
  const r = await run(() => tasks.updateTask(u.id, taskId, input, u.timezone), "Tarefa salva.");
  if (r.ok) refresh();
  return r;
}

export async function moveTaskAction(taskId: string, statusId: string, index: number) {
  const u = await requireUser();
  const r = await run(() => tasks.moveTask(u.id, taskId, statusId, index, u.timezone));
  if (r.ok) refresh();
  return r;
}

export async function setTaskDoneAction(taskId: string, done: boolean) {
  const u = await requireUser();
  const r = await run(() => tasks.setTaskDone(u.id, taskId, done, u.timezone), done ? "Tarefa concluída." : "Tarefa reaberta.");
  if (r.ok) refresh();
  return r;
}

export async function getTaskAction(taskId: string) {
  const u = await requireUser();
  return run(async () => {
    const [task, attachments, notes] = await Promise.all([
      tasks.getTask(u.id, taskId),
      listAttachments(u.id, "task", taskId),
      notesLinkedTo(u.id, "task", taskId),
    ]);
    return { task, attachments, notes };
  });
}

export async function archiveTaskAction(taskId: string, archived: boolean) {
  const u = await requireUser();
  const r = await run(() => tasks.archiveTask(u.id, taskId, archived), archived ? "Tarefa arquivada." : "Tarefa restaurada.");
  if (r.ok) refresh();
  return r;
}

export async function deleteTaskAction(taskId: string) {
  const u = await requireUser();
  const r = await run(() => tasks.deleteTask(u.id, taskId), "Tarefa excluída.");
  if (r.ok) refresh();
  return r;
}

export async function restoreTaskAction(taskId: string) {
  const u = await requireUser();
  const r = await run(() => tasks.restoreTask(u.id, taskId), "Tarefa restaurada.");
  if (r.ok) refresh();
  return r;
}

export async function duplicateTaskAction(taskId: string, asTemplate = false) {
  const u = await requireUser();
  const r = await run(() => tasks.duplicateTask(u.id, taskId, { asTemplate }), asTemplate ? "Modelo salvo." : "Tarefa duplicada.");
  if (r.ok) refresh();
  return r;
}

export async function addChecklistItemAction(taskId: string, text: string) {
  const u = await requireUser();
  return run(() => tasks.addChecklistItem(u.id, taskId, text));
}

export async function updateChecklistItemAction(itemId: string, patch: { text?: string; done?: boolean }) {
  const u = await requireUser();
  const r = await run(() => tasks.updateChecklistItem(u.id, itemId, patch));
  if (r.ok) refresh();
  return r;
}

export async function deleteChecklistItemAction(itemId: string) {
  const u = await requireUser();
  return run(() => tasks.deleteChecklistItem(u.id, itemId));
}

export async function addCommentAction(taskId: string, content: string) {
  const u = await requireUser();
  return run(() => tasks.addComment(u.id, taskId, content));
}

export async function deleteCommentAction(commentId: string) {
  const u = await requireUser();
  return run(() => tasks.deleteComment(u.id, commentId));
}

export async function logTimeAction(taskId: string, input: { minutes: number; date: string; note?: string }) {
  const u = await requireUser();
  return run(() => tasks.logTime(u.id, taskId, input), "Tempo registrado.");
}

export async function deleteTimeEntryAction(entryId: string) {
  const u = await requireUser();
  return run(() => tasks.deleteTimeEntry(u.id, entryId));
}

export async function createStatusAction(workspaceId: string, input: { name: string; category: string }) {
  const u = await requireUser();
  const r = await run(() => tasks.createStatus(u.id, workspaceId, input), "Coluna criada.");
  if (r.ok) refresh();
  return r;
}

export async function updateStatusAction(statusId: string, input: { name?: string; category?: string }) {
  const u = await requireUser();
  const r = await run(() => tasks.updateStatus(u.id, statusId, input), "Coluna atualizada.");
  if (r.ok) refresh();
  return r;
}

export async function reorderStatusesAction(workspaceId: string, ids: string[]) {
  const u = await requireUser();
  const r = await run(() => tasks.reorderStatuses(u.id, workspaceId, ids));
  if (r.ok) refresh();
  return r;
}

export async function deleteStatusAction(statusId: string, moveTo: string) {
  const u = await requireUser();
  const r = await run(() => tasks.deleteStatus(u.id, statusId, moveTo), "Coluna excluída.");
  if (r.ok) refresh();
  return r;
}

export async function createProjectAction(input: { workspaceId: string; name: string; color?: string }) {
  const u = await requireUser();
  const r = await run(() => tasks.createProject(u.id, input), "Projeto criado.");
  if (r.ok) refresh();
  return r;
}

export async function createLabelAction(input: { workspaceId: string; name: string; color?: string }) {
  const u = await requireUser();
  const r = await run(() => tasks.createLabel(u.id, input));
  if (r.ok) refresh();
  return r;
}
