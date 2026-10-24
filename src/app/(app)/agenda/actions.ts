"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/current";
import { run } from "@/server/errors";
import * as cal from "@/server/calendar";
import { notesLinkedTo } from "@/server/notes";

export async function listOccurrencesAction(fromIso: string, toIso: string, workspaceIds: string[]) {
  const u = await requireUser();
  return run(async () => {
    const all = await cal.listOccurrences(u.id, new Date(fromIso), new Date(toIso));
    const visible = new Set(workspaceIds);
    return all.filter((o) => visible.has(o.workspace.id));
  });
}

export async function getEventAction(eventId: string) {
  const u = await requireUser();
  return run(async () => ({ event: await cal.getEvent(u.id, eventId), notes: await notesLinkedTo(u.id, "event", eventId) }));
}

export async function createEventAction(input: cal.EventInput, allowConflict = false) {
  const u = await requireUser();
  const r = await run(() => cal.createEvent(u.id, input, u.timezone, { allowConflict }));
  if (r.ok && r.data.saved) revalidatePath("/", "layout");
  return r;
}

export async function updateEventAction(eventId: string, input: cal.EventInput, allowConflict = false) {
  const u = await requireUser();
  const r = await run(() => cal.updateEvent(u.id, eventId, input, u.timezone, { allowConflict }));
  if (r.ok && r.data.saved) revalidatePath("/", "layout");
  return r;
}

export async function rescheduleEventAction(
  eventId: string,
  input: { start: string; end: string; allDay: boolean; occurrenceStart?: string },
  allowConflict = false,
) {
  const u = await requireUser();
  const r = await run(() => cal.rescheduleEvent(u.id, eventId, input, { allowConflict }));
  if (r.ok && r.data.saved) revalidatePath("/", "layout");
  return r;
}

export async function setEventStatusAction(eventId: string, status: "NOT_STARTED" | "IN_PROGRESS" | "DONE" | "CANCELLED") {
  const u = await requireUser();
  const r = await run(() => cal.setEventStatus(u.id, eventId, status), "Status atualizado.");
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export async function deleteEventAction(eventId: string) {
  const u = await requireUser();
  const r = await run(() => cal.deleteEvent(u.id, eventId), "Compromisso excluído.");
  if (r.ok) revalidatePath("/", "layout");
  return r;
}
