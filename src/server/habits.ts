import type { Habit, HabitEntry } from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { AppError, NotFoundError } from "@/server/errors";
import { accessibleWorkspaceIds, requireWorkspaceAccess } from "@/server/workspaces";
import { addDaysYmd, dateToYmd, eachDayYmd, startOfWeekYmd, todayYmd, weekdayOfYmd, ymdInTz, ymdToDate } from "@/lib/dates";

export const habitSchema = z
  .object({
    workspaceId: z.string().min(1),
    name: z.string().trim().min(1, "Informe o nome do hábito.").max(80),
    category: z.string().trim().max(40).nullable().optional(),
    frequency: z.enum(["DAILY", "WEEKLY", "CUSTOM"]),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    timesPerWeek: z.number().int().min(1).max(7).nullable().optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.frequency === "CUSTOM" && !v.daysOfWeek?.length) {
      ctx.addIssue({ code: "custom", message: "Escolha ao menos um dia da semana.", path: ["daysOfWeek"] });
    }
    if (v.frequency === "WEEKLY" && !v.timesPerWeek) {
      ctx.addIssue({ code: "custom", message: "Informe quantas vezes por semana.", path: ["timesPerWeek"] });
    }
  });
export type HabitInput = z.input<typeof habitSchema>;

/** O hábito é esperado neste dia? (WEEKLY não tem dia fixo) */
export function isExpectedOn(habit: Pick<Habit, "frequency" | "daysOfWeek">, ymd: string): boolean {
  if (habit.frequency === "DAILY") return true;
  if (habit.frequency === "CUSTOM") return habit.daysOfWeek.includes(weekdayOfYmd(ymd));
  return false;
}

export type HabitStats = {
  expected: number;
  done: number;
  /** 0–100, ou null quando ainda não havia nada esperado no período */
  rate: number | null;
  streak: number;
};

/**
 * Calcula o percentual de realização considerando a frequência.
 * Dias futuros e anteriores à criação do hábito não contam.
 * Um dia não marcado NÃO é tratado como tarefa atrasada — só reduz o percentual.
 */
export function computeHabitStats(
  habit: Pick<Habit, "frequency" | "daysOfWeek" | "timesPerWeek" | "createdAt">,
  doneDays: Set<string>,
  from: string,
  to: string,
  today: string,
  tz: string,
): HabitStats {
  const created = ymdInTz(habit.createdAt, tz);
  const start = from > created ? from : created;
  const end = to < today ? to : today;
  let expected = 0;
  let done = 0;
  if (start <= end) {
    if (habit.frequency === "WEEKLY") {
      const target = habit.timesPerWeek ?? 1;
      for (let week = startOfWeekYmd(start); week <= end; week = addDaysYmd(week, 7)) {
        const sunday = addDaysYmd(week, 6);
        const days = eachDayYmd(week, sunday).filter((d) => d >= start && d <= end);
        const weekDone = Math.min(target, days.filter((d) => doneDays.has(d)).length);
        if (sunday > end) {
          // Semana em andamento: nunca penaliza antes de a semana acabar
          expected += weekDone;
        } else {
          // Semana parcial (hábito criado no meio da semana) cobra no máximo os dias disponíveis
          expected += Math.min(target, days.length);
        }
        done += weekDone;
      }
    } else {
      for (const d of eachDayYmd(start, end)) {
        if (!isExpectedOn(habit, d)) continue;
        // Hoje só conta como esperado se já foi feito (o dia ainda não acabou)
        if (d === today && !doneDays.has(d)) continue;
        expected += 1;
        if (doneDays.has(d)) done += 1;
      }
    }
  }

  // Sequência atual (dias esperados consecutivos cumpridos; semanas cumpridas para WEEKLY)
  let streak = 0;
  if (habit.frequency === "WEEKLY") {
    const target = habit.timesPerWeek ?? 1;
    let week = startOfWeekYmd(today);
    const countWeek = (w: string) => eachDayYmd(w, addDaysYmd(w, 6)).filter((d) => doneDays.has(d)).length;
    if (countWeek(week) >= target) streak += 1;
    week = addDaysYmd(week, -7);
    while (week >= startOfWeekYmd(created) && countWeek(week) >= target) {
      streak += 1;
      week = addDaysYmd(week, -7);
    }
  } else {
    let d = today;
    if (!doneDays.has(d)) d = addDaysYmd(d, -1);
    for (let i = 0; i < 3660 && d >= created; i++, d = addDaysYmd(d, -1)) {
      if (!isExpectedOn(habit, d)) continue;
      if (!doneDays.has(d)) break;
      streak += 1;
    }
  }

  return { expected, done, rate: expected ? Math.round((done / expected) * 100) : null, streak };
}

export async function listHabits(
  userId: string,
  opts: { workspaceId?: string | "all"; from: string; to: string; includeInactive?: boolean },
  tz: string,
) {
  const ids = await accessibleWorkspaceIds(userId, "habits", opts.workspaceId ?? "all");
  const habits = await db.habit.findMany({
    where: { workspaceId: { in: ids }, ...(opts.includeInactive ? {} : { active: true }) },
    include: {
      workspace: { select: { id: true, name: true, color: true } },
      // Busca um pouco antes do período para calcular a sequência
      entries: { where: { date: { gte: ymdToDate(addDaysYmd(opts.from, -400)), lte: ymdToDate(opts.to) }, done: true } },
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  const today = todayYmd(tz);
  return habits.map((h) => {
    const doneDays = new Set(h.entries.map((e) => dateToYmd(e.date)));
    const inRange = [...doneDays].filter((d) => d >= opts.from && d <= opts.to).sort();
    return {
      id: h.id,
      name: h.name,
      category: h.category,
      frequency: h.frequency,
      daysOfWeek: h.daysOfWeek,
      timesPerWeek: h.timesPerWeek,
      color: h.color,
      active: h.active,
      workspace: h.workspace,
      doneDays: inRange,
      expectedToday: isExpectedOn(h, today) || h.frequency === "WEEKLY",
      doneToday: doneDays.has(today),
      stats: computeHabitStats(h, doneDays, opts.from, opts.to, today, tz),
    };
  });
}

export type HabitView = Awaited<ReturnType<typeof listHabits>>[number];

function normalize(data: z.output<typeof habitSchema>) {
  return {
    name: data.name,
    category: data.category || null,
    frequency: data.frequency,
    daysOfWeek: data.frequency === "CUSTOM" ? [...new Set(data.daysOfWeek ?? [])].sort() : [],
    timesPerWeek: data.frequency === "WEEKLY" ? data.timesPerWeek ?? 1 : null,
    color: data.color ?? null,
  };
}

export async function createHabit(userId: string, input: HabitInput) {
  const data = habitSchema.parse(input);
  await requireWorkspaceAccess(userId, data.workspaceId, { module: "habits", write: true });
  const last = await db.habit.findFirst({ where: { workspaceId: data.workspaceId }, orderBy: { position: "desc" } });
  return db.habit.create({ data: { workspaceId: data.workspaceId, ...normalize(data), position: (last?.position ?? -1) + 1 } });
}

async function loadForWrite(userId: string, habitId: string) {
  const habit = await db.habit.findUnique({ where: { id: habitId } });
  if (!habit) throw new NotFoundError("Hábito");
  await requireWorkspaceAccess(userId, habit.workspaceId, { module: "habits", write: true });
  return habit;
}

export async function updateHabit(userId: string, habitId: string, input: HabitInput) {
  const habit = await loadForWrite(userId, habitId);
  const data = habitSchema.parse(input);
  if (data.workspaceId !== habit.workspaceId) {
    await requireWorkspaceAccess(userId, data.workspaceId, { module: "habits", write: true });
  }
  return db.habit.update({ where: { id: habitId }, data: { workspaceId: data.workspaceId, ...normalize(data) } });
}

export async function setHabitActive(userId: string, habitId: string, active: boolean) {
  await loadForWrite(userId, habitId);
  return db.habit.update({ where: { id: habitId }, data: { active } });
}

export async function deleteHabit(userId: string, habitId: string) {
  await loadForWrite(userId, habitId);
  await db.habit.delete({ where: { id: habitId } });
}

/** Marca ou desmarca um dia. Não permite datas futuras. */
export async function setHabitEntry(userId: string, habitId: string, date: string, done: boolean, tz: string, note?: string): Promise<HabitEntry | null> {
  await loadForWrite(userId, habitId);
  const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(date);
  if (day > todayYmd(tz)) throw new AppError("Não é possível marcar um dia futuro.");
  if (!done) {
    await db.habitEntry.deleteMany({ where: { habitId, date: ymdToDate(day) } });
    return null;
  }
  return db.habitEntry.upsert({
    where: { habitId_date: { habitId, date: ymdToDate(day) } },
    create: { habitId, date: ymdToDate(day), done: true, note: note || null },
    update: { done: true, ...(note !== undefined ? { note: note || null } : {}) },
  });
}

export async function reorderHabits(userId: string, orderedIds: string[]) {
  const habits = await db.habit.findMany({ where: { id: { in: orderedIds } } });
  if (habits.length !== orderedIds.length) throw new AppError("Lista inválida.");
  for (const wsId of new Set(habits.map((h) => h.workspaceId))) {
    await requireWorkspaceAccess(userId, wsId, { module: "habits", write: true });
  }
  await db.$transaction(orderedIds.map((id, position) => db.habit.update({ where: { id }, data: { position } })));
}
