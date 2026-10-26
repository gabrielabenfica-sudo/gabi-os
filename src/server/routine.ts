import { z } from "zod";
import { db } from "@/server/db";
import { AppError, NotFoundError } from "@/server/errors";
import { requireWorkspaceAccess } from "@/server/workspaces";
import { listOccurrences } from "@/server/calendar";
import { listTasks } from "@/server/tasks";
import { listContent } from "@/server/content";
import { addDaysYmd, weekdayOfYmd, ymdToDate, zonedToUtc } from "@/lib/dates";
import { routineKey, sortRoutine, toMinutes } from "@/lib/routine";

/**
 * Rotina do dia: blocos de horário pessoais de cada usuária. O ambiente é só
 * uma etiqueta (cor), por isso não depende das permissões de módulo — mas a
 * usuária precisa ser membro do ambiente escolhido.
 */

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido.");

const blockFields = {
  title: z.string().trim().min(1, "Informe a atividade.").max(200),
  startTime: hhmm.nullable().optional(),
  endTime: hhmm.nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  workspaceId: z.string().nullable().optional(),
};

function checkTimes<T extends { startTime?: string | null; endTime?: string | null }>(v: T, ctx: z.RefinementCtx) {
  if (v.endTime && !v.startTime) ctx.addIssue({ code: "custom", message: "Informe o horário de início.", path: ["startTime"] });
  if (v.startTime && v.endTime && toMinutes(v.endTime) <= toMinutes(v.startTime)) {
    ctx.addIssue({ code: "custom", message: "O fim precisa ser depois do início.", path: ["endTime"] });
  }
}

export const routineItemSchema = z.object({ date: ymd, ...blockFields }).superRefine(checkTimes);
export type RoutineItemInput = z.input<typeof routineItemSchema>;

export const templateItemSchema = z
  .object({ ...blockFields, weekdays: z.array(z.number().int().min(0).max(6)).min(1, "Escolha pelo menos um dia da semana.").max(7) })
  .superRefine(checkTimes);
export type TemplateItemInput = z.input<typeof templateItemSchema>;

const wsSelect = { workspace: { select: { id: true, name: true, color: true } } } as const;

async function assertWorkspace(userId: string, workspaceId?: string | null) {
  if (workspaceId) await requireWorkspaceAccess(userId, workspaceId);
}

const clean = <T extends { title: string; startTime?: string | null; endTime?: string | null; notes?: string | null; workspaceId?: string | null }>(d: T) => ({
  title: d.title,
  startTime: d.startTime || null,
  endTime: d.endTime || null,
  notes: d.notes || null,
  workspaceId: d.workspaceId || null,
});

// ═══════════════════════════════════════════════════════════════
// Blocos do dia
// ═══════════════════════════════════════════════════════════════

export async function listRoutineDay(userId: string, date: string) {
  const items = await db.routineItem.findMany({
    where: { userId, date: ymdToDate(ymd.parse(date)) },
    include: wsSelect,
    orderBy: { createdAt: "asc" },
  });
  return sortRoutine(items);
}
export type RoutineItemView = Awaited<ReturnType<typeof listRoutineDay>>[number];

export async function createRoutineItem(userId: string, input: RoutineItemInput) {
  const d = routineItemSchema.parse(input);
  await assertWorkspace(userId, d.workspaceId);
  return db.routineItem.create({ data: { userId, date: ymdToDate(d.date), ...clean(d) }, include: wsSelect });
}

async function ownItem(userId: string, id: string) {
  const item = await db.routineItem.findFirst({ where: { id, userId } });
  if (!item) throw new NotFoundError("Item da rotina");
  return item;
}

export async function updateRoutineItem(userId: string, id: string, input: RoutineItemInput) {
  await ownItem(userId, id);
  const d = routineItemSchema.parse(input);
  await assertWorkspace(userId, d.workspaceId);
  return db.routineItem.update({ where: { id }, data: { date: ymdToDate(d.date), ...clean(d) }, include: wsSelect });
}

export async function setRoutineItemDone(userId: string, id: string, done: boolean) {
  await ownItem(userId, id);
  return db.routineItem.update({ where: { id }, data: { done } });
}

export async function deleteRoutineItem(userId: string, id: string) {
  await ownItem(userId, id);
  await db.routineItem.delete({ where: { id } });
}

/** Apaga todos os blocos de um dia (recomeçar a rotina). */
export async function clearRoutineDay(userId: string, date: string) {
  const r = await db.routineItem.deleteMany({ where: { userId, date: ymdToDate(ymd.parse(date)) } });
  return r.count;
}

async function existingKeys(userId: string, date: string) {
  const items = await db.routineItem.findMany({ where: { userId, date: ymdToDate(date) }, select: { title: true, startTime: true } });
  return new Set(items.map(routineKey));
}

/** Copia os blocos de outro dia (sem marcar como feitos e sem duplicar o que já existe). */
export async function copyRoutineDay(userId: string, fromDate: string, toDate: string) {
  const from = ymd.parse(fromDate), to = ymd.parse(toDate);
  if (from === to) throw new AppError("Escolha um dia diferente para copiar.");
  const source = await db.routineItem.findMany({ where: { userId, date: ymdToDate(from) }, orderBy: { createdAt: "asc" } });
  if (!source.length) throw new AppError("Não há rotina nesse dia para copiar.");
  const keys = await existingKeys(userId, to);
  const fresh = source.filter((s) => !keys.has(routineKey(s)));
  if (fresh.length) {
    await db.routineItem.createMany({
      data: fresh.map((s) => ({ userId, date: ymdToDate(to), title: s.title, startTime: s.startTime, endTime: s.endTime, notes: s.notes, workspaceId: s.workspaceId })),
    });
  }
  return fresh.length;
}

// ═══════════════════════════════════════════════════════════════
// Rotina padrão (modelo por dia da semana)
// ═══════════════════════════════════════════════════════════════

export async function listRoutineTemplate(userId: string) {
  const items = await db.routineTemplateItem.findMany({ where: { userId }, include: wsSelect, orderBy: { createdAt: "asc" } });
  return sortRoutine(items);
}
export type TemplateItemView = Awaited<ReturnType<typeof listRoutineTemplate>>[number];

export async function createTemplateItem(userId: string, input: TemplateItemInput) {
  const d = templateItemSchema.parse(input);
  await assertWorkspace(userId, d.workspaceId);
  return db.routineTemplateItem.create({ data: { userId, weekdays: [...new Set(d.weekdays)].sort(), ...clean(d) } });
}

async function ownTemplate(userId: string, id: string) {
  const item = await db.routineTemplateItem.findFirst({ where: { id, userId } });
  if (!item) throw new NotFoundError("Item da rotina padrão");
  return item;
}

export async function updateTemplateItem(userId: string, id: string, input: TemplateItemInput) {
  await ownTemplate(userId, id);
  const d = templateItemSchema.parse(input);
  await assertWorkspace(userId, d.workspaceId);
  return db.routineTemplateItem.update({ where: { id }, data: { weekdays: [...new Set(d.weekdays)].sort(), ...clean(d) } });
}

export async function deleteTemplateItem(userId: string, id: string) {
  await ownTemplate(userId, id);
  await db.routineTemplateItem.delete({ where: { id } });
}

/** Coloca no dia os blocos da rotina padrão daquele dia da semana. Retorna quantos foram criados. */
export async function applyRoutineTemplate(userId: string, date: string) {
  const day = ymd.parse(date);
  const weekday = weekdayOfYmd(day);
  const template = (await db.routineTemplateItem.findMany({ where: { userId, weekdays: { has: weekday } }, orderBy: { createdAt: "asc" } }));
  if (!template.length) throw new AppError("A rotina padrão não tem nada para este dia da semana.");
  const keys = await existingKeys(userId, day);
  const fresh = template.filter((t) => !keys.has(routineKey(t)));
  if (fresh.length) {
    await db.routineItem.createMany({
      data: fresh.map((t) => ({ userId, date: ymdToDate(day), title: t.title, startTime: t.startTime, endTime: t.endTime, notes: t.notes, workspaceId: t.workspaceId })),
    });
  }
  return fresh.length;
}

/** Transforma os blocos de um dia em rotina padrão para os dias da semana escolhidos. */
export async function saveDayAsTemplate(userId: string, date: string, weekdays: number[]) {
  const days = z.array(z.number().int().min(0).max(6)).min(1, "Escolha pelo menos um dia da semana.").parse(weekdays);
  const items = await db.routineItem.findMany({ where: { userId, date: ymdToDate(ymd.parse(date)) }, orderBy: { createdAt: "asc" } });
  if (!items.length) throw new AppError("Não há blocos neste dia para salvar.");
  const existing = await db.routineTemplateItem.findMany({ where: { userId } });
  const sorted = [...new Set(days)].sort();
  let created = 0;
  await db.$transaction(async (tx) => {
    for (const i of items) {
      const same = existing.find((t) => routineKey(t) === routineKey(i) && t.endTime === i.endTime);
      if (same) {
        // Mesmo bloco já no modelo: só acrescenta os dias novos
        await tx.routineTemplateItem.update({ where: { id: same.id }, data: { weekdays: [...new Set([...same.weekdays, ...sorted])].sort() } });
      } else {
        await tx.routineTemplateItem.create({ data: { userId, weekdays: sorted, title: i.title, startTime: i.startTime, endTime: i.endTime, notes: i.notes, workspaceId: i.workspaceId } });
        created++;
      }
    }
  });
  return created;
}

// ═══════════════════════════════════════════════════════════════
// O que mais acontece no dia (agenda, tarefas, gravações)
// ═══════════════════════════════════════════════════════════════

const hmIn = (d: Date, tz: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
const ymdIn = (d: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export type DayContextEntry = {
  kind: "event" | "task" | "recording";
  id: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  workspace: { id: string; name: string; color: string };
  href: string;
};

/** Compromissos, tarefas com prazo e gravações do dia — para montar a rotina em volta deles. */
export async function routineDayContext(userId: string, date: string, tz: string): Promise<DayContextEntry[]> {
  const day = ymd.parse(date);
  const from = zonedToUtc(day, "00:00", tz);
  const to = zonedToUtc(addDaysYmd(day, 1), "00:00", tz);
  const [events, tasks, content] = await Promise.all([
    listOccurrences(userId, from, to),
    listTasks(userId, { dueFrom: day, dueTo: day, includeDone: false, topLevelOnly: true }, tz),
    listContent(userId, { from: day, to: day }, tz),
  ]);
  const out: DayContextEntry[] = [];
  for (const e of events) {
    if (e.status === "CANCELLED") continue;
    // Para eventos que começam no dia anterior ou terminam no seguinte, recorta ao dia
    const startsToday = !e.allDay && ymdIn(e.start, tz) === day;
    const endsToday = !e.allDay && ymdIn(e.end, tz) === day;
    out.push({
      kind: "event",
      id: e.key,
      title: e.title,
      startTime: e.allDay ? null : startsToday ? hmIn(e.start, tz) : "00:00",
      endTime: e.allDay ? null : endsToday ? hmIn(e.end, tz) : "23:59",
      workspace: e.workspace,
      href: `/agenda?v=timeline&e=${e.eventId}`,
    });
  }
  for (const t of tasks) {
    out.push({ kind: "task", id: t.id, title: t.title, startTime: null, endTime: null, workspace: t.workspace, href: `/tarefas?t=${t.id}` });
  }
  for (const c of content) {
    if (!c.recordingDate || ymdIn(c.recordingDate, tz) !== day) continue;
    const hm = hmIn(c.recordingDate, tz);
    out.push({ kind: "recording", id: c.id, title: `Gravar: ${c.title}`, startTime: hm === "12:00" ? null : hm, endTime: null, workspace: c.workspace, href: `/conteudo?c=${c.id}` });
  }
  return sortRoutine(out);
}
