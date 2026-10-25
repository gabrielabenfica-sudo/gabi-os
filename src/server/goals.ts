import type { Goal, GoalStep, Prisma, Workspace } from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { AppError, NotFoundError } from "@/server/errors";
import { accessibleWorkspaceIds, requireWorkspaceAccess } from "@/server/workspaces";
import { audit } from "@/server/audit";
import { addDaysYmd, addMonthsYm, dateToYmd, todayYmd, ymdToDate, zonedToUtc } from "@/lib/dates";
import { AUTO_METRICS, autoMetric, computeGoalProgress, GOAL_TYPES, type GoalProgressView } from "@/lib/goals";
import { mentoriaMonthly, personalMonthly } from "@/server/finance/summary";
import { balancesFor, RESERVE_TYPES } from "@/server/finance/accounts";
import { crmMetrics } from "@/server/crm";
import { listHabits } from "@/server/habits";

const access = (userId: string, workspaceId: string, write = false) => requireWorkspaceAccess(userId, workspaceId, { module: "goals", write });

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const value = z.number().min(-1e15).max(1e15).nullable().optional();
const typeValues = GOAL_TYPES.map((t) => t.value) as [string, ...string[]];
const metricValues = AUTO_METRICS.map((m) => m.value) as [string, ...string[]];

export const goalSchema = z
  .object({
    workspaceId: z.string().min(1, "Escolha o ambiente."),
    type: z.enum(typeValues),
    title: z.string().trim().min(1, "Informe o título.").max(200),
    description: z.string().max(5000).nullable().optional(),
    category: z.string().trim().max(60).nullable().optional(),
    measure: z.enum(["QUANTITATIVE", "QUALITATIVE"]).default("QUANTITATIVE"),
    direction: z.enum(["UP", "DOWN"]).default("UP"),
    indicator: z.string().trim().max(120).nullable().optional(),
    unit: z.string().trim().max(20).nullable().optional(),
    startValue: value,
    targetValue: value,
    currentValue: value,
    autoMetric: z.enum(metricValues).nullable().optional(),
    horizon: z.enum(["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"]).default("CUSTOM"),
    startDate: ymd.nullable().optional(),
    dueDate: ymd.nullable().optional(),
    owner: z.string().trim().max(100).nullable().optional(),
    notes: z.string().max(10000).nullable().optional(),
    isObjective: z.boolean().optional(),
    steps: z.array(z.string().trim().min(1).max(300)).max(100).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.measure === "QUANTITATIVE" && v.targetValue == null) ctx.addIssue({ code: "custom", message: "Informe o valor-alvo.", path: ["targetValue"] });
    if (v.startDate && v.dueDate && v.dueDate < v.startDate) ctx.addIssue({ code: "custom", message: "O prazo precisa ser depois do início.", path: ["dueDate"] });
    if (v.autoMetric && (!v.startDate || !v.dueDate)) ctx.addIssue({ code: "custom", message: "Metas automáticas precisam de início e prazo.", path: ["startDate"] });
    if (v.autoMetric && v.measure !== "QUANTITATIVE") ctx.addIssue({ code: "custom", message: "Cálculo automático é só para metas quantitativas.", path: ["autoMetric"] });
  });
export type GoalInput = z.input<typeof goalSchema>;

async function assertMetricFits(workspace: Pick<Workspace, "kind">, metric?: string | null) {
  const m = autoMetric(metric);
  if (m && m.kinds.length && !(m.kinds as readonly string[]).includes(workspace.kind)) {
    throw new AppError(`“${m.label}” só pode ser usado no ambiente ${m.kinds[0] === "MENTORIA" ? "Mentoria" : m.kinds[0] === "PESSOAL" ? "Pessoal" : "TURBO"}.`);
  }
}

function goalData(d: z.output<typeof goalSchema>) {
  const metric = autoMetric(d.autoMetric);
  return {
    type: d.type as Goal["type"],
    title: d.title,
    description: d.description || null,
    category: d.category || null,
    measure: d.measure,
    direction: d.direction,
    indicator: d.indicator || metric?.label || null,
    unit: metric?.unit ?? (d.unit || null),
    startValue: d.measure === "QUANTITATIVE" ? d.startValue ?? null : null,
    targetValue: d.measure === "QUANTITATIVE" ? d.targetValue ?? null : null,
    autoMetric: d.autoMetric || null,
    horizon: d.horizon,
    startDate: d.startDate ? ymdToDate(d.startDate) : null,
    dueDate: d.dueDate ? ymdToDate(d.dueDate) : null,
    owner: d.owner || null,
    notes: d.notes || null,
    isObjective: d.isObjective ?? false,
  };
}

// ═══════════════════════════════════════════════════════════════
// Indicadores automáticos (dados reais)
// ═══════════════════════════════════════════════════════════════

const monthsOf = (from: string, to: string) => {
  const out: string[] = [];
  for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = addMonthsYm(m, 1)) out.push(m);
  return out;
};
const reais = (cents: number) => Math.round(cents) / 100;

/**
 * Calcula o valor atual de um indicador automático no período da meta
 * (do início até o prazo, limitado a hoje). Valores financeiros somam os meses
 * do período pelas mesmas regras do módulo financeiro (sem contagem dupla).
 */
export async function computeAutoMetric(
  userId: string,
  goal: Pick<Goal, "workspaceId" | "autoMetric" | "startDate" | "dueDate">,
  tz: string,
): Promise<number | null> {
  const metric = autoMetric(goal.autoMetric);
  if (!metric || !goal.startDate || !goal.dueDate) return null;
  const today = todayYmd(tz);
  const from = dateToYmd(goal.startDate);
  const toRaw = dateToYmd(goal.dueDate);
  const to = toRaw < today ? toRaw : today;
  if (from > to) return 0;
  const workspace = await db.workspace.findUniqueOrThrow({ where: { id: goal.workspaceId } });
  const range = { gte: zonedToUtc(from, "00:00", tz), lt: zonedToUtc(addDaysYmd(to, 1), "00:00", tz) };
  const [fm, tm] = [from.slice(0, 7), to.slice(0, 7)];

  switch (metric.value) {
    case "mentoria.revenue":
    case "mentoria.profit":
    case "mentoria.sales": {
      await requireWorkspaceAccess(userId, workspace.id, { module: "finance" });
      const months = await mentoriaMonthly(workspace.id, fm, tm);
      if (metric.value === "mentoria.sales") return months.reduce((a, m) => a + m.salesCount, 0);
      return reais(months.reduce((a, m) => a + (metric.value === "mentoria.revenue" ? m.revenueCents : m.profitCents), 0));
    }
    case "pessoal.result":
    case "pessoal.expenses": {
      await requireWorkspaceAccess(userId, workspace.id, { module: "finance" });
      const months = await personalMonthly(userId, workspace, fm, tm);
      return reais(months.reduce((a, m) => a + (metric.value === "pessoal.result" ? m.result : m.expenseTotal), 0));
    }
    case "pessoal.reserves": {
      await requireWorkspaceAccess(userId, workspace.id, { module: "finance" });
      const accounts = await db.financialAccount.findMany({ where: { workspaceId: workspace.id, type: { in: RESERVE_TYPES } }, select: { id: true } });
      const bal = await balancesFor(accounts.map((a) => a.id), to);
      return reais([...bal.values()].reduce((a, v) => a + v, 0));
    }
    case "turbo.compensation": {
      await requireWorkspaceAccess(userId, workspace.id, { module: "finance" });
      const recs = await db.compensationRecord.findMany({
        where: { workspaceId: workspace.id, deletedAt: null, status: "RECEIVED", referenceMonth: { gte: ymdToDate(`${fm}-01`), lte: ymdToDate(`${tm}-01`) } },
        select: { receivedCents: true },
      });
      return reais(recs.reduce((a, r) => a + (r.receivedCents ?? 0), 0));
    }
    case "crm.newLeads":
    case "crm.conversion": {
      const m = await crmMetrics(userId, workspace.id, { from, to }, tz);
      return metric.value === "crm.newLeads" ? m.newLeads : m.conversionRate;
    }
    case "content.published": {
      await requireWorkspaceAccess(userId, workspace.id, { module: "content" });
      return db.contentItem.count({ where: { workspaceId: workspace.id, deletedAt: null, status: { isPublished: true }, publishedAt: range } });
    }
    case "tasks.done": {
      await requireWorkspaceAccess(userId, workspace.id, { module: "tasks" });
      return db.task.count({ where: { workspaceId: workspace.id, deletedAt: null, isTemplate: false, completedAt: range } });
    }
    case "habits.rate": {
      const habits = await listHabits(userId, { workspaceId: workspace.id, from, to }, tz);
      const totals = habits.reduce((a, h) => ({ expected: a.expected + h.stats.expected, done: a.done + h.stats.done }), { expected: 0, done: 0 });
      return totals.expected ? Math.round((totals.done / totals.expected) * 1000) / 10 : null;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Leitura
// ═══════════════════════════════════════════════════════════════

type GoalWithSteps = Goal & { steps: GoalStep[]; workspace: Pick<Workspace, "id" | "name" | "color" | "kind"> };

export type GoalView = {
  id: string;
  workspace: { id: string; name: string; color: string; kind: string };
  type: string;
  title: string;
  description: string | null;
  category: string | null;
  measure: string;
  direction: string;
  indicator: string | null;
  unit: string | null;
  startValue: number | null;
  targetValue: number | null;
  currentValue: number | null;
  autoMetric: string | null;
  horizon: string;
  startDate: string | null;
  dueDate: string | null;
  owner: string | null;
  status: string;
  notes: string | null;
  isObjective: boolean;
  steps: { id: string; title: string; done: boolean; dueDate: string | null }[];
  autoError: string | null;
} & GoalProgressView;

const num = (d: Prisma.Decimal | null) => (d === null ? null : Number(d));

async function toView(userId: string, g: GoalWithSteps, tz: string, today: string): Promise<GoalView> {
  let current = num(g.currentValue);
  let autoError: string | null = null;
  if (g.autoMetric) {
    try {
      current = await computeAutoMetric(userId, g, tz);
    } catch {
      autoError = "Sem permissão para ler os dados deste indicador.";
      current = null;
    }
  }
  const startDate = g.startDate ? dateToYmd(g.startDate) : null;
  const dueDate = g.dueDate ? dateToYmd(g.dueDate) : null;
  const progress = computeGoalProgress(
    { measure: g.measure, direction: g.direction, startValue: num(g.startValue), targetValue: num(g.targetValue), currentValue: current, startDate, dueDate, stepsTotal: g.steps.length, stepsDone: g.steps.filter((s) => s.done).length },
    today,
  );
  return {
    id: g.id,
    workspace: g.workspace,
    type: g.type,
    title: g.title,
    description: g.description,
    category: g.category,
    measure: g.measure,
    direction: g.direction,
    indicator: g.indicator,
    unit: g.unit,
    startValue: num(g.startValue),
    targetValue: num(g.targetValue),
    currentValue: current,
    autoMetric: g.autoMetric,
    horizon: g.horizon,
    startDate,
    dueDate,
    owner: g.owner,
    status: g.status,
    notes: g.notes,
    isObjective: g.isObjective,
    steps: g.steps.map((s) => ({ id: s.id, title: s.title, done: s.done, dueDate: s.dueDate ? dateToYmd(s.dueDate) : null })),
    autoError,
    ...progress,
  };
}

const goalInclude = { steps: { orderBy: { position: "asc" as const } }, workspace: { select: { id: true, name: true, color: true, kind: true } } };

export async function listGoals(userId: string, filters: { workspace?: string | "all"; status?: string; type?: string; objectives?: boolean } = {}, tz: string) {
  const ids = await accessibleWorkspaceIds(userId, "goals", filters.workspace ?? "all");
  const where: Prisma.GoalWhereInput = { workspaceId: { in: ids }, deletedAt: null, isObjective: filters.objectives ?? false };
  if (filters.status && filters.status !== "all") where.status = filters.status as Goal["status"];
  if (filters.type) where.type = filters.type as Goal["type"];
  const goals = await db.goal.findMany({ where, include: goalInclude, orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "asc" }] });
  const today = todayYmd(tz);
  const views = await Promise.all(goals.map((g) => toView(userId, g, tz, today)));
  // Registra uma leitura por dia dos indicadores automáticos (histórico real)
  await Promise.all(views.filter((v) => v.autoMetric && v.currentValue !== null && v.status === "ACTIVE").map((v) => recordDailyProgress(v.id, today, v.currentValue!)));
  return views;
}

async function recordDailyProgress(goalId: string, today: string, value: number) {
  const date = ymdToDate(today);
  const existing = await db.goalProgress.findFirst({ where: { goalId, date, note: "auto" } });
  if (existing) {
    if (Number(existing.value) !== value) await db.goalProgress.update({ where: { id: existing.id }, data: { value } });
  } else {
    await db.goalProgress.create({ data: { goalId, date, value, note: "auto" } });
  }
}

export async function getGoal(userId: string, goalId: string, tz: string) {
  const g = await db.goal.findFirst({ where: { id: goalId, deletedAt: null }, include: goalInclude });
  if (!g) throw new NotFoundError("Meta");
  await access(userId, g.workspaceId);
  const today = todayYmd(tz);
  const view = await toView(userId, g, tz, today);
  if (view.autoMetric && view.currentValue !== null && view.status === "ACTIVE") await recordDailyProgress(g.id, today, view.currentValue);
  const history = await db.goalProgress.findMany({ where: { goalId }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] });
  return { ...view, history: history.map((h) => ({ id: h.id, date: dateToYmd(h.date), value: Number(h.value), note: h.note === "auto" ? null : h.note, auto: h.note === "auto" })) };
}

export type GoalDetail = Awaited<ReturnType<typeof getGoal>>;

// ═══════════════════════════════════════════════════════════════
// Escrita
// ═══════════════════════════════════════════════════════════════

export async function createGoal(userId: string, input: GoalInput) {
  const data = goalSchema.parse(input);
  const member = await access(userId, data.workspaceId, true);
  await assertMetricFits(member.workspace, data.autoMetric);
  const goal = await db.goal.create({
    data: {
      workspaceId: data.workspaceId,
      ...goalData(data),
      currentValue: data.measure === "QUANTITATIVE" && !data.autoMetric ? data.currentValue ?? data.startValue ?? null : null,
      steps: data.steps?.length ? { create: data.steps.map((title, position) => ({ title, position })) } : undefined,
    },
  });
  // Valor atual informado na criação (diferente do inicial) entra no histórico, na data de início
  if (!data.autoMetric && data.currentValue != null && data.currentValue !== data.startValue) {
    await db.goalProgress.create({ data: { goalId: goal.id, date: ymdToDate(data.startDate ?? todayYmd()), value: data.currentValue, note: "Valor ao criar a meta" } });
  }
  await audit({ userId, workspaceId: data.workspaceId, entity: "Goal", entityId: goal.id, action: "create" });
  return goal;
}

async function loadForWrite(userId: string, goalId: string) {
  const g = await db.goal.findFirst({ where: { id: goalId, deletedAt: null }, include: { workspace: true } });
  if (!g) throw new NotFoundError("Meta");
  await access(userId, g.workspaceId, true);
  return g;
}

export async function updateGoal(userId: string, goalId: string, input: Omit<GoalInput, "workspaceId" | "steps">) {
  const before = await loadForWrite(userId, goalId);
  const data = goalSchema.parse({ ...input, workspaceId: before.workspaceId });
  await assertMetricFits(before.workspace, data.autoMetric);
  const fields = goalData(data);
  return db.goal.update({ where: { id: goalId }, data: { ...fields, ...(fields.autoMetric ? { currentValue: null } : {}) } });
}

/** Registra um novo valor (metas sem cálculo automático); fica no histórico. */
export async function recordGoalValue(userId: string, goalId: string, input: { value: number; date: string; note?: string | null }) {
  const g = await loadForWrite(userId, goalId);
  if (g.autoMetric) throw new AppError("Esta meta é calculada automaticamente com os dados do app.");
  if (g.measure !== "QUANTITATIVE") throw new AppError("Metas qualitativas avançam pelas etapas.");
  const data = z.object({ value: z.number().min(-1e15).max(1e15), date: ymd, note: z.string().trim().max(300).nullable().optional() }).parse(input);
  return db.$transaction(async (tx) => {
    await tx.goalProgress.create({ data: { goalId, date: ymdToDate(data.date), value: data.value, note: data.note || null } });
    // O valor atual é sempre o registro mais recente pela data
    const latest = await tx.goalProgress.findFirst({ where: { goalId }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] });
    return tx.goal.update({ where: { id: goalId }, data: { currentValue: latest!.value } });
  });
}

export async function deleteGoalProgress(userId: string, progressId: string) {
  const p = await db.goalProgress.findUnique({ where: { id: progressId } });
  if (!p) throw new NotFoundError("Registro");
  const g = await loadForWrite(userId, p.goalId);
  await db.$transaction(async (tx) => {
    await tx.goalProgress.delete({ where: { id: progressId } });
    if (!g.autoMetric) {
      const latest = await tx.goalProgress.findFirst({ where: { goalId: g.id }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] });
      await tx.goal.update({ where: { id: g.id }, data: { currentValue: latest?.value ?? g.startValue ?? null } });
    }
  });
}

export async function setGoalStatus(userId: string, goalId: string, status: string) {
  const g = await loadForWrite(userId, goalId);
  const s = z.enum(["ACTIVE", "ACHIEVED", "MISSED", "PAUSED", "CANCELLED"]).parse(status);
  await audit({ userId, workspaceId: g.workspaceId, entity: "Goal", entityId: goalId, action: "status", before: { status: g.status }, after: { status: s } });
  return db.goal.update({ where: { id: goalId }, data: { status: s } });
}

export async function deleteGoal(userId: string, goalId: string) {
  const g = await loadForWrite(userId, goalId);
  await db.goal.update({ where: { id: goalId }, data: { deletedAt: new Date() } });
  await audit({ userId, workspaceId: g.workspaceId, entity: "Goal", entityId: goalId, action: "delete" });
}

// ─── Etapas ────────────────────────────────────────────────────

export async function addGoalStep(userId: string, goalId: string, input: { title: string; dueDate?: string | null }) {
  await loadForWrite(userId, goalId);
  const data = z.object({ title: z.string().trim().min(1, "Descreva a etapa.").max(300), dueDate: ymd.nullable().optional() }).parse(input);
  const last = await db.goalStep.findFirst({ where: { goalId }, orderBy: { position: "desc" } });
  return db.goalStep.create({ data: { goalId, title: data.title, dueDate: data.dueDate ? ymdToDate(data.dueDate) : null, position: (last?.position ?? -1) + 1 } });
}

export async function updateGoalStep(userId: string, stepId: string, input: { done?: boolean; title?: string }) {
  const s = await db.goalStep.findUnique({ where: { id: stepId } });
  if (!s) throw new NotFoundError("Etapa");
  await loadForWrite(userId, s.goalId);
  const data = z.object({ done: z.boolean().optional(), title: z.string().trim().min(1).max(300).optional() }).parse(input);
  return db.goalStep.update({ where: { id: stepId }, data });
}

export async function deleteGoalStep(userId: string, stepId: string) {
  const s = await db.goalStep.findUnique({ where: { id: stepId } });
  if (!s) throw new NotFoundError("Etapa");
  await loadForWrite(userId, s.goalId);
  await db.goalStep.delete({ where: { id: stepId } });
}
