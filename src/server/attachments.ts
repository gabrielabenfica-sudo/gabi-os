import { db } from "@/server/db";
import { AppError, NotFoundError } from "@/server/errors";
import { requireWorkspaceAccess, type ModuleKey } from "@/server/workspaces";

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif",
  "application/pdf", "text/plain", "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
]);

export const ATTACHABLE: Record<string, ModuleKey> = {
  task: "tasks",
  note: "notes",
  event: "calendar",
  mentee: "mentees",
  content: "content",
};

async function resolveEntity(entityType: string, entityId: string): Promise<string> {
  const where = { id: entityId };
  let row: { workspaceId: string } | null = null;
  if (entityType === "task") row = await db.task.findFirst({ where: { ...where, deletedAt: null }, select: { workspaceId: true } });
  else if (entityType === "note") row = await db.note.findFirst({ where: { ...where, deletedAt: null }, select: { workspaceId: true } });
  else if (entityType === "event") row = await db.calendarEvent.findFirst({ where: { ...where, deletedAt: null }, select: { workspaceId: true } });
  else if (entityType === "mentee") row = await db.mentee.findFirst({ where: { ...where, deletedAt: null }, select: { workspaceId: true } });
  else if (entityType === "content") row = await db.contentItem.findFirst({ where: { ...where, deletedAt: null }, select: { workspaceId: true } });
  else throw new AppError("Tipo de item inválido para anexos.");
  if (!row) throw new NotFoundError("Item");
  return row.workspaceId;
}

export async function addFileAttachment(
  userId: string,
  input: { entityType: string; entityId: string; name: string; mimeType: string; bytes: Uint8Array },
) {
  const workspaceId = await resolveEntity(input.entityType, input.entityId);
  await requireWorkspaceAccess(userId, workspaceId, { module: ATTACHABLE[input.entityType], write: true });
  if (input.bytes.byteLength === 0) throw new AppError("O arquivo está vazio.");
  if (input.bytes.byteLength > MAX_ATTACHMENT_BYTES) throw new AppError("O arquivo passa do limite de 5 MB.");
  if (!ALLOWED_TYPES.has(input.mimeType)) throw new AppError("Tipo de arquivo não permitido.");
  const name = input.name.replace(/[\\/\r\n"]/g, "_").slice(0, 200) || "arquivo";
  return db.attachment.create({
    data: {
      workspaceId,
      entityType: input.entityType,
      entityId: input.entityId,
      name,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
      data: Buffer.from(input.bytes),
    },
    select: { id: true, name: true, mimeType: true, sizeBytes: true, url: true, createdAt: true },
  });
}

export async function addLinkAttachment(userId: string, input: { entityType: string; entityId: string; name: string; url: string }) {
  const workspaceId = await resolveEntity(input.entityType, input.entityId);
  await requireWorkspaceAccess(userId, workspaceId, { module: ATTACHABLE[input.entityType], write: true });
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    throw new AppError("Link inválido.");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new AppError("Use um link http ou https.");
  return db.attachment.create({
    data: { workspaceId, entityType: input.entityType, entityId: input.entityId, name: input.name.trim().slice(0, 200) || url.hostname, url: url.toString() },
    select: { id: true, name: true, mimeType: true, sizeBytes: true, url: true, createdAt: true },
  });
}

export async function listAttachments(userId: string, entityType: string, entityId: string) {
  const workspaceId = await resolveEntity(entityType, entityId);
  await requireWorkspaceAccess(userId, workspaceId, { module: ATTACHABLE[entityType] });
  return db.attachment.findMany({
    where: { entityType, entityId },
    select: { id: true, name: true, mimeType: true, sizeBytes: true, url: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function getAttachmentFile(userId: string, attachmentId: string) {
  const att = await db.attachment.findUnique({ where: { id: attachmentId } });
  if (!att || !att.data) throw new NotFoundError("Arquivo");
  await requireWorkspaceAccess(userId, att.workspaceId, { module: ATTACHABLE[att.entityType] });
  return att;
}

export async function deleteAttachment(userId: string, attachmentId: string) {
  const att = await db.attachment.findUnique({ where: { id: attachmentId }, select: { workspaceId: true, entityType: true } });
  if (!att) throw new NotFoundError("Anexo");
  await requireWorkspaceAccess(userId, att.workspaceId, { module: ATTACHABLE[att.entityType], write: true });
  await db.attachment.delete({ where: { id: attachmentId } });
}
