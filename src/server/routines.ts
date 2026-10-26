import { z } from "zod";
import { db } from "@/server/db";
import { AppError, NotFoundError } from "@/server/errors";
import { accessibleWorkspaceIds, requireWorkspaceAccess } from "@/server/workspaces";
import { addDaysYmd, dateToYmd, todayYmd, ymdInTz, ymdToDate } from "@/lib/dates";
import { appliesOn, checkKey, computeScheduleStats, itemActiveOn, periodOf, TIME_RE, type ScheduleLike } from "@/lib/routines";

const MAX_ITEMS = 60;
const RECENT_RUNS = 10;

const itemSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().trim().min(1, "Todo item precisa de um nome.").max(120),
  time: z.string().regex(TIME_RE, "Horário inválido (use HH:MM).").nullable().optional(),
});

export const routineSchema = z
  .object({
    workspaceId: z.string().min(1),
    kind: z.enum(["SCHEDULE", "CHECKLIST"]),
    name: z.string().trim().min(1, "Informe o nome da rotina.").max(80),
    description: z.string().trim().max(500).nullable().optional(),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
    items: z.array(itemSchema).min(1, "Adicione ao menos um item.").max(MAX_ITEMS, `No máximo ${MAX_ITEMS} itens.`),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "SCHEDULE") {
      if (!v.daysOfWeek?.length) ctx.addIssue({ code: "custom", message: "Escolha ao menos um dia da semana.", path: ["daysOfWeek"] });
      v.items.forEach((item, i) => {
        if (!item.time) ctx.addIssue({ code: "custom", message: `Informe o horário de “${item.title}”.`, path: ["items", i, "time"] });
      });
    }
  });
export type RoutineInput = z.input<typeof routineSchema>;

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

// ─── Leitura ───────────────────────────────────────────────────

const wsSelect = { select: { id: true, name: true, color: true } } as const;

/** Rotinas do dia (SCHEDULE) com os itens vigentes, para gerenciar. */
export async function listSchedules(userId: string, opts: { workspaceId?: string | "all"; includeInactive?: boolean } = {}) {
  const ids = await accessibleWorkspaceIds(userId, "routines", opts.workspaceId ?? "all");
  const routines = await db.routine.findMany({
    where: { workspaceId: { in: ids }, kind: "SCHEDULE", ...(opts.includeInactive ? {} : { active: true }) },
    include: { workspace: wsSelect, items: { where: { archivedAt: null }, orderBy: [{ time: "asc" }, { position: "asc" }] } },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  return routines.map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    description: r.description,
    daysOfWeek: r.daysOfWeek,
    color: r.color,
    active: r.active,
    workspace: r.workspace,
    items: r.items.map((i) => ({ id: i.id, title: i.title, time: i.time })),
  }));
}

export type ScheduleView = Awaited<ReturnType<typeof listSchedules>>[number];

/**
 * O roteiro de um dia: itens das rotinas ativas que valem na data, em ordem de horário,
 * com o que foi cumprido. Os percentuais (hoje, 7 e 30 dias) são sempre contados até hoje.
 */
export async function getRoutineDay(userId: string, opts: { workspaceId?: string | "all"; date?: string }, tz: string) {
  const today = todayYmd(tz);
  const date = opts.date ? dateSchema.parse(opts.date) : today;
  const from30 = addDaysYmd(today, -29);
  const from7 = addDaysYmd(today, -6);
  const loadFrom = date < from30 ? date : from30;
  const loadTo = date > today ? date : today;

  const ids = await accessibleWorkspaceIds(userId, "routines", opts.workspaceId ?? "all");
  const routines = await db.routine.findMany({
    where: { workspaceId: { in: ids }, kind: "SCHEDULE", active: true },
    include: {
      workspace: wsSelect,
      items: {
        orderBy: [{ time: "asc" }, { position: "asc" }],
        include: { checks: { where: { date: { gte: ymdToDate(loadFrom), lte: ymdToDate(loadTo) } }, select: { date: true } } },
      },
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });

  const checks = new Set<string>();
  const shaped: (ScheduleLike & { source: (typeof routines)[number] })[] = routines.map((r) => ({
    source: r,
    daysOfWeek: r.daysOfWeek,
    items: r.items.map((i) => {
      for (const c of i.checks) checks.add(checkKey(i.id, dateToYmd(c.date)));
      return { id: i.id, createdYmd: ymdInTz(i.createdAt, tz), archivedYmd: i.archivedAt ? ymdInTz(i.archivedAt, tz) : null };
    }),
  }));

  const items = shaped
    .filter((r) => appliesOn(r, date))
    .flatMap((r) =>
      r.source.items
        .filter((_, idx) => itemActiveOn(r.items[idx]!, date))
        .map((i) => ({
          id: i.id,
          title: i.title,
          time: i.time ?? "00:00",
          period: periodOf(i.time ?? "00:00"),
          routine: { id: r.source.id, name: r.source.name, color: r.source.color ?? r.source.workspace.color },
          workspace: r.source.workspace,
          checked: checks.has(checkKey(i.id, date)),
        })),
    )
    .sort((a, b) => a.time.localeCompare(b.time));

  const todayItems = shaped.filter((r) => appliesOn(r, today)).flatMap((r) => r.items.filter((i) => itemActiveOn(i, today)));
  return {
    date,
    today,
    items,
    todayProgress: { total: todayItems.length, done: todayItems.filter((i) => checks.has(checkKey(i.id, today))).length },
    stats7: computeScheduleStats(shaped, checks, from7, today, today),
    stats30: computeScheduleStats(shaped, checks, from30, today, today),
  };
}

export type RoutineDayView = Awaited<ReturnType<typeof getRoutineDay>>;

/** Processos (CHECKLIST) com passos, execução em andamento e histórico recente. */
export async function listProcesses(userId: string, opts: { workspaceId?: string | "all"; includeInactive?: boolean } = {}) {
  const ids = await accessibleWorkspaceIds(userId, "routines", opts.workspaceId ?? "all");
  const routines = await db.routine.findMany({
    where: { workspaceId: { in: ids }, kind: "CHECKLIST", ...(opts.includeInactive ? {} : { active: true }) },
    include: {
      workspace: wsSelect,
      items: { where: { archivedAt: null }, orderBy: { position: "asc" } },
      runs: { orderBy: { startedAt: "desc" }, take: RECENT_RUNS + 1, include: { steps: { orderBy: { position: "asc" } } } },
      _count: { select: { runs: { where: { completedAt: { not: null } } } } },
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  return routines.map((r) => {
    const open = r.runs.find((run) => !run.completedAt) ?? null;
    const done = r.runs.filter((run) => run.completedAt).slice(0, RECENT_RUNS);
    const shapeRun = (run: (typeof r.runs)[number]) => ({
      id: run.id,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
      note: run.note,
      steps: run.steps.map((s) => ({ id: s.id, title: s.title, done: s.doneAt !== null })),
    });
    return {
      id: r.id,
      kind: r.kind,
      name: r.name,
      description: r.description,
      daysOfWeek: r.daysOfWeek,
      color: r.color,
      active: r.active,
      workspace: r.workspace,
      items: r.items.map((i) => ({ id: i.id, title: i.title, time: i.time })),
      completedRuns: r._count.runs,
      openRun: open ? shapeRun(open) : null,
      recentRuns: done.map(shapeRun),
    };
  });
}

export type ProcessView = Awaited<ReturnType<typeof listProcesses>>[number];

// ─── Escrita: rotinas ──────────────────────────────────────────

function normalize(data: z.output<typeof routineSchema>) {
  return {
    name: data.name,
    description: data.description || null,
    daysOfWeek: data.kind === "SCHEDULE" ? [...new Set(data.daysOfWeek ?? [])].sort() : [],
    color: data.color ?? null,
  };
}

const itemTime = (kind: string, time: string | null | undefined) => (kind === "SCHEDULE" ? time ?? null : null);

export async function createRoutine(userId: string, input: RoutineInput) {
  const data = routineSchema.parse(input);
  await requireWorkspaceAccess(userId, data.workspaceId, { module: "routines", write: true });
  const last = await db.routine.findFirst({ where: { workspaceId: data.workspaceId, kind: data.kind }, orderBy: { position: "desc" } });
  return db.routine.create({
    data: {
      workspaceId: data.workspaceId,
      kind: data.kind,
      ...normalize(data),
      position: (last?.position ?? -1) + 1,
      items: { create: data.items.map((i, position) => ({ title: i.title, time: itemTime(data.kind, i.time), position })) },
    },
  });
}

async function loadForWrite(userId: string, routineId: string) {
  const routine = await db.routine.findUnique({ where: { id: routineId } });
  if (!routine) throw new NotFoundError("Rotina");
  await requireWorkspaceAccess(userId, routine.workspaceId, { module: "routines", write: true });
  return routine;
}

/**
 * Atualiza a rotina e sincroniza os itens: os enviados com id são mantidos (com o histórico),
 * os novos são criados e os que saíram da lista são arquivados — o histórico de dias anteriores fica.
 */
export async function updateRoutine(userId: string, routineId: string, input: RoutineInput) {
  const routine = await loadForWrite(userId, routineId);
  const data = routineSchema.parse(input);
  if (data.kind !== routine.kind) throw new AppError("Não é possível mudar o tipo da rotina.");
  if (data.workspaceId !== routine.workspaceId) {
    await requireWorkspaceAccess(userId, data.workspaceId, { module: "routines", write: true });
  }
  const current = await db.routineItem.findMany({ where: { routineId, archivedAt: null } });
  const currentIds = new Set(current.map((i) => i.id));
  const keptIds = new Set(data.items.flatMap((i) => (i.id ? [i.id] : [])));
  for (const id of keptIds) if (!currentIds.has(id)) throw new AppError("Item inválido.");

  const now = new Date();
  await db.$transaction([
    db.routine.update({ where: { id: routineId }, data: { workspaceId: data.workspaceId, ...normalize(data) } }),
    db.routineItem.updateMany({ where: { routineId, archivedAt: null, id: { notIn: [...keptIds] } }, data: { archivedAt: now } }),
    ...data.items.map((i, position) =>
      i.id
        ? db.routineItem.update({ where: { id: i.id }, data: { title: i.title, time: itemTime(data.kind, i.time), position } })
        : db.routineItem.create({ data: { routineId, title: i.title, time: itemTime(data.kind, i.time), position } }),
    ),
  ]);
  return db.routine.findUniqueOrThrow({ where: { id: routineId } });
}

export async function setRoutineActive(userId: string, routineId: string, active: boolean) {
  await loadForWrite(userId, routineId);
  return db.routine.update({ where: { id: routineId }, data: { active } });
}

export async function deleteRoutine(userId: string, routineId: string) {
  await loadForWrite(userId, routineId);
  await db.routine.delete({ where: { id: routineId } });
}

// ─── Escrita: rotina do dia ────────────────────────────────────

/** Marca ou desmarca um item da rotina do dia. Não permite datas futuras nem dias em que o item não vale. */
export async function setRoutineCheck(userId: string, itemId: string, date: string, done: boolean, tz: string) {
  const item = await db.routineItem.findUnique({ where: { id: itemId }, include: { routine: true } });
  if (!item) throw new NotFoundError("Item");
  await requireWorkspaceAccess(userId, item.routine.workspaceId, { module: "routines", write: true });
  if (item.routine.kind !== "SCHEDULE") throw new AppError("Este item não pertence a uma rotina do dia.");
  const day = dateSchema.parse(date);
  if (day > todayYmd(tz)) throw new AppError("Não é possível marcar um dia futuro.");
  if (!done) {
    await db.routineCheck.deleteMany({ where: { itemId, date: ymdToDate(day) } });
    return null;
  }
  const shaped = { id: item.id, createdYmd: ymdInTz(item.createdAt, tz), archivedYmd: item.archivedAt ? ymdInTz(item.archivedAt, tz) : null };
  if (!appliesOn(item.routine, day) || !itemActiveOn(shaped, day)) throw new AppError("Este item não faz parte da rotina nesse dia.");
  return db.routineCheck.upsert({
    where: { itemId_date: { itemId, date: ymdToDate(day) } },
    create: { itemId, date: ymdToDate(day) },
    update: {},
  });
}

// ─── Escrita: execuções de processos ───────────────────────────

/** Inicia uma execução do processo com os passos atuais. Só uma execução em andamento por vez. */
export async function startRun(userId: string, routineId: string) {
  const routine = await loadForWrite(userId, routineId);
  if (routine.kind !== "CHECKLIST") throw new AppError("Só processos podem ser iniciados.");
  if (!routine.active) throw new AppError("Reative o processo antes de iniciar.");
  if (await db.routineRun.findFirst({ where: { routineId, completedAt: null } })) {
    throw new AppError("Já existe uma execução em andamento deste processo.");
  }
  const items = await db.routineItem.findMany({ where: { routineId, archivedAt: null }, orderBy: { position: "asc" } });
  if (!items.length) throw new AppError("O processo não tem passos.");
  return db.routineRun.create({
    data: { routineId, steps: { create: items.map((i, position) => ({ itemId: i.id, title: i.title, position })) } },
    include: { steps: true },
  });
}

async function loadRunForWrite(userId: string, runId: string) {
  const run = await db.routineRun.findUnique({ where: { id: runId }, include: { routine: true } });
  if (!run) throw new NotFoundError("Execução");
  await requireWorkspaceAccess(userId, run.routine.workspaceId, { module: "routines", write: true });
  return run;
}

export async function setRunStep(userId: string, stepId: string, done: boolean) {
  const step = await db.routineRunStep.findUnique({ where: { id: stepId } });
  if (!step) throw new NotFoundError("Passo");
  const run = await loadRunForWrite(userId, step.runId);
  if (run.completedAt) throw new AppError("Esta execução já foi concluída.");
  return db.routineRunStep.update({ where: { id: stepId }, data: { doneAt: done ? step.doneAt ?? new Date() : null } });
}

/** Conclui a execução. Só a usuária conclui — marcar todos os passos não conclui sozinho. */
export async function completeRun(userId: string, runId: string, note?: string | null) {
  const run = await loadRunForWrite(userId, runId);
  if (run.completedAt) throw new AppError("Esta execução já foi concluída.");
  const text = z.string().trim().max(1000).nullable().optional().parse(note);
  return db.routineRun.update({ where: { id: runId }, data: { completedAt: new Date(), note: text || null } });
}

/** Descarta uma execução (em andamento ou do histórico). */
export async function deleteRun(userId: string, runId: string) {
  await loadRunForWrite(userId, runId);
  await db.routineRun.delete({ where: { id: runId } });
}
