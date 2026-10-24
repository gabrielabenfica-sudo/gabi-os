"use server";

import { requireUser } from "@/server/auth/current";
import { run } from "@/server/errors";
import { addLinkAttachment, deleteAttachment, listAttachments } from "@/server/attachments";

export async function listAttachmentsAction(entityType: string, entityId: string) {
  const u = await requireUser();
  return run(() => listAttachments(u.id, entityType, entityId));
}

export async function addLinkAttachmentAction(entityType: string, entityId: string, name: string, url: string) {
  const u = await requireUser();
  return run(() => addLinkAttachment(u.id, { entityType, entityId, name, url }), "Link anexado.");
}

export async function deleteAttachmentAction(id: string) {
  const u = await requireUser();
  return run(() => deleteAttachment(u.id, id), "Anexo removido.");
}
