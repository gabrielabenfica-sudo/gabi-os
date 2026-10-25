import { z } from "zod";
import { db } from "@/server/db";
import { accessibleWorkspaceIds } from "@/server/workspaces";
import { listOccurrences } from "@/server/calendar";
import { listHabits } from "@/server/habits";
import { taskCardInclude, taskStats } from "@/server/tasks";
import { findFinanceWorkspace } from "@/server/finance/common";
import { balancesFor } from "@/server/finance/accounts";
import { payables, personalMonthly } from "@/server/finance/summary";
import { upcomingContent } from "@/server/content";
import { listGoals } from "@/server/goals";
import { upcomingSessions } from "@/server/mentees";
import { findModuleWorkspace } from "@/server/workspaces";
import { addDaysYmd, eachDayYmd, endOfMonthYmd, startOfMonthYmd, startOfWeekYmd, todayYmd, ymdInTz, ymdToDate, zonedToUtc } from "@/lib/dates";

import { WIDGETS } from "@/lib/dashboard-widgets";
import type { DashboardPeriod, DashboardPrefs } from "@/lib/dashboard-widgets";
export { WIDGETS };
export type { DashboardPeriod, DashboardPrefs, WidgetId } from "@/lib/dashboard-widgets";

const prefsSchema = z.object({
  order: z.array(z.string()).max(50).default([]),
  hidden: z.array(z.string()).max(50).default([]),
});

export function parseDashboardPrefs(raw: unknown): DashboardPrefs {
  const parsed = prefsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { order: [], hidden: [] };
}

export async function saveDashboardPrefs(userId: string, input: unknown) {
  const ids = new Set<string>(WIDGETS.map((w) => w.id));
  const data = prefsSchema.parse(input);
  const clean = { order: data.order.filter((id) => ids.has(id)), hidden: data.hidden.filter((id) => ids.has(id)) };
  await db.user.update({ where: { id: userId }, data: { dashboardPrefs: clean } });
  return clean;
}

export function resolvePeriod(period: DashboardPeriod, tz: string, custom?: { from?: string; to?: string }) {
  const today = todayYmd(tz);
  switch (period) {
    case "today":
      return { from: today, to: today };
    case "week": {
      const from = startOfWeekYmd(today);
      return { from, to: addDaysYmd(from, 6) };
    }
    case "month":
      return { from: startOfMonthYmd(today), to: endOfMonthYmd(today) };
    case "custom": {
      const ok = (v?: string) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
      const from = ok(custom?.from) ? custom!.from! : today;
      let to = ok(custom?.to) ? custom!.to! : from;
      if (to < from) to = from;
      if (eachDayYmd(from, to).length > 366) to = addDaysYmd(from, 365);
      return { from, to };
    }
  }
}

/** Dados do painel, todos vindos de registros reais. */
export async function getDashboard(userId: string, tz: string, workspaceFilter: string, range: { from: string; to: string }) {
  const today = todayYmd(tz);
  const now = new Date();
  const rangeStart = zonedToUtc(range.from, "00:00", tz);
  const rangeEnd = zonedToUtc(addDaysYmd(range.to, 1), "00:00", tz);
  const taskWs = await accessibleWorkspaceIds(userId, "tasks", workspaceFilter);
  const open = { workspaceId: { in: taskWs }, deletedAt: null, archivedAt: null, isTemplate: false, status: { isDone: false } };

  const [stats, periodEvents, upcoming, priorities, overdue, completed, habits] = await Promise.all([
    taskStats(userId, workspaceFilter, tz, range),
    listOccurrences(userId, rangeStart, rangeEnd, workspaceFilter),
    listOccurrences(userId, now, new Date(now.getTime() + 60 * 86_400_000), workspaceFilter),
    db.task.findMany({
      where: { ...open, OR: [{ priority: { in: ["HIGH", "URGENT"] } }, { dueDate: { lte: ymdToDate(range.to) } }] },
      include: taskCardInclude,
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
      take: 8,
    }),
    db.task.findMany({ where: { ...open, dueDate: { lt: ymdToDate(today) } }, include: taskCardInclude, orderBy: { dueDate: "asc" }, take: 8 }),
    db.task.findMany({
      where: { workspaceId: { in: taskWs }, deletedAt: null, isTemplate: false, status: { isDone: true }, completedAt: { gte: rangeStart, lt: rangeEnd } },
      select: { completedAt: true },
    }),
    listHabits(userId, { workspaceId: workspaceFilter, from: range.from, to: range.to < today ? range.to : today }, tz),
  ]);

  const activeEvents = periodEvents.filter((o) => o.status !== "CANCELLED");
  const nextEvent = upcoming.find((o) => o.status !== "CANCELLED" && o.end > now) ?? null;
  const weekFrom = startOfWeekYmd(today);
  const weekEvents = await listOccurrences(userId, zonedToUtc(weekFrom, "00:00", tz), zonedToUtc(addDaysYmd(weekFrom, 7), "00:00", tz), workspaceFilter);

  const days = eachDayYmd(range.from, range.to);
  const perDay = new Map(days.map((d) => [d, 0]));
  for (const t of completed) {
    const d = ymdInTz(t.completedAt!, tz);
    if (perDay.has(d)) perDay.set(d, perDay.get(d)! + 1);
  }

  // Resumo financeiro pessoal do mês corrente (só quando o filtro inclui o ambiente Pessoal)
  const pessoal = await findFinanceWorkspace(userId, "PESSOAL");
  let finance: null | { month: Awaited<ReturnType<typeof personalMonthly>>[number]; balanceCents: number; dueSoon: Awaited<ReturnType<typeof payables>>; hasAccounts: boolean } = null;
  if (pessoal && (workspaceFilter === "all" || workspaceFilter === pessoal.id)) {
    const ym = today.slice(0, 7);
    const accounts = await db.financialAccount.findMany({ where: { workspaceId: pessoal.id, archived: false }, select: { id: true } });
    const [monthRow, due, bal] = await Promise.all([
      personalMonthly(userId, pessoal, ym, ym),
      payables(userId, pessoal.id, tz, 7),
      balancesFor(accounts.map((a) => a.id)),
    ]);
    finance = { month: monthRow[0]!, balanceCents: [...bal.values()].reduce((a, b) => a + b, 0), dueSoon: due, hasAccounts: accounts.length > 0 };
  }

  // Gestão: próximas gravações/publicações, metas ativas e Mentoria (encontros e funil)
  const twoWeeks = new Date(now.getTime() + 14 * 86_400_000);
  const [contentNext, goals, mentoriaWs] = await Promise.all([
    upcomingContent(userId, workspaceFilter === "all" ? "all" : [workspaceFilter], now, twoWeeks),
    listGoals(userId, { workspace: workspaceFilter, status: "ACTIVE" }, tz),
    findModuleWorkspace(userId, "MENTORIA", "mentees"),
  ]);
  let mentoria: null | { sessions: Awaited<ReturnType<typeof upcomingSessions>>; overdueLeads: number; openLeads: number; crm: boolean } = null;
  if (mentoriaWs && (workspaceFilter === "all" || workspaceFilter === mentoriaWs.id)) {
    const crmWs = await findModuleWorkspace(userId, "MENTORIA", "crm");
    const leadBase = { workspaceId: mentoriaWs.id, deletedAt: null, stage: { isWon: false, isLost: false } };
    const [sessions, overdueLeads, openLeads] = await Promise.all([
      upcomingSessions(userId, [mentoriaWs.id], new Date(now.getTime() - 3600_000), new Date(now.getTime() + 7 * 86_400_000)),
      crmWs ? db.lead.count({ where: { ...leadBase, nextActionDate: { lt: new Date(`${today}T00:00:00Z`) } } }) : Promise.resolve(0),
      crmWs ? db.lead.count({ where: leadBase }) : Promise.resolve(0),
    ]);
    mentoria = { sessions, overdueLeads, openLeads, crm: !!crmWs };
  }

  const expectedToday = habits.filter((h) => h.expectedToday);
  const rated = habits.filter((h) => h.stats.rate !== null);

  // Prioridades: alta/urgente ou com prazo no período, ordenadas por urgência
  const rank = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;
  const sortedPriorities = [...priorities].sort(
    (a, b) => rank[a.priority] - rank[b.priority] || (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity),
  );

  return {
    range,
    today,
    stats,
    eventsTodayCount: (await listOccurrences(userId, zonedToUtc(today, "00:00", tz), zonedToUtc(addDaysYmd(today, 1), "00:00", tz), workspaceFilter)).filter((o) => o.status !== "CANCELLED").length,
    eventsWeekCount: weekEvents.filter((o) => o.status !== "CANCELLED").length,
    periodEvents: activeEvents.slice(0, 12),
    periodEventsCount: activeEvents.length,
    nextEvent,
    priorities: sortedPriorities,
    overdue,
    completionSeries: days.map((d) => ({ day: d, count: perDay.get(d)! })),
    finance,
    contentNext,
    goals: goals.slice(0, 6),
    goalsCount: goals.length,
    mentoria,
    habits: {
      expectedToday: expectedToday.length,
      doneToday: expectedToday.filter((h) => h.doneToday).length,
      items: habits.slice(0, 8).map((h) => ({ id: h.id, name: h.name, doneToday: h.doneToday, expectedToday: h.expectedToday, rate: h.stats.rate, color: h.color ?? h.workspace.color })),
      averageRate: rated.length ? Math.round(rated.reduce((s, h) => s + h.stats.rate!, 0) / rated.length) : null,
      count: habits.length,
    },
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
