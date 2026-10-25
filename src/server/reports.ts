import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { accessibleWorkspaceIds, listWorkspaces } from "@/server/workspaces";
import { listOccurrences } from "@/server/calendar";
import { listHabits } from "@/server/habits";
import { findFinanceWorkspace } from "@/server/finance/common";
import { mentoriaMonthly, personalMonthly } from "@/server/finance/summary";
import { crmMetrics } from "@/server/crm";
import { contentReport } from "@/server/content";
import { listGoals } from "@/server/goals";
import { findModuleWorkspace } from "@/server/workspaces";
import { addDaysYmd, dateToYmd, ymdToDate, zonedToUtc } from "@/lib/dates";

/**
 * Relatório consolidado de um período: só números calculados a partir dos
 * registros, em cada módulo a que a usuária tem acesso. Valores financeiros
 * seguem as regras do financeiro (competência, sem contagem dupla) e somam os
 * meses do período.
 */
export async function consolidatedReport(userId: string, range: { from: string; to: string }, tz: string) {
  if (range.to < range.from) throw new AppError("O fim do período precisa ser depois do início.");
  const days = Math.round((ymdToDate(range.to).getTime() - ymdToDate(range.from).getTime()) / 86_400_000) + 1;
  if (days > 370) throw new AppError("Escolha um período de até 1 ano.");
  const start = zonedToUtc(range.from, "00:00", tz);
  const end = zonedToUtc(addDaysYmd(range.to, 1), "00:00", tz);
  const [fm, tm] = [range.from.slice(0, 7), range.to.slice(0, 7)];
  const workspaces = await listWorkspaces(userId);
  const wsName = new Map(workspaces.map((w) => [w.id, w.name]));

  // ─── Tarefas ───
  const taskWs = await accessibleWorkspaceIds(userId, "tasks");
  const taskBase = { workspaceId: { in: taskWs }, deletedAt: null, isTemplate: false };
  const [created, completed, overdueNow, timeEntries] = await Promise.all([
    db.task.groupBy({ by: ["workspaceId"], where: { ...taskBase, createdAt: { gte: start, lt: end } }, _count: true }),
    db.task.groupBy({ by: ["workspaceId"], where: { ...taskBase, status: { isDone: true }, completedAt: { gte: start, lt: end } }, _count: true }),
    db.task.count({ where: { ...taskBase, archivedAt: null, status: { isDone: false }, dueDate: { lt: ymdToDate(range.to) } } }),
    db.timeEntry.findMany({ where: { task: taskBase, date: { gte: ymdToDate(range.from), lte: ymdToDate(range.to) } }, select: { minutes: true, task: { select: { workspaceId: true } } } }),
  ]);
  const byWs = <T extends { workspaceId: string; _count: number }>(rows: T[]) => rows.map((r) => ({ workspace: wsName.get(r.workspaceId) ?? "—", count: r._count }));
  const minutesByWs = new Map<string, number>();
  for (const t of timeEntries) minutesByWs.set(t.task.workspaceId, (minutesByWs.get(t.task.workspaceId) ?? 0) + t.minutes);
  const tasks = taskWs.length
    ? {
        created: created.reduce((a, r) => a + r._count, 0),
        completed: completed.reduce((a, r) => a + r._count, 0),
        completedByWorkspace: byWs(completed),
        overdueAtEnd: overdueNow,
        minutesLogged: timeEntries.reduce((a, t) => a + t.minutes, 0),
        minutesByWorkspace: [...minutesByWs.entries()].map(([id, minutes]) => ({ workspace: wsName.get(id) ?? "—", minutes })),
      }
    : null;

  // ─── Agenda ───
  const calWs = await accessibleWorkspaceIds(userId, "calendar");
  let agenda = null;
  if (calWs.length) {
    const occ = (await listOccurrences(userId, start, end)).filter((o) => o.status !== "CANCELLED");
    const busy = occ.filter((o) => !o.allDay && o.transparency === "BUSY");
    const minutes = new Map<string, number>();
    for (const o of busy) {
      const m = Math.round((Math.min(o.end.getTime(), end.getTime()) - Math.max(o.start.getTime(), start.getTime())) / 60_000);
      if (m > 0) minutes.set(o.workspace.name, (minutes.get(o.workspace.name) ?? 0) + m);
    }
    agenda = {
      events: occ.length,
      done: occ.filter((o) => o.status === "DONE").length,
      busyMinutes: [...minutes.values()].reduce((a, b) => a + b, 0),
      minutesByWorkspace: [...minutes.entries()].map(([workspace, m]) => ({ workspace, minutes: m })),
    };
  }

  // ─── Hábitos ───
  const habitWs = await accessibleWorkspaceIds(userId, "habits");
  let habits = null;
  if (habitWs.length) {
    const list = await listHabits(userId, { from: range.from, to: range.to }, tz);
    const t = list.reduce((a, h) => ({ e: a.e + h.stats.expected, d: a.d + h.stats.done }), { e: 0, d: 0 });
    habits = {
      rate: t.e ? Math.round((t.d / t.e) * 100) : null,
      items: list.filter((h) => h.stats.rate !== null).map((h) => ({ name: h.name, rate: h.stats.rate!, done: h.stats.done, expected: h.stats.expected })),
    };
  }

  // ─── Financeiro ───
  const pessoal = await findFinanceWorkspace(userId, "PESSOAL");
  const mentoria = await findFinanceWorkspace(userId, "MENTORIA");
  const turbo = await findFinanceWorkspace(userId, "TURBO");
  const sum = <T>(rows: T[], f: (r: T) => number) => rows.reduce((a, r) => a + f(r), 0);
  const personal = pessoal
    ? await personalMonthly(userId, pessoal, fm, tm).then((m) => ({
        incomeCents: sum(m, (r) => r.incomeTotal),
        expenseCents: sum(m, (r) => r.expenseTotal),
        resultCents: sum(m, (r) => r.result),
        resultRealizedCents: sum(m, (r) => r.resultRealized),
        distributionsCents: sum(m, (r) => r.distributions),
      }))
    : null;
  const mentoriaFin = mentoria
    ? await mentoriaMonthly(mentoria.id, fm, tm).then((m) => ({
        salesCount: sum(m, (r) => r.salesCount),
        revenueCents: sum(m, (r) => r.revenueCents),
        expensesCents: sum(m, (r) => r.expensesCents),
        profitCents: sum(m, (r) => r.profitCents),
        receiptsCents: sum(m, (r) => r.receiptsCents),
      }))
    : null;
  const turboComp = turbo
    ? await db.compensationRecord
        .findMany({
          where: { workspaceId: turbo.id, deletedAt: null, status: { not: "CANCELLED" }, referenceMonth: { gte: ymdToDate(`${fm}-01`), lte: ymdToDate(`${tm}-01`) } },
          select: { expectedCents: true, receivedCents: true, status: true },
        })
        .then((r) => ({ expectedCents: sum(r, (x) => x.expectedCents), receivedCents: sum(r.filter((x) => x.status === "RECEIVED"), (x) => x.receivedCents ?? 0) }))
    : null;

  // ─── Gestão ───
  const crmWs = await findModuleWorkspace(userId, "MENTORIA", "crm");
  const crm = crmWs ? await crmMetrics(userId, crmWs.id, range, tz) : null;
  const contentWs = await accessibleWorkspaceIds(userId, "content");
  const content = contentWs.length ? await contentReport(userId, range, tz) : null;
  const menteeWs = await findModuleWorkspace(userId, "MENTORIA", "mentees");
  const mentees = menteeWs
    ? {
        active: await db.mentee.count({ where: { workspaceId: menteeWs.id, deletedAt: null, status: "ACTIVE" } }),
        started: await db.mentee.count({ where: { workspaceId: menteeWs.id, deletedAt: null, startDate: { gte: ymdToDate(range.from), lte: ymdToDate(range.to) } } }),
        sessionsDone: await db.mentoringSession.count({ where: { status: "DONE", date: { gte: start, lt: end }, mentee: { workspaceId: menteeWs.id, deletedAt: null } } }),
      }
    : null;
  const goalWs = await accessibleWorkspaceIds(userId, "goals");
  let goals = null;
  if (goalWs.length) {
    const active = await listGoals(userId, { status: "ACTIVE" }, tz);
    const closed = await db.goal.groupBy({ by: ["status"], where: { workspaceId: { in: goalWs }, deletedAt: null, status: { in: ["ACHIEVED", "MISSED"] }, updatedAt: { gte: start, lt: end } }, _count: true });
    goals = {
      active: active.length,
      onTrack: active.filter((g) => ["ACHIEVED", "ON_TRACK", "WITHIN_LIMIT"].includes(g.situation)).length,
      attention: active.filter((g) => ["BEHIND", "OVER_LIMIT", "ENDED_MISSED"].includes(g.situation)).length,
      achievedInPeriod: closed.find((c) => c.status === "ACHIEVED")?._count ?? 0,
      missedInPeriod: closed.find((c) => c.status === "MISSED")?._count ?? 0,
      items: active.map((g) => ({ id: g.id, title: g.title, situation: g.situation, progress: g.progress, unit: g.unit, current: g.currentValue, target: g.targetValue, measure: g.measure })),
    };
  }

  // ─── MAAS (pessoal) ───
  const maasRows = await db.maasAssessment.findMany({ where: { userId, date: { gte: ymdToDate(range.from), lte: ymdToDate(range.to) } }, include: { scores: true }, orderBy: { date: "asc" } });
  const maas = maasRows.length
    ? maasRows.map((a) => ({ date: dateToYmd(a.date), average: Math.round((a.scores.reduce((s, x) => s + x.score, 0) / Math.max(1, a.scores.length)) * 10) / 10 }))
    : [];

  return { range, days, tasks, agenda, habits, personal, mentoria: mentoriaFin, turbo: turboComp, crm, content: content && { publishedCount: content.publishedCount, totalReach: content.totalReach, avgEngagement: content.avgEngagement, byFormat: content.byFormat }, mentees, goals, maas };
}

export type ConsolidatedReport = Awaited<ReturnType<typeof consolidatedReport>>;

/** Linhas "seção; indicador; valor" para exportar em CSV. */
export function reportRows(r: ConsolidatedReport): [string, string, string][] {
  const brl = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const h = (m: number) => (m / 60).toFixed(1).replace(".", ",");
  const rows: [string, string, string][] = [["Período", "De", r.range.from], ["Período", "Até", r.range.to]];
  if (r.tasks) rows.push(["Tarefas", "Criadas", String(r.tasks.created)], ["Tarefas", "Concluídas", String(r.tasks.completed)], ["Tarefas", "Atrasadas no fim do período", String(r.tasks.overdueAtEnd)], ["Tarefas", "Horas registradas", h(r.tasks.minutesLogged)]);
  if (r.agenda) rows.push(["Agenda", "Compromissos", String(r.agenda.events)], ["Agenda", "Horas ocupadas", h(r.agenda.busyMinutes)]);
  if (r.habits) rows.push(["Hábitos", "Realização (%)", r.habits.rate === null ? "" : String(r.habits.rate)]);
  if (r.personal) rows.push(["Pessoal", "Receitas (R$)", brl(r.personal.incomeCents)], ["Pessoal", "Despesas (R$)", brl(r.personal.expenseCents)], ["Pessoal", "Resultado (R$)", brl(r.personal.resultCents)]);
  if (r.mentoria) rows.push(["Mentoria", "Vendas", String(r.mentoria.salesCount)], ["Mentoria", "Faturamento (R$)", brl(r.mentoria.revenueCents)], ["Mentoria", "Despesas (R$)", brl(r.mentoria.expensesCents)], ["Mentoria", "Lucro (R$)", brl(r.mentoria.profitCents)], ["Mentoria", "Recebido (R$)", brl(r.mentoria.receiptsCents)]);
  if (r.turbo) rows.push(["TURBO", "Remuneração prevista (R$)", brl(r.turbo.expectedCents)], ["TURBO", "Remuneração recebida (R$)", brl(r.turbo.receivedCents)]);
  if (r.crm) rows.push(["CRM", "Novos leads", String(r.crm.newLeads)], ["CRM", "Vendas", String(r.crm.won)], ["CRM", "Perdidos", String(r.crm.lost)], ["CRM", "Conversão (%)", r.crm.conversionRate === null ? "" : String(r.crm.conversionRate).replace(".", ",")]);
  if (r.content) rows.push(["Conteúdo", "Publicados", String(r.content.publishedCount)], ["Conteúdo", "Alcance somado", String(r.content.totalReach)], ["Conteúdo", "Engajamento médio (%)", r.content.avgEngagement === null ? "" : String(r.content.avgEngagement).replace(".", ",")]);
  if (r.mentees) rows.push(["Mentorados", "Ativos", String(r.mentees.active)], ["Mentorados", "Iniciados no período", String(r.mentees.started)], ["Mentorados", "Encontros realizados", String(r.mentees.sessionsDone)]);
  if (r.goals) rows.push(["Metas", "Ativas", String(r.goals.active)], ["Metas", "No ritmo", String(r.goals.onTrack)], ["Metas", "Pedem atenção", String(r.goals.attention)]);
  for (const m of r.maas) rows.push(["MAAS", `Média em ${m.date}`, String(m.average).replace(".", ",")]);
  return rows;
}
