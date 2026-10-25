import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { AppError, NotFoundError } from "@/server/errors";
import { requireWorkspaceAccess } from "@/server/workspaces";
import { audit } from "@/server/audit";
import { addDaysYmd, dateToYmd, todayYmd, ymdToDate, zonedToUtc } from "@/lib/dates";
import { createEvent, type Conflict } from "@/server/calendar";
import { createTask } from "@/server/tasks";

/**
 * Mentorados: dados de mentorados nunca ficam acessíveis por padrão a colaboradores
 * (módulo "mentees" exige permissão explícita).
 */
const access = (userId: string, workspaceId: string, write = false) => requireWorkspaceAccess(userId, workspaceId, { module: "mentees", write });

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

export const menteeSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(1, "Informe o nome.").max(120),
  email: z.string().trim().email("E-mail inválido.").max(200).or(z.literal("")).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  instagram: z.string().trim().max(60).nullable().optional(),
  programId: z.string().nullable().optional(),
  startDate: ymd.nullable().optional(),
  expectedEndDate: ymd.nullable().optional(),
  contractedCents: z.number().int().min(0).max(100_000_000_000).nullable().optional(),
  paymentTerms: z.string().trim().max(200).nullable().optional(),
  status: z.enum(["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"]).optional(),
  notes: z.string().max(10000).nullable().optional(),
});
export type MenteeInput = z.input<typeof menteeSchema>;

function menteeData(d: z.output<typeof menteeSchema>) {
  return {
    name: d.name,
    email: d.email || null,
    phone: d.phone || null,
    instagram: d.instagram ? d.instagram.replace(/^@/, "") : null,
    programId: d.programId || null,
    startDate: d.startDate ? ymdToDate(d.startDate) : null,
    expectedEndDate: d.expectedEndDate ? ymdToDate(d.expectedEndDate) : null,
    contractedCents: d.contractedCents ?? null,
    paymentTerms: d.paymentTerms || null,
    notes: d.notes || null,
  };
}

async function assertProgram(workspaceId: string, programId?: string | null) {
  if (programId && !(await db.mentorshipProgram.findFirst({ where: { id: programId, workspaceId } }))) throw new AppError("Produto inválido para este ambiente.");
}

export async function listMentees(userId: string, workspaceId: string, filters: { status?: string; search?: string } = {}, tz = "America/Sao_Paulo") {
  await access(userId, workspaceId);
  const where: Prisma.MenteeWhereInput = { workspaceId, deletedAt: null };
  if (filters.status && ["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"].includes(filters.status)) where.status = filters.status as "ACTIVE";
  if (filters.search?.trim()) {
    const q = { contains: filters.search.trim(), mode: "insensitive" as const };
    where.OR = [{ name: q }, { email: q }, { instagram: q }];
  }
  const now = new Date();
  const mentees = await db.mentee.findMany({
    where,
    include: {
      program: { select: { id: true, name: true } },
      sessions: { where: { status: { in: ["SCHEDULED", "DONE"] } }, select: { date: true, status: true }, orderBy: { date: "asc" } },
      goals: { select: { done: true, progress: true } },
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  const today = todayYmd(tz);
  return mentees.map(({ sessions, goals, ...m }) => ({
    ...m,
    nextSession: sessions.find((s) => s.status === "SCHEDULED" && s.date >= now)?.date ?? null,
    sessionsDone: sessions.filter((s) => s.status === "DONE").length,
    goalsTotal: goals.length,
    goalsDone: goals.filter((g) => g.done).length,
    endingSoon: m.status === "ACTIVE" && m.expectedEndDate ? dateToYmd(m.expectedEndDate) <= addDaysYmd(today, 14) : false,
  }));
}

export type MenteeRow = Awaited<ReturnType<typeof listMentees>>[number];

export async function getMentee(userId: string, menteeId: string) {
  const mentee = await db.mentee.findFirst({
    where: { id: menteeId, deletedAt: null },
    include: {
      program: { select: { id: true, name: true, durationWeeks: true } },
      sessions: { orderBy: { date: "desc" } },
      goals: { orderBy: [{ done: "asc" }, { createdAt: "asc" }] },
      materials: { orderBy: { createdAt: "desc" } },
      timeline: { orderBy: { date: "desc" } },
      lead: { select: { id: true, name: true, source: true, createdAt: true } },
      tasks: {
        where: { deletedAt: null },
        include: { status: { select: { name: true, isDone: true } } },
        orderBy: [{ completedAt: "asc" }, { dueDate: "asc" }],
      },
      sales: {
        where: { deletedAt: null },
        include: { receivables: { orderBy: { number: "asc" } } },
        orderBy: { saleDate: "desc" },
      },
    },
  });
  if (!mentee) throw new NotFoundError("Mentorado");
  await access(userId, mentee.workspaceId);
  // Vendas e parcelas são dados do financeiro; tarefas exigem o módulo de tarefas
  const [canFinance, canTasks] = await Promise.all(
    (["finance", "tasks"] as const).map((module) => requireWorkspaceAccess(userId, mentee.workspaceId, { module }).then(() => true, () => false)),
  );
  return { ...mentee, sales: canFinance ? mentee.sales : [], tasks: canTasks ? mentee.tasks : [] };
}

export type MenteeDetail = Awaited<ReturnType<typeof getMentee>>;

export async function createMentee(userId: string, input: MenteeInput) {
  const data = menteeSchema.parse(input);
  await access(userId, data.workspaceId, true);
  await assertProgram(data.workspaceId, data.programId);
  const mentee = await db.mentee.create({
    data: {
      workspaceId: data.workspaceId,
      ...menteeData(data),
      status: data.status ?? "ACTIVE",
      timeline: data.startDate ? { create: { date: ymdToDate(data.startDate), title: "Início da mentoria" } } : undefined,
    },
  });
  await audit({ userId, workspaceId: data.workspaceId, entity: "Mentee", entityId: mentee.id, action: "create" });
  return mentee;
}

async function loadForWrite(userId: string, menteeId: string) {
  const m = await db.mentee.findFirst({ where: { id: menteeId, deletedAt: null } });
  if (!m) throw new NotFoundError("Mentorado");
  await access(userId, m.workspaceId, true);
  return m;
}

const STATUS_LABEL = { ACTIVE: "Ativo", PAUSED: "Pausado", COMPLETED: "Concluído", CANCELLED: "Cancelado" } as const;

export async function updateMentee(userId: string, menteeId: string, input: Omit<MenteeInput, "workspaceId">) {
  const before = await loadForWrite(userId, menteeId);
  const data = menteeSchema.parse({ ...input, workspaceId: before.workspaceId });
  await assertProgram(before.workspaceId, data.programId);
  const statusChanged = data.status && data.status !== before.status;
  return db.$transaction(async (tx) => {
    const after = await tx.mentee.update({ where: { id: menteeId }, data: { ...menteeData(data), ...(data.status ? { status: data.status } : {}) } });
    if (statusChanged) {
      await tx.menteeTimelineEntry.create({ data: { menteeId, date: new Date(), title: `Status: ${STATUS_LABEL[data.status!]}` } });
    }
    return after;
  });
}

export async function deleteMentee(userId: string, menteeId: string) {
  const m = await loadForWrite(userId, menteeId);
  await db.mentee.update({ where: { id: menteeId }, data: { deletedAt: new Date() } });
  await audit({ userId, workspaceId: m.workspaceId, entity: "Mentee", entityId: menteeId, action: "delete" });
}

// ─── Encontros ─────────────────────────────────────────────────

export const sessionSchema = z.object({
  date: ymd,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido."),
  durationMinutes: z.number().int().min(5).max(600).default(60),
  summary: z.string().max(10000).nullable().optional(),
  nextSteps: z.string().max(5000).nullable().optional(),
  addToCalendar: z.boolean().default(false),
  location: z.string().trim().max(500).nullable().optional(),
});

/**
 * Agenda um encontro. Com "adicionar à agenda", cria o compromisso no ambiente
 * da Mentoria verificando conflitos com TODOS os ambientes; se houver conflito e
 * não for confirmado, nada é salvo e os conflitos voltam para a usuária decidir.
 */
export async function scheduleSession(
  userId: string,
  menteeId: string,
  input: z.input<typeof sessionSchema>,
  tz: string,
  opts: { allowConflict?: boolean } = {},
): Promise<{ saved: true; sessionId: string } | { saved: false; conflicts: Conflict[] }> {
  const mentee = await loadForWrite(userId, menteeId);
  const data = sessionSchema.parse(input);
  const start = zonedToUtc(data.date, data.time, tz);
  const end = new Date(start.getTime() + data.durationMinutes * 60_000);
  let eventId: string | null = null;
  if (data.addToCalendar) {
    const endLocal = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(end);
    const endDate = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(end);
    const res = await createEvent(
      userId,
      {
        workspaceId: mentee.workspaceId,
        title: `Mentoria · ${mentee.name}`,
        allDay: false,
        startDate: data.date,
        startTime: data.time,
        endDate,
        endTime: endLocal,
        location: data.location || null,
        attendees: mentee.email ? [mentee.email] : [],
        reminderMinutes: 30,
      },
      tz,
      opts,
    );
    if (!res.saved) return { saved: false, conflicts: res.conflicts };
    eventId = res.event.id;
  }
  const session = await db.mentoringSession.create({
    data: { menteeId, date: start, durationMinutes: data.durationMinutes, summary: data.summary || null, nextSteps: data.nextSteps || null, eventId },
  });
  return { saved: true, sessionId: session.id };
}

async function loadSession(userId: string, sessionId: string) {
  const s = await db.mentoringSession.findUnique({ where: { id: sessionId }, include: { mentee: true } });
  if (!s || s.mentee.deletedAt) throw new NotFoundError("Encontro");
  await access(userId, s.mentee.workspaceId, true);
  return s;
}

export async function updateSession(userId: string, sessionId: string, input: { status?: string; summary?: string | null; nextSteps?: string | null }) {
  const s = await loadSession(userId, sessionId);
  const data = z
    .object({ status: z.enum(["SCHEDULED", "DONE", "CANCELLED", "NO_SHOW"]).optional(), summary: z.string().max(10000).nullable().optional(), nextSteps: z.string().max(5000).nullable().optional() })
    .parse(input);
  return db.$transaction(async (tx) => {
    const after = await tx.mentoringSession.update({ where: { id: sessionId }, data });
    if (data.status && data.status !== s.status) {
      if (data.status === "DONE") {
        await tx.menteeTimelineEntry.create({ data: { menteeId: s.menteeId, date: s.date, title: "Encontro realizado", content: data.summary ?? s.summary } });
      }
      // Mantém o compromisso da agenda coerente (status explícito, nunca automático)
      if (s.eventId) {
        const map = { SCHEDULED: "NOT_STARTED", DONE: "DONE", CANCELLED: "CANCELLED", NO_SHOW: "CANCELLED" } as const;
        await tx.calendarEvent.updateMany({ where: { id: s.eventId, deletedAt: null }, data: { status: map[data.status] } });
      }
    }
    return after;
  });
}

export async function deleteSession(userId: string, sessionId: string) {
  const s = await loadSession(userId, sessionId);
  await db.$transaction(async (tx) => {
    if (s.eventId) await tx.calendarEvent.updateMany({ where: { id: s.eventId }, data: { deletedAt: new Date() } });
    await tx.mentoringSession.delete({ where: { id: sessionId } });
  });
}

// ─── Metas individuais, materiais, linha do tempo, tarefas ─────

export async function addMenteeGoal(userId: string, menteeId: string, input: { title: string; dueDate?: string | null }) {
  await loadForWrite(userId, menteeId);
  const data = z.object({ title: z.string().trim().min(1, "Descreva a meta.").max(300), dueDate: ymd.nullable().optional() }).parse(input);
  return db.menteeGoal.create({ data: { menteeId, title: data.title, dueDate: data.dueDate ? ymdToDate(data.dueDate) : null } });
}

export async function updateMenteeGoal(userId: string, goalId: string, input: { progress?: number; done?: boolean; title?: string }) {
  const g = await db.menteeGoal.findUnique({ where: { id: goalId } });
  if (!g) throw new NotFoundError("Meta");
  await loadForWrite(userId, g.menteeId);
  const data = z.object({ progress: z.number().int().min(0).max(100).optional(), done: z.boolean().optional(), title: z.string().trim().min(1).max(300).optional() }).parse(input);
  const done = data.done ?? (data.progress !== undefined ? data.progress >= 100 : g.done);
  return db.$transaction(async (tx) => {
    const after = await tx.menteeGoal.update({ where: { id: goalId }, data: { ...data, done, progress: done ? 100 : data.progress ?? (data.done === false ? Math.min(g.progress, 99) : g.progress) } });
    if (done && !g.done) await tx.menteeTimelineEntry.create({ data: { menteeId: g.menteeId, date: new Date(), title: "Meta atingida", content: g.title } });
    return after;
  });
}

export async function deleteMenteeGoal(userId: string, goalId: string) {
  const g = await db.menteeGoal.findUnique({ where: { id: goalId } });
  if (!g) throw new NotFoundError("Meta");
  await loadForWrite(userId, g.menteeId);
  await db.menteeGoal.delete({ where: { id: goalId } });
}

export async function addMaterial(userId: string, menteeId: string, input: { title: string; url?: string | null }) {
  await loadForWrite(userId, menteeId);
  const data = z.object({ title: z.string().trim().min(1, "Informe o título.").max(200), url: z.string().trim().url("Link inválido.").max(2000).or(z.literal("")).nullable().optional() }).parse(input);
  return db.menteeMaterial.create({ data: { menteeId, title: data.title, url: data.url || null } });
}

export async function deleteMaterial(userId: string, materialId: string) {
  const m = await db.menteeMaterial.findUnique({ where: { id: materialId } });
  if (!m) throw new NotFoundError("Material");
  await loadForWrite(userId, m.menteeId);
  await db.menteeMaterial.delete({ where: { id: materialId } });
}

export async function addTimelineEntry(userId: string, menteeId: string, input: { date: string; title: string; content?: string | null }) {
  await loadForWrite(userId, menteeId);
  const data = z.object({ date: ymd, title: z.string().trim().min(1, "Informe o título.").max(200), content: z.string().max(5000).nullable().optional() }).parse(input);
  return db.menteeTimelineEntry.create({ data: { menteeId, date: new Date(`${data.date}T12:00:00Z`), title: data.title, content: data.content || null } });
}

export async function deleteTimelineEntry(userId: string, entryId: string) {
  const e = await db.menteeTimelineEntry.findUnique({ where: { id: entryId } });
  if (!e) throw new NotFoundError("Registro");
  await loadForWrite(userId, e.menteeId);
  await db.menteeTimelineEntry.delete({ where: { id: entryId } });
}

/** Cria uma tarefa vinculada ao mentorado (no ambiente da Mentoria). */
export async function addMenteeTask(userId: string, menteeId: string, input: { title: string; dueDate?: string | null }) {
  const m = await loadForWrite(userId, menteeId);
  const task = await createTask(userId, { workspaceId: m.workspaceId, title: input.title, dueDate: input.dueDate || null });
  await db.task.update({ where: { id: task.id }, data: { menteeId } });
  return task;
}

export async function linkTaskToMentee(userId: string, taskId: string, menteeId: string | null) {
  const task = await db.task.findFirst({ where: { id: taskId, deletedAt: null } });
  if (!task) throw new NotFoundError("Tarefa");
  await requireWorkspaceAccess(userId, task.workspaceId, { module: "tasks", write: true });
  if (menteeId) {
    const m = await loadForWrite(userId, menteeId);
    if (m.workspaceId !== task.workspaceId) throw new AppError("A tarefa e o mentorado precisam estar no mesmo ambiente.");
  }
  return db.task.update({ where: { id: taskId }, data: { menteeId } });
}

/** Próximos encontros (para dashboard e resumos). */
export async function upcomingSessions(userId: string, workspaceIds: string[], from: Date, to: Date) {
  const allowed: string[] = [];
  for (const id of workspaceIds) {
    try {
      await access(userId, id);
      allowed.push(id);
    } catch {
      /* sem permissão: ignora */
    }
  }
  return db.mentoringSession.findMany({
    where: { status: "SCHEDULED", date: { gte: from, lte: to }, mentee: { workspaceId: { in: allowed }, deletedAt: null } },
    include: { mentee: { select: { id: true, name: true } } },
    orderBy: { date: "asc" },
    take: 20,
  });
}
