"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/current";
import { run } from "@/server/errors";
import * as notes from "@/server/notes";
import { db } from "@/server/db";
import { accessibleWorkspaceIds } from "@/server/workspaces";

const refresh = () => revalidatePath("/anotacoes");

export async function listNotesAction(filters: notes.NoteListFilters) {
  const u = await requireUser();
  return run(() => notes.listNotes(u.id, filters));
}

export async function getNoteAction(noteId: string) {
  const u = await requireUser();
  return run(() => notes.getNote(u.id, noteId));
}

export async function createNoteAction(input: { workspaceId: string; folderId?: string | null; title?: string }) {
  const u = await requireUser();
  const r = await run(() => notes.createNote(u.id, input));
  if (r.ok) refresh();
  return r;
}

export async function saveNoteAction(noteId: string, input: { title?: string; content?: unknown; folderId?: string | null; favorite?: boolean; expectedUpdatedAt?: string }) {
  const u = await requireUser();
  return run(() => notes.updateNote(u.id, noteId, input));
}

export async function deleteNoteAction(noteId: string) {
  const u = await requireUser();
  const r = await run(() => notes.deleteNote(u.id, noteId), "Anotação excluída.");
  if (r.ok) refresh();
  return r;
}

export async function restoreNoteAction(noteId: string) {
  const u = await requireUser();
  const r = await run(() => notes.restoreNote(u.id, noteId), "Anotação restaurada.");
  if (r.ok) refresh();
  return r;
}

export async function createFolderAction(input: { workspaceId: string; name: string; parentId?: string | null }) {
  const u = await requireUser();
  const r = await run(() => notes.createFolder(u.id, input), "Caderno criado.");
  if (r.ok) refresh();
  return r;
}

export async function renameFolderAction(folderId: string, name: string) {
  const u = await requireUser();
  const r = await run(() => notes.renameFolder(u.id, folderId, name));
  if (r.ok) refresh();
  return r;
}

export async function deleteFolderAction(folderId: string) {
  const u = await requireUser();
  const r = await run(() => notes.deleteFolder(u.id, folderId), "Caderno excluído.");
  if (r.ok) refresh();
  return r;
}

export async function linkNoteAction(noteId: string, entityType: string, entityId: string) {
  const u = await requireUser();
  return run(() => notes.linkNote(u.id, noteId, entityType, entityId), "Vínculo criado.");
}

export async function unlinkNoteAction(linkId: string) {
  const u = await requireUser();
  return run(() => notes.unlinkNote(u.id, linkId));
}

/** Itens que podem ser vinculados a uma anotação (busca por título). */
export async function searchLinkTargetsAction(query: string) {
  const u = await requireUser();
  return run(async () => {
    const q = query.trim();
    const [taskWs, calWs] = await Promise.all([accessibleWorkspaceIds(u.id, "tasks"), accessibleWorkspaceIds(u.id, "calendar")]);
    const contains = { contains: q, mode: "insensitive" as const };
    const [tasks, events, projects] = await Promise.all([
      db.task.findMany({ where: { workspaceId: { in: taskWs }, deletedAt: null, title: contains }, select: { id: true, title: true }, take: 8, orderBy: { updatedAt: "desc" } }),
      db.calendarEvent.findMany({ where: { workspaceId: { in: calWs }, deletedAt: null, title: contains }, select: { id: true, title: true }, take: 8, orderBy: { start: "desc" } }),
      db.project.findMany({ where: { workspaceId: { in: taskWs }, name: contains }, select: { id: true, name: true }, take: 5 }),
    ]);
    return [
      ...tasks.map((t) => ({ type: "task", id: t.id, label: t.title })),
      ...events.map((e) => ({ type: "event", id: e.id, label: e.title })),
      ...projects.map((p) => ({ type: "project", id: p.id, label: p.name })),
    ];
  });
}
