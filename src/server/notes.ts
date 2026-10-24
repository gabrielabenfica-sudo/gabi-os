import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { AppError, NotFoundError } from "@/server/errors";
import { accessibleWorkspaceIds, requireWorkspaceAccess } from "@/server/workspaces";

/** Extrai o texto plano de um documento do editor (JSON do TipTap/ProseMirror). */
export function extractPlainText(doc: unknown, limit = 100_000): string {
  const out: string[] = [];
  const BLOCKS = new Set(["paragraph", "heading", "listItem", "taskItem", "tableCell", "tableHeader", "blockquote", "codeBlock"]);
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object" || out.join("").length > limit) return;
    const n = node as { type?: string; text?: string; content?: unknown[] };
    if (typeof n.text === "string") out.push(n.text);
    if (Array.isArray(n.content)) n.content.forEach(walk);
    if (n.type && BLOCKS.has(n.type)) out.push("\n");
  };
  walk(doc);
  return out.join("").replace(/\n{3,}/g, "\n\n").trim().slice(0, limit);
}

const contentSchema = z
  .object({ type: z.literal("doc") })
  .passthrough()
  .refine((v) => JSON.stringify(v).length < 2_000_000, "A anotação é grande demais.");

export const LINKABLE = ["task", "event", "project", "mentee", "lead", "content"] as const;
export type LinkableType = (typeof LINKABLE)[number];

// ─── Cadernos (pastas) ─────────────────────────────────────────

export async function listFolders(userId: string, workspaceFilter: string | "all" = "all") {
  const ids = await accessibleWorkspaceIds(userId, "notes", workspaceFilter);
  return db.noteFolder.findMany({ where: { workspaceId: { in: ids } }, orderBy: [{ position: "asc" }, { name: "asc" }] });
}

export async function createFolder(userId: string, input: { workspaceId: string; name: string; parentId?: string | null }) {
  const data = z
    .object({ workspaceId: z.string(), name: z.string().trim().min(1, "Informe o nome.").max(80), parentId: z.string().nullable().optional() })
    .parse(input);
  await requireWorkspaceAccess(userId, data.workspaceId, { module: "notes", write: true });
  if (data.parentId) {
    const parent = await db.noteFolder.findFirst({ where: { id: data.parentId, workspaceId: data.workspaceId } });
    if (!parent) throw new AppError("Caderno pai inválido.");
  }
  const last = await db.noteFolder.findFirst({ where: { workspaceId: data.workspaceId, parentId: data.parentId ?? null }, orderBy: { position: "desc" } });
  return db.noteFolder.create({ data: { ...data, parentId: data.parentId ?? null, position: (last?.position ?? -1) + 1 } });
}

async function loadFolder(userId: string, folderId: string) {
  const folder = await db.noteFolder.findUnique({ where: { id: folderId } });
  if (!folder) throw new NotFoundError("Caderno");
  await requireWorkspaceAccess(userId, folder.workspaceId, { module: "notes", write: true });
  return folder;
}

export async function renameFolder(userId: string, folderId: string, name: string) {
  await loadFolder(userId, folderId);
  return db.noteFolder.update({ where: { id: folderId }, data: { name: z.string().trim().min(1).max(80).parse(name) } });
}

/** Exclui o caderno e subcadernos; as anotações voltam para a raiz do ambiente. */
export async function deleteFolder(userId: string, folderId: string) {
  const folder = await loadFolder(userId, folderId);
  const all = await db.noteFolder.findMany({ where: { workspaceId: folder.workspaceId }, select: { id: true, parentId: true } });
  const ids = new Set([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of all) if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) (ids.add(f.id), (grew = true));
  }
  await db.$transaction([
    db.note.updateMany({ where: { folderId: { in: [...ids] } }, data: { folderId: null } }),
    db.noteFolder.delete({ where: { id: folderId } }),
  ]);
}

// ─── Anotações ─────────────────────────────────────────────────

export type NoteListFilters = { workspaceId?: string | "all"; folderId?: string | null; favorites?: boolean; search?: string; includeDeleted?: boolean };

export async function listNotes(userId: string, filters: NoteListFilters = {}) {
  const ids = await accessibleWorkspaceIds(userId, "notes", filters.workspaceId ?? "all");
  const where: Prisma.NoteWhereInput = { workspaceId: { in: ids }, deletedAt: filters.includeDeleted ? { not: null } : null };
  if (filters.folderId !== undefined) where.folderId = filters.folderId;
  if (filters.favorites) where.favorite = true;
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [{ title: { contains: q, mode: "insensitive" } }, { plainText: { contains: q, mode: "insensitive" } }];
  }
  const notes = await db.note.findMany({
    where,
    select: {
      id: true, title: true, favorite: true, updatedAt: true, folderId: true, plainText: true,
      workspace: { select: { id: true, name: true, color: true } },
    },
    orderBy: [{ favorite: "desc" }, { updatedAt: "desc" }],
    take: 500,
  });
  return notes.map(({ plainText, ...n }) => ({ ...n, excerpt: plainText.slice(0, 160) }));
}

export async function getNote(userId: string, noteId: string) {
  const note = await db.note.findFirst({ where: { id: noteId }, include: { links: true, workspace: { select: { id: true, name: true, color: true } } } });
  if (!note) throw new NotFoundError("Anotação");
  await requireWorkspaceAccess(userId, note.workspaceId, { module: "notes" });
  return { ...note, links: await describeLinks(note.links) };
}

export async function createNote(userId: string, input: { workspaceId: string; folderId?: string | null; title?: string; content?: unknown }) {
  const data = z
    .object({
      workspaceId: z.string(),
      folderId: z.string().nullable().optional(),
      title: z.string().trim().max(200).optional(),
      content: contentSchema.optional(),
    })
    .parse(input);
  await requireWorkspaceAccess(userId, data.workspaceId, { module: "notes", write: true });
  if (data.folderId && !(await db.noteFolder.findFirst({ where: { id: data.folderId, workspaceId: data.workspaceId } }))) {
    throw new AppError("Caderno inválido para este ambiente.");
  }
  return db.note.create({
    data: {
      workspaceId: data.workspaceId,
      folderId: data.folderId ?? null,
      title: data.title || "Sem título",
      content: (data.content ?? { type: "doc", content: [{ type: "paragraph" }] }) as Prisma.InputJsonValue,
      plainText: data.content ? extractPlainText(data.content) : "",
    },
  });
}

async function loadForWrite(userId: string, noteId: string) {
  const note = await db.note.findUnique({ where: { id: noteId } });
  if (!note) throw new NotFoundError("Anotação");
  await requireWorkspaceAccess(userId, note.workspaceId, { module: "notes", write: true });
  return note;
}

/** Salvamento automático: título, conteúdo, caderno e favorito. */
export async function updateNote(
  userId: string,
  noteId: string,
  input: { title?: string; content?: unknown; folderId?: string | null; favorite?: boolean; expectedUpdatedAt?: string },
) {
  const note = await loadForWrite(userId, noteId);
  const data = z
    .object({
      title: z.string().trim().max(200).optional(),
      content: contentSchema.optional(),
      folderId: z.string().nullable().optional(),
      favorite: z.boolean().optional(),
      expectedUpdatedAt: z.string().datetime().optional(),
    })
    .parse(input);
  // Evita sobrescrever uma versão mais nova salva em outra aba
  if (data.expectedUpdatedAt && note.updatedAt.getTime() > new Date(data.expectedUpdatedAt).getTime() + 1) {
    throw new AppError("Esta anotação foi alterada em outra janela. Recarregue para ver a versão mais recente.");
  }
  if (data.folderId && !(await db.noteFolder.findFirst({ where: { id: data.folderId, workspaceId: note.workspaceId } }))) {
    throw new AppError("Caderno inválido para este ambiente.");
  }
  return db.note.update({
    where: { id: noteId },
    data: {
      ...(data.title !== undefined ? { title: data.title || "Sem título" } : {}),
      ...(data.content !== undefined ? { content: data.content as Prisma.InputJsonValue, plainText: extractPlainText(data.content) } : {}),
      ...(data.folderId !== undefined ? { folderId: data.folderId } : {}),
      ...(data.favorite !== undefined ? { favorite: data.favorite } : {}),
    },
    select: { id: true, title: true, favorite: true, folderId: true, updatedAt: true },
  });
}

export async function deleteNote(userId: string, noteId: string) {
  await loadForWrite(userId, noteId);
  await db.note.update({ where: { id: noteId }, data: { deletedAt: new Date() } });
}

export async function restoreNote(userId: string, noteId: string) {
  await loadForWrite(userId, noteId);
  await db.note.update({ where: { id: noteId }, data: { deletedAt: null } });
}

// ─── Vínculos ──────────────────────────────────────────────────

async function entityWorkspace(type: LinkableType, id: string): Promise<{ workspaceId: string; label: string } | null> {
  switch (type) {
    case "task": {
      const t = await db.task.findFirst({ where: { id, deletedAt: null }, select: { workspaceId: true, title: true } });
      return t && { workspaceId: t.workspaceId, label: t.title };
    }
    case "event": {
      const e = await db.calendarEvent.findFirst({ where: { id, deletedAt: null }, select: { workspaceId: true, title: true } });
      return e && { workspaceId: e.workspaceId, label: e.title };
    }
    case "project": {
      const p = await db.project.findUnique({ where: { id }, select: { workspaceId: true, name: true } });
      return p && { workspaceId: p.workspaceId, label: p.name };
    }
    case "mentee": {
      const m = await db.mentee.findFirst({ where: { id, deletedAt: null }, select: { workspaceId: true, name: true } });
      return m && { workspaceId: m.workspaceId, label: m.name };
    }
    case "lead": {
      const l = await db.lead.findFirst({ where: { id, deletedAt: null }, select: { workspaceId: true, name: true } });
      return l && { workspaceId: l.workspaceId, label: l.name };
    }
    case "content": {
      const c = await db.contentItem.findFirst({ where: { id, deletedAt: null }, select: { workspaceId: true, title: true } });
      return c && { workspaceId: c.workspaceId, label: c.title };
    }
  }
}

async function describeLinks(links: { id: string; entityType: string; entityId: string }[]) {
  const out = [];
  for (const l of links) {
    const info = await entityWorkspace(l.entityType as LinkableType, l.entityId);
    out.push({ id: l.id, entityType: l.entityType, entityId: l.entityId, label: info?.label ?? "(removido)" });
  }
  return out;
}

export async function linkNote(userId: string, noteId: string, entityType: string, entityId: string) {
  await loadForWrite(userId, noteId);
  const type = z.enum(LINKABLE).parse(entityType);
  const info = await entityWorkspace(type, entityId);
  if (!info) throw new NotFoundError("Item para vincular");
  await requireWorkspaceAccess(userId, info.workspaceId);
  return db.noteLink.upsert({
    where: { noteId_entityType_entityId: { noteId, entityType: type, entityId } },
    create: { noteId, entityType: type, entityId },
    update: {},
  });
}

export async function unlinkNote(userId: string, linkId: string) {
  const link = await db.noteLink.findUnique({ where: { id: linkId } });
  if (!link) throw new NotFoundError("Vínculo");
  await loadForWrite(userId, link.noteId);
  await db.noteLink.delete({ where: { id: linkId } });
}

/** Anotações vinculadas a um item (para mostrar na tarefa/compromisso). */
export async function notesLinkedTo(userId: string, entityType: LinkableType, entityId: string) {
  const ids = await accessibleWorkspaceIds(userId, "notes");
  return db.note.findMany({
    where: { workspaceId: { in: ids }, deletedAt: null, links: { some: { entityType, entityId } } },
    select: { id: true, title: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
}
