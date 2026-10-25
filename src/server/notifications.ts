import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { accessibleWorkspaceIds } from "@/server/workspaces";
import { listOccurrences } from "@/server/calendar";
import { listHabits } from "@/server/habits";
import { findFinanceWorkspace } from "@/server/finance/common";
import { payables, type DueItem } from "@/server/finance/summary";
import { findModuleWorkspace } from "@/server/workspaces";
import { upcomingContent } from "@/server/content";
import { upcomingSessions } from "@/server/mentees";
import { crmMetrics } from "@/server/crm";
import { listGoals } from "@/server/goals";
import { formatGoalValue, SITUATION_LABEL } from "@/lib/goals";
import {
  addDaysYmd, dateToYmd, endOfMonthYmd, formatYmdBR, startOfMonthYmd, startOfWeekYmd,
  todayYmd, ymdInTz, ymdToDate, zonedToUtc,
} from "@/lib/dates";

// ═══════════════════════════════════════════════════════════════
// Leitura e marcação
// ═══════════════════════════════════════════════════════════════

export async function listNotifications(userId: string, opts: { unreadOnly?: boolean; take?: number } = {}) {
  return db.notification.findMany({
    where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: "desc" },
    take: Math.min(opts.take ?? 50, 200),
  });
}

export async function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}

export async function markRead(userId: string, id: string) {
  const n = await db.notification.findFirst({ where: { id, userId } });
  if (!n) throw new NotFoundError("Notificação");
  if (!n.readAt) await db.notification.update({ where: { id }, data: { readAt: new Date() } });
}

export async function markAllRead(userId: string) {
  await db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}

export async function deleteNotification(userId: string, id: string) {
  await db.notification.deleteMany({ where: { id, userId } });
}

// ─── Preferências ──────────────────────────────────────────────

export const prefsSchema = z.object({
  dailyEnabled: z.boolean(),
  dailyTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido."),
  weeklyEnabled: z.boolean(),
  weeklyDay: z.number().int().min(0).max(6),
  monthlyEnabled: z.boolean(),
  monthlyDay: z.number().int().min(1).max(28),
  inAppEnabled: z.boolean(),
  billDueDaysBefore: z.number().int().min(0).max(30),
});
export type NotificationPrefs = z.infer<typeof prefsSchema>;

export async function getPrefs(userId: string) {
  return db.notificationPreference.upsert({ where: { userId }, create: { userId }, update: {} });
}

export async function updatePrefs(userId: string, input: NotificationPrefs) {
  const data = prefsSchema.parse(input);
  return db.notificationPreference.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

// ═══════════════════════════════════════════════════════════════
// Conteúdo dos resumos (somente dados registrados)
// ═══════════════════════════════════════════════════════════════

type Item = { label: string; detail?: string; link?: string };
export type DigestSection = { title: string; items: Item[]; empty: string };
export type DigestData = { kind: "DAILY" | "WEEKLY" | "MONTHLY"; period: { from: string; to: string }; sections: DigestSection[]; stats?: Record<string, number | null> };

function timeLabel(d: Date, tz: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(d);
}

function rangeUtc(from: string, to: string, tz: string) {
  return { start: zonedToUtc(from, "00:00", tz), end: zonedToUtc(addDaysYmd(to, 1), "00:00", tz) };
}

/** Contas a pagar (Pessoal e Mentoria) vencidas ou que vencem nos próximos dias. */
async function billsDue(userId: string, tz: string, days: number): Promise<(DueItem & { area: string })[]> {
  const out: (DueItem & { area: string })[] = [];
  for (const [kind, area, path] of [["PESSOAL", "Pessoal", "/financas/pessoal"], ["MENTORIA", "Mentoria", "/financas/mentoria"]] as const) {
    const ws = await findFinanceWorkspace(userId, kind);
    if (!ws) continue;
    for (const item of await payables(userId, ws.id, tz, days)) out.push({ ...item, area, href: item.href.startsWith("?") ? `${path}${item.href}` : item.href });
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Seções de gestão do dia: conteúdo, encontros e follow-ups do CRM (só módulos com acesso). */
async function managementToday(userId: string, day: string, start: Date, end: Date, tz: string): Promise<DigestSection[]> {
  const out: DigestSection[] = [];
  const content = await upcomingContent(userId, "all", start, new Date(end.getTime() - 1));
  if ((await accessibleWorkspaceIds(userId, "content")).length) {
    out.push({
      title: "Gravações e publicações de hoje",
      empty: "Nenhuma gravação ou publicação programada.",
      items: content.map((c) => ({ label: c.title, detail: `${c.kind === "RECORDING" ? "Gravação" : "Publicação"} · ${timeLabel(c.at, tz)}`, link: `/conteudo?aba=lista&c=${c.id}` })),
    });
  }
  const mentoria = await findModuleWorkspace(userId, "MENTORIA", "mentees");
  if (mentoria) {
    const sessions = await upcomingSessions(userId, [mentoria.id], start, new Date(end.getTime() - 1));
    out.push({ title: "Encontros de mentoria", empty: "Nenhum encontro hoje.", items: sessions.map((s) => ({ label: s.mentee.name, detail: timeLabel(s.date, tz), link: `/mentoria/mentorados/${s.mentee.id}` })) });
  }
  const crm = await findModuleWorkspace(userId, "MENTORIA", "crm");
  if (crm) {
    const leads = await db.lead.findMany({
      where: { workspaceId: crm.id, deletedAt: null, stage: { isWon: false, isLost: false }, nextActionDate: { lte: new Date(`${day}T23:59:59Z`) } },
      select: { id: true, name: true, nextAction: true, nextActionDate: true },
      orderBy: { nextActionDate: "asc" },
      take: 15,
    });
    out.push({
      title: "Follow-ups do CRM",
      empty: "Nenhuma ação de lead para hoje.",
      items: leads.map((l) => ({ label: l.name, detail: `${l.nextAction ?? "Próxima ação"} · ${dateToYmd(l.nextActionDate!) < day ? "atrasada" : "hoje"}`, link: `/mentoria/crm?lead=${l.id}` })),
    });
  }
  return out;
}

export async function buildDailyDigest(userId: string, day: string, tz: string): Promise<DigestData> {
  const ids = await accessibleWorkspaceIds(userId, "tasks");
  const { start, end } = rangeUtc(day, day, tz);
  const base: Prisma.TaskWhereInput = { workspaceId: { in: ids }, deletedAt: null, archivedAt: null, isTemplate: false, status: { isDone: false } };
  const [events, dueToday, overdue, inProgress, priorities, habits] = await Promise.all([
    listOccurrences(userId, start, end),
    db.task.findMany({ where: { ...base, dueDate: ymdToDate(day) }, select: { id: true, title: true }, take: 20 }),
    db.task.findMany({ where: { ...base, dueDate: { lt: ymdToDate(day) } }, select: { id: true, title: true, dueDate: true }, orderBy: { dueDate: "asc" }, take: 20 }),
    db.task.findMany({ where: { ...base, status: { isDone: false, category: "IN_PROGRESS" } }, select: { id: true, title: true }, take: 20 }),
    db.task.findMany({
      where: { ...base, priority: { in: ["HIGH", "URGENT"] }, OR: [{ dueDate: { lte: ymdToDate(addDaysYmd(day, 2)) } }, { dueDate: null }] },
      select: { id: true, title: true, priority: true },
      take: 10,
    }),
    listHabits(userId, { from: day, to: day }, tz),
  ]);
  const prefs = await getPrefs(userId);
  const bills = await billsDue(userId, tz, prefs.billDueDaysBefore);
  const active = events.filter((e) => e.status !== "CANCELLED");
  const gestao = await managementToday(userId, day, start, end, tz);
  return {
    kind: "DAILY",
    period: { from: day, to: day },
    sections: [
      {
        title: "Compromissos de hoje",
        empty: "Nenhum compromisso hoje.",
        items: active.map((e) => ({ label: e.title, detail: e.allDay ? "Dia inteiro" : `${timeLabel(e.start, tz)}–${timeLabel(e.end, tz)} · ${e.workspace.name}`, link: "/agenda" })),
      },
      { title: "Prioridades", empty: "Nenhuma tarefa de prioridade alta.", items: priorities.map((t) => ({ label: t.title, detail: t.priority === "URGENT" ? "Urgente" : "Alta", link: `/tarefas?t=${t.id}` })) },
      { title: "Prazo hoje", empty: "Nenhuma tarefa vence hoje.", items: dueToday.map((t) => ({ label: t.title, link: `/tarefas?t=${t.id}` })) },
      {
        title: "Tarefas atrasadas",
        empty: "Nenhuma tarefa atrasada.",
        items: overdue.map((t) => ({ label: t.title, detail: `Prazo ${formatYmdBR(dateToYmd(t.dueDate!))}`, link: `/tarefas?t=${t.id}` })),
      },
      { title: "Em andamento", empty: "Nenhuma tarefa em andamento.", items: inProgress.map((t) => ({ label: t.title, link: `/tarefas?t=${t.id}` })) },
      {
        title: "Contas a vencer",
        empty: "Nenhuma conta vencida ou a vencer nos próximos dias.",
        items: bills.map((b) => ({
          label: b.label,
          detail: `${b.overdue ? "Vencida em" : "Vence"} ${formatYmdBR(b.dueDate)} · ${(b.amountCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · ${b.area}`,
          link: b.href,
        })),
      },
      ...gestao,
      {
        title: "Hábitos de hoje",
        empty: "Nenhum hábito ativo.",
        items: habits.filter((h) => h.expectedToday).map((h) => ({ label: h.name, detail: h.doneToday ? "Feito" : "Pendente", link: "/habitos" })),
      },
    ],
    stats: { events: active.length, dueToday: dueToday.length, overdue: overdue.length, inProgress: inProgress.length, bills: bills.length },
  };
}

async function periodReview(userId: string, kind: "WEEKLY" | "MONTHLY", from: string, to: string, tz: string): Promise<DigestData> {
  const ids = await accessibleWorkspaceIds(userId, "tasks");
  const { start, end } = rangeUtc(from, to, tz);
  const nextFrom = addDaysYmd(to, 1);
  const nextTo = kind === "WEEKLY" ? addDaysYmd(nextFrom, 6) : endOfMonthYmd(nextFrom);
  const next = rangeUtc(nextFrom, nextTo, tz);
  const base: Prisma.TaskWhereInput = { workspaceId: { in: ids }, deletedAt: null, isTemplate: false };
  const [completed, pending, overdue, events, habits, nextEvents, nextDue] = await Promise.all([
    db.task.findMany({ where: { ...base, status: { isDone: true }, completedAt: { gte: start, lt: end } }, select: { id: true, title: true }, take: 50 }),
    db.task.count({ where: { ...base, archivedAt: null, status: { isDone: false } } }),
    db.task.count({ where: { ...base, archivedAt: null, status: { isDone: false }, dueDate: { lte: ymdToDate(to) } } }),
    listOccurrences(userId, start, end),
    listHabits(userId, { from, to }, tz),
    listOccurrences(userId, next.start, next.end),
    db.task.findMany({
      where: { ...base, archivedAt: null, status: { isDone: false }, dueDate: { gte: ymdToDate(nextFrom), lte: ymdToDate(nextTo) } },
      select: { id: true, title: true, dueDate: true, priority: true },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
      take: 15,
    }),
  ]);
  const done = events.filter((e) => e.status === "DONE").length;
  const held = events.filter((e) => e.status !== "CANCELLED").length;
  const gestao = await managementReview(userId, from, to, start, end, tz);
  const rated = habits.filter((h) => h.stats.rate !== null);
  const habitAvg = rated.length ? Math.round(rated.reduce((s, h) => s + h.stats.rate!, 0) / rated.length) : null;
  return {
    kind,
    period: { from, to },
    stats: { completedTasks: completed.length, pendingTasks: pending, overdueTasks: overdue, events: held, eventsDone: done, habitRate: habitAvg },
    sections: [
      { title: "Tarefas concluídas", empty: "Nenhuma tarefa concluída no período.", items: completed.map((t) => ({ label: t.title, link: `/tarefas?t=${t.id}` })) },
      {
        title: "Pendências",
        empty: "Nenhuma pendência.",
        items: [{ label: `${pending} tarefa(s) pendente(s)`, detail: overdue ? `${overdue} com prazo vencido` : undefined, link: "/tarefas" }],
      },
      {
        title: "Compromissos",
        empty: "Nenhum compromisso no período.",
        items: held ? [{ label: `${held} compromisso(s)`, detail: `${done} marcado(s) como concluído(s)`, link: "/agenda" }] : [],
      },
      {
        title: "Hábitos",
        empty: "Nenhum hábito com registro no período.",
        items: rated.map((h) => ({ label: h.name, detail: `${h.stats.rate}% (${h.stats.done}/${h.stats.expected})`, link: "/habitos" })),
      },
      ...gestao,
      {
        title: kind === "WEEKLY" ? "Prioridades da próxima semana" : "Prioridades do próximo mês",
        empty: "Nada agendado ainda.",
        items: [
          ...nextDue.map((t) => ({ label: t.title, detail: `Prazo ${formatYmdBR(dateToYmd(t.dueDate!))}`, link: `/tarefas?t=${t.id}` })),
          ...(nextEvents.length ? [{ label: `${nextEvents.filter((e) => e.status !== "CANCELLED").length} compromisso(s) na agenda`, link: "/agenda" }] : []),
        ],
      },
    ],
  };
}

/** Revisão de gestão: conteúdo publicado, funil e metas (somente com dados registrados). */
async function managementReview(userId: string, from: string, to: string, start: Date, end: Date, tz: string): Promise<DigestSection[]> {
  const out: DigestSection[] = [];
  const contentWs = await accessibleWorkspaceIds(userId, "content");
  if (contentWs.length) {
    const published = await db.contentItem.findMany({
      where: { workspaceId: { in: contentWs }, deletedAt: null, status: { isPublished: true }, publishedAt: { gte: start, lt: end } },
      select: { id: true, title: true },
      take: 30,
    });
    out.push({ title: "Conteúdos publicados", empty: "Nenhum conteúdo publicado no período.", items: published.map((c) => ({ label: c.title, link: `/conteudo?aba=lista&c=${c.id}` })) });
  }
  const crm = await findModuleWorkspace(userId, "MENTORIA", "crm");
  if (crm) {
    const m = await crmMetrics(userId, crm.id, { from, to }, tz);
    out.push({
      title: "Funil de vendas",
      empty: "Nenhum lead novo ou fechado no período.",
      items: m.newLeads || m.won || m.lost
        ? [{ label: `${m.newLeads} lead(s) novo(s) · ${m.won} venda(s) · ${m.lost} perdido(s)`, detail: m.conversionRate !== null ? `Conversão ${m.conversionRate.toLocaleString("pt-BR")}%` : undefined, link: "/mentoria/crm" }]
        : [],
    });
  }
  if ((await accessibleWorkspaceIds(userId, "goals")).length) {
    const goals = await listGoals(userId, { status: "ACTIVE" }, tz);
    out.push({
      title: "Metas",
      empty: "Nenhuma meta ativa.",
      items: goals.map((g) => ({
        label: g.title,
        detail: `${SITUATION_LABEL[g.situation]} · ${g.measure === "QUALITATIVE" ? `${g.progress}% das etapas` : `${formatGoalValue(g.currentValue, g.unit)} de ${formatGoalValue(g.targetValue, g.unit)}`}`,
        link: `/metas?meta=${g.id}`,
      })),
    });
  }
  return out;
}

export const buildWeeklyReview = (userId: string, weekStart: string, tz: string) =>
  periodReview(userId, "WEEKLY", weekStart, addDaysYmd(weekStart, 6), tz);

export const buildMonthlyReview = (userId: string, monthStart: string, tz: string) =>
  periodReview(userId, "MONTHLY", monthStart, endOfMonthYmd(monthStart), tz);

function summarize(d: DigestData): string {
  const s = d.stats ?? {};
  if (d.kind === "DAILY") {
    return [`${s.events ?? 0} compromisso(s)`, `${s.dueToday ?? 0} tarefa(s) para hoje`, s.overdue ? `${s.overdue} atrasada(s)` : null, s.bills ? `${s.bills} conta(s) a vencer` : null].filter(Boolean).join(" · ");
  }
  return [`${s.completedTasks ?? 0} tarefa(s) concluída(s)`, `${s.pendingTasks ?? 0} pendente(s)`, s.habitRate != null ? `hábitos ${s.habitRate}%` : null].filter(Boolean).join(" · ");
}

// ═══════════════════════════════════════════════════════════════
// Geração (chamada pelo app ao abrir e pelo agendador)
// ═══════════════════════════════════════════════════════════════

async function createOnce(data: Prisma.NotificationUncheckedCreateInput) {
  try {
    await db.notification.create({ data });
    return true;
  } catch (e) {
    if (e instanceof Error && "code" in e && (e as { code: string }).code === "P2002") return false;
    throw e;
  }
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/**
 * Cria as notificações devidas até `now`, sem duplicar (chave única).
 * Resumo diário: no horário configurado. Revisão semanal: no dia configurado,
 * sobre a semana anterior. Revisão mensal: no dia configurado, sobre o mês anterior.
 * Lembretes: compromissos com lembrete cujo aviso já venceu e que ainda não começaram.
 */
export async function generateDueNotifications(userId: string, tz: string, now = new Date()) {
  const prefs = await getPrefs(userId);
  if (!prefs.inAppEnabled) return { created: 0 };
  const today = todayYmd(tz, now);
  const localTime = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  const afterDaily = localTime >= prefs.dailyTime;
  let created = 0;

  if (prefs.dailyEnabled && afterDaily && !(await db.notification.findUnique({ where: { dedupeKey: `DAILY:${userId}:${today}` } }))) {
    const digest = await buildDailyDigest(userId, today, tz);
    if (await createOnce({ userId, type: "DAILY_DIGEST", title: `Resumo do dia · ${formatYmdBR(today)}`, body: summarize(digest), data: digest as unknown as Prisma.InputJsonValue, link: "/notificacoes", dedupeKey: `DAILY:${userId}:${today}` })) created++;
  }

  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  if (prefs.weeklyEnabled && weekday === prefs.weeklyDay && afterDaily) {
    const lastWeekStart = addDaysYmd(startOfWeekYmd(today), -7);
    const key = `WEEKLY:${userId}:${lastWeekStart}`;
    if (!(await db.notification.findUnique({ where: { dedupeKey: key } }))) {
      const review = await buildWeeklyReview(userId, lastWeekStart, tz);
      if (await createOnce({ userId, type: "WEEKLY_REVIEW", title: `Revisão semanal · ${formatYmdBR(lastWeekStart)} a ${formatYmdBR(addDaysYmd(lastWeekStart, 6))}`, body: summarize(review), data: review as unknown as Prisma.InputJsonValue, link: "/notificacoes", dedupeKey: key })) created++;
    }
  }

  if (prefs.monthlyEnabled && Number(today.slice(8, 10)) === prefs.monthlyDay && afterDaily) {
    const prevMonth = startOfMonthYmd(addDaysYmd(startOfMonthYmd(today), -1));
    const key = `MONTHLY:${userId}:${prevMonth}`;
    if (!(await db.notification.findUnique({ where: { dedupeKey: key } }))) {
      const review = await buildMonthlyReview(userId, prevMonth, tz);
      const label = `${MONTHS[Number(prevMonth.slice(5, 7)) - 1]} de ${prevMonth.slice(0, 4)}`;
      if (await createOnce({ userId, type: "MONTHLY_REVIEW", title: `Revisão mensal · ${label}`, body: summarize(review), data: review as unknown as Prisma.InputJsonValue, link: "/notificacoes", dedupeKey: key })) created++;
    }
  }

  // Lembretes de compromissos (janela: próximas 7 dias para cobrir lembretes longos)
  const upcoming = await listOccurrences(userId, now, new Date(now.getTime() + 7 * 86_400_000));
  const withReminder = await db.calendarEvent.findMany({
    where: { id: { in: [...new Set(upcoming.map((o) => o.eventId))] }, reminderMinutes: { not: null } },
    select: { id: true, reminderMinutes: true },
  });
  const reminderOf = new Map(withReminder.map((e) => [e.id, e.reminderMinutes!]));
  for (const o of upcoming) {
    const minutes = reminderOf.get(o.eventId);
    if (minutes === undefined || o.status === "CANCELLED") continue;
    if (o.start.getTime() - minutes * 60_000 > now.getTime()) continue;
    const when = o.allDay ? "hoje" : `às ${timeLabel(o.start, tz)}${ymdInTz(o.start, tz) !== today ? ` de ${formatYmdBR(ymdInTz(o.start, tz))}` : ""}`;
    if (await createOnce({ userId, workspaceId: o.workspace.id, type: "EVENT_REMINDER", title: o.title, body: `Começa ${when} · ${o.workspace.name}`, link: "/agenda", dedupeKey: `REMINDER:${userId}:${o.key}` })) created++;
  }

  // Avisos de contas a vencer (um por conta e vencimento)
  try {
    for (const b of await billsDue(userId, tz, prefs.billDueDaysBefore)) {
      const brl = (b.amountCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      if (
        await createOnce({
          userId,
          type: "BILL_DUE",
          title: `${b.overdue ? "Conta vencida" : "Conta a vencer"}: ${b.label}`,
          body: `${brl} · ${b.overdue ? "venceu em" : "vence em"} ${formatYmdBR(b.dueDate)} · ${b.area}`,
          link: b.href,
          dedupeKey: `BILL:${userId}:${b.key}:${b.dueDate}`,
        })
      )
        created++;
    }
  } catch (error) {
    console.error("Falha ao gerar avisos de contas", error);
  }

  return { created };
}

// Evita regenerar a cada navegação: no máximo uma verificação por usuária a cada 5 minutos por servidor
const lastCheck = new Map<string, number>();
export async function maybeGenerateNotifications(userId: string, tz: string) {
  const last = lastCheck.get(userId) ?? 0;
  if (Date.now() - last < 5 * 60_000) return;
  lastCheck.set(userId, Date.now());
  try {
    await generateDueNotifications(userId, tz);
  } catch (error) {
    console.error("Falha ao gerar notificações", error);
  }
}
