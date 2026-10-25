import type { CalendarEvent, Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { pushLocalChange } from "@/server/integrations/google-calendar";
import { AppError, NotFoundError } from "@/server/errors";
import { accessibleWorkspaceIds, requireWorkspaceAccess } from "@/server/workspaces";
import { addDaysYmd, ymdToDate, zonedToUtc } from "@/lib/dates";
import { isValidRRule, occurrencesBetween } from "@/lib/recurrence";

// ═══════════════════════════════════════════════════════════════
// Validação
// ═══════════════════════════════════════════════════════════════

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido.");

export const eventInputSchema = z
  .object({
    workspaceId: z.string().min(1, "Escolha o ambiente."),
    title: z.string().trim().min(1, "Informe o título.").max(300),
    description: z.string().max(10000).nullable().optional(),
    allDay: z.boolean().default(false),
    startDate: ymd,
    startTime: hhmm.optional(),
    endDate: ymd,
    endTime: hhmm.optional(),
    location: z.string().trim().max(500).nullable().optional(),
    attendees: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
    rrule: z.string().max(500).refine(isValidRRule, "Recorrência inválida.").nullable().optional(),
    reminderMinutes: z.number().int().min(0).max(40_320).nullable().optional(),
    notes: z.string().max(10000).nullable().optional(),
    status: z.enum(["NOT_STARTED", "IN_PROGRESS", "DONE", "CANCELLED"]).optional(),
    transparency: z.enum(["BUSY", "FREE"]).optional(),
    taskId: z.string().nullable().optional(),
    projectId: z.string().nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.allDay && (!v.startTime || !v.endTime)) {
      ctx.addIssue({ code: "custom", message: "Informe os horários de início e fim.", path: ["startTime"] });
    }
  });
export type EventInput = z.input<typeof eventInputSchema>;

/** Converte datas/horas digitadas (no fuso da usuária) em instantes UTC. */
export function resolveEventTimes(input: z.output<typeof eventInputSchema>, tz: string): { start: Date; end: Date } {
  if (input.allDay) {
    // Dia inteiro: [início 00:00 UTC, dia seguinte ao fim 00:00 UTC)
    const start = ymdToDate(input.startDate);
    const end = ymdToDate(addDaysYmd(input.endDate, 1));
    if (end <= start) throw new AppError("A data final deve ser igual ou posterior à inicial.");
    return { start, end };
  }
  const start = zonedToUtc(input.startDate, input.startTime!, tz);
  const end = zonedToUtc(input.endDate, input.endTime!, tz);
  if (end <= start) throw new AppError("O fim deve ser depois do início.");
  if (end.getTime() - start.getTime() > 31 * 86_400_000) throw new AppError("Um compromisso não pode durar mais de 31 dias.");
  return { start, end };
}

// ═══════════════════════════════════════════════════════════════
// Ocorrências
// ═══════════════════════════════════════════════════════════════

export type Occurrence = {
  /** eventId para eventos simples; eventId::ISO para ocorrências de série */
  key: string;
  eventId: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  status: CalendarEvent["status"];
  transparency: CalendarEvent["transparency"];
  priority: CalendarEvent["priority"];
  location: string | null;
  isRecurring: boolean;
  workspace: { id: string; name: string; color: string };
};

type EventWithWs = CalendarEvent & { workspace: { id: string; name: string; color: string } };

/** Expande eventos (inclusive recorrentes) para ocorrências que tocam [from, to). */
export function expandEvents(events: EventWithWs[], from: Date, to: Date): Occurrence[] {
  const result: Occurrence[] = [];
  for (const e of events) {
    const duration = e.end.getTime() - e.start.getTime();
    const base = {
      eventId: e.id,
      title: e.title,
      allDay: e.allDay,
      status: e.status,
      transparency: e.transparency,
      priority: e.priority,
      location: e.location,
      isRecurring: Boolean(e.rrule),
      workspace: e.workspace,
    };
    if (!e.rrule) {
      if (e.start < to && e.end > from) result.push({ ...base, key: e.id, start: e.start, end: e.end });
      continue;
    }
    const tz = e.allDay ? "UTC" : e.timezone;
    const starts = occurrencesBetween(e.rrule, e.start, new Date(from.getTime() - duration), to, tz, 2000);
    for (const s of starts) {
      const end = new Date(s.getTime() + duration);
      if (s < to && end > from) {
        result.push({ ...base, key: `${e.id}::${s.toISOString()}`, start: s, end });
      }
    }
  }
  return result.sort((a, b) => a.start.getTime() - b.start.getTime());
}

async function loadEventsInRange(workspaceIds: string[], from: Date, to: Date, excludeId?: string) {
  return db.calendarEvent.findMany({
    where: {
      workspaceId: { in: workspaceIds },
      deletedAt: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
      OR: [
        { rrule: null, start: { lt: to }, end: { gt: from } },
        { rrule: { not: null }, start: { lt: to } },
      ],
    },
    include: { workspace: { select: { id: true, name: true, color: true } } },
    orderBy: { start: "asc" },
  });
}

export async function listOccurrences(userId: string, from: Date, to: Date, workspaceFilter: string | "all" = "all") {
  if (to.getTime() - from.getTime() > 400 * 86_400_000) throw new AppError("Intervalo grande demais.");
  const ids = await accessibleWorkspaceIds(userId, "calendar", workspaceFilter);
  const events = await loadEventsInRange(ids, from, to);
  return expandEvents(events, from, to);
}

// ═══════════════════════════════════════════════════════════════
// Conflitos
// ═══════════════════════════════════════════════════════════════

export type Conflict = { eventId: string; title: string; start: Date; end: Date; workspace: { name: string; color: string } };

function blocks(o: { allDay: boolean; transparency: string; status: string }) {
  return !o.allDay && o.transparency === "BUSY" && o.status !== "CANCELLED";
}

/**
 * Procura sobreposições com compromissos de TODOS os ambientes acessíveis.
 * Eventos "livres", de dia inteiro ou cancelados não bloqueiam horário.
 * Para séries, verifica as ocorrências dos próximos 12 meses.
 */
export async function findConflicts(
  userId: string,
  candidate: { start: Date; end: Date; allDay: boolean; transparency: "BUSY" | "FREE"; rrule?: string | null; timezone: string },
  excludeEventId?: string,
): Promise<Conflict[]> {
  if (!blocks({ allDay: candidate.allDay, transparency: candidate.transparency, status: "NOT_STARTED" })) return [];
  const ids = await accessibleWorkspaceIds(userId, "calendar");
  const duration = candidate.end.getTime() - candidate.start.getTime();
  const windows = candidate.rrule
    ? occurrencesBetween(candidate.rrule, candidate.start, candidate.start, new Date(candidate.start.getTime() + 365 * 86_400_000), candidate.timezone, 400).map(
        (s) => ({ start: s, end: new Date(s.getTime() + duration) }),
      )
    : [{ start: candidate.start, end: candidate.end }];
  if (!windows.length) return [];

  const from = windows[0]!.start;
  const to = windows[windows.length - 1]!.end;
  const existing = expandEvents(await loadEventsInRange(ids, from, to, excludeEventId), from, to).filter(blocks);

  const conflicts = new Map<string, Conflict>();
  for (const w of windows) {
    for (const o of existing) {
      if (o.start < w.end && o.end > w.start && !conflicts.has(o.key)) {
        conflicts.set(o.key, { eventId: o.eventId, title: o.title, start: o.start, end: o.end, workspace: o.workspace });
      }
    }
    if (conflicts.size >= 20) break;
  }
  return [...conflicts.values()];
}

// ═══════════════════════════════════════════════════════════════
// Escrita
// ═══════════════════════════════════════════════════════════════

export type SaveEventResult =
  | { saved: true; event: CalendarEvent; conflicts: Conflict[] }
  | { saved: false; conflicts: Conflict[] };

async function assertRefs(workspaceId: string, taskId?: string | null, projectId?: string | null) {
  if (taskId && !(await db.task.findFirst({ where: { id: taskId, workspaceId, deletedAt: null } }))) {
    throw new AppError("Tarefa vinculada inválida para este ambiente.");
  }
  if (projectId && !(await db.project.findFirst({ where: { id: projectId, workspaceId } }))) {
    throw new AppError("Projeto vinculado inválido para este ambiente.");
  }
}

function toData(input: z.output<typeof eventInputSchema>, times: { start: Date; end: Date }, tz: string) {
  return {
    workspaceId: input.workspaceId,
    title: input.title,
    description: input.description ?? null,
    start: times.start,
    end: times.end,
    allDay: input.allDay,
    timezone: tz,
    location: input.location || null,
    attendees: input.attendees?.length ? input.attendees : undefined,
    priority: input.priority ?? "MEDIUM",
    rrule: input.rrule ?? null,
    reminderMinutes: input.reminderMinutes ?? null,
    notes: input.notes ?? null,
    status: input.status ?? "NOT_STARTED",
    // Dia inteiro não ocupa horário por padrão
    transparency: input.transparency ?? (input.allDay ? "FREE" : "BUSY"),
    taskId: input.taskId ?? null,
    projectId: input.projectId ?? null,
  } satisfies Prisma.CalendarEventUncheckedCreateInput;
}

/**
 * Cria um compromisso. Se houver conflito e `allowConflict` for falso,
 * não salva e devolve os conflitos para a usuária decidir.
 */
export async function createEvent(userId: string, input: EventInput, tz: string, opts: { allowConflict?: boolean } = {}): Promise<SaveEventResult> {
  const data = eventInputSchema.parse(input);
  await requireWorkspaceAccess(userId, data.workspaceId, { module: "calendar", write: true });
  await assertRefs(data.workspaceId, data.taskId, data.projectId);
  const times = resolveEventTimes(data, tz);
  const row = toData(data, times, tz);
  const conflicts = await findConflicts(userId, { ...times, allDay: row.allDay, transparency: row.transparency, rrule: row.rrule, timezone: tz });
  if (conflicts.length && !opts.allowConflict) return { saved: false, conflicts };
  const event = await db.calendarEvent.create({ data: row });
  await pushLocalChange(userId, event.id);
  return { saved: true, event, conflicts };
}

async function loadForWrite(userId: string, eventId: string) {
  const event = await db.calendarEvent.findFirst({ where: { id: eventId, deletedAt: null } });
  if (!event) throw new NotFoundError("Compromisso");
  await requireWorkspaceAccess(userId, event.workspaceId, { module: "calendar", write: true });
  return event;
}

/** Marca alteração local pendente de envio quando o evento veio do Google. */
function syncPatch(event: CalendarEvent) {
  return event.externalId ? { syncState: "PENDING_PUSH" } : {};
}

export async function updateEvent(userId: string, eventId: string, input: EventInput, tz: string, opts: { allowConflict?: boolean } = {}): Promise<SaveEventResult> {
  const existing = await loadForWrite(userId, eventId);
  const data = eventInputSchema.parse(input);
  if (data.workspaceId !== existing.workspaceId) {
    await requireWorkspaceAccess(userId, data.workspaceId, { module: "calendar", write: true });
  }
  await assertRefs(data.workspaceId, data.taskId, data.projectId);
  const times = resolveEventTimes(data, tz);
  const row = toData(data, times, tz);
  const conflicts = await findConflicts(
    userId,
    { ...times, allDay: row.allDay, transparency: row.transparency, rrule: row.rrule, timezone: tz },
    eventId,
  );
  if (conflicts.length && !opts.allowConflict) return { saved: false, conflicts };
  const event = await db.calendarEvent.update({ where: { id: eventId }, data: { ...row, ...syncPatch(existing) } });
  await pushLocalChange(userId, event.id);
  return { saved: true, event, conflicts };
}

/** Reagenda (arrastar no calendário). Para séries, desloca a série inteira. */
export async function rescheduleEvent(
  userId: string,
  eventId: string,
  input: { start: string; end: string; allDay: boolean; occurrenceStart?: string },
  opts: { allowConflict?: boolean } = {},
): Promise<SaveEventResult> {
  const existing = await loadForWrite(userId, eventId);
  const parsed = z
    .object({ start: z.string().datetime(), end: z.string().datetime(), allDay: z.boolean(), occurrenceStart: z.string().datetime().optional() })
    .parse(input);
  let start = new Date(parsed.start);
  let end = new Date(parsed.end);
  if (end <= start) throw new AppError("O fim deve ser depois do início.");
  if (existing.rrule && parsed.occurrenceStart) {
    // Move a série pelo mesmo deslocamento aplicado à ocorrência arrastada
    const delta = start.getTime() - new Date(parsed.occurrenceStart).getTime();
    const duration = end.getTime() - start.getTime();
    start = new Date(existing.start.getTime() + delta);
    end = new Date(start.getTime() + duration);
  }
  const transparency = parsed.allDay && !existing.allDay ? "FREE" : existing.transparency;
  const conflicts = await findConflicts(
    userId,
    { start, end, allDay: parsed.allDay, transparency, rrule: existing.rrule, timezone: existing.timezone },
    eventId,
  );
  if (conflicts.length && !opts.allowConflict) return { saved: false, conflicts };
  const event = await db.calendarEvent.update({
    where: { id: eventId },
    data: { start, end, allDay: parsed.allDay, transparency, ...syncPatch(existing) },
  });
  await pushLocalChange(userId, event.id);
  return { saved: true, event, conflicts };
}

/** Status é sempre explícito: nunca concluímos um evento só porque o horário passou. */
export async function setEventStatus(userId: string, eventId: string, status: CalendarEvent["status"]) {
  const existing = await loadForWrite(userId, eventId);
  z.enum(["NOT_STARTED", "IN_PROGRESS", "DONE", "CANCELLED"]).parse(status);
  void existing;
  return db.calendarEvent.update({ where: { id: eventId }, data: { status } });
}

export async function deleteEvent(userId: string, eventId: string) {
  const existing = await loadForWrite(userId, eventId);
  await db.calendarEvent.update({
    where: { id: eventId },
    data: { deletedAt: new Date(), ...(existing.externalId ? { syncState: "PENDING_DELETE" } : {}) },
  });
  if (existing.externalId) await pushLocalChange(userId, eventId);
}

export async function getEvent(userId: string, eventId: string) {
  const event = await db.calendarEvent.findFirst({
    where: { id: eventId, deletedAt: null },
    include: {
      workspace: { select: { id: true, name: true, color: true } },
      task: { select: { id: true, title: true } },
      project: { select: { id: true, name: true } },
    },
  });
  if (!event) throw new NotFoundError("Compromisso");
  await requireWorkspaceAccess(userId, event.workspaceId, { module: "calendar" });
  return event;
}

/** Próximos compromissos a partir de agora (para dashboard e resumos). */
export async function upcomingOccurrences(userId: string, workspaceFilter: string | "all", from: Date, to: Date, limit = 50) {
  const list = await listOccurrences(userId, from, to, workspaceFilter);
  return list.filter((o) => o.status !== "CANCELLED").slice(0, limit);
}
