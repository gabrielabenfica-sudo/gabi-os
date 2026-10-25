/** Regras puras de metas (servidor e telas). */

export const GOAL_TYPES = [
  { value: "FINANCIAL", label: "Financeira" },
  { value: "PROFESSIONAL", label: "Profissional" },
  { value: "PERSONAL", label: "Pessoal" },
  { value: "COMMERCIAL", label: "Comercial" },
  { value: "CONTENT", label: "Conteúdo" },
  { value: "HABIT", label: "Hábitos" },
  { value: "DEVELOPMENT", label: "Desenvolvimento" },
] as const;
export const goalTypeLabel = (v: string) => GOAL_TYPES.find((t) => t.value === v)?.label ?? v;

export const GOAL_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Ativa",
  ACHIEVED: "Atingida",
  MISSED: "Não atingida",
  PAUSED: "Pausada",
  CANCELLED: "Cancelada",
};

export const GOAL_HORIZONS = [
  { value: "MONTHLY", label: "Mensal" },
  { value: "QUARTERLY", label: "Trimestral" },
  { value: "YEARLY", label: "Anual" },
  { value: "CUSTOM", label: "Personalizado" },
] as const;

export type GoalUnit = "BRL" | "COUNT" | "PERCENT";

/**
 * Indicadores calculados com dados reais. `kinds` restringe a quais ambientes o
 * indicador se aplica (vazio = qualquer). Valores monetários somam os meses do período.
 */
export const AUTO_METRICS = [
  { value: "mentoria.revenue", label: "Faturamento da Mentoria", unit: "BRL", kinds: ["MENTORIA"], direction: "UP" },
  { value: "mentoria.profit", label: "Lucro da Mentoria", unit: "BRL", kinds: ["MENTORIA"], direction: "UP" },
  { value: "mentoria.sales", label: "Número de vendas da Mentoria", unit: "COUNT", kinds: ["MENTORIA"], direction: "UP" },
  { value: "crm.newLeads", label: "Novos leads", unit: "COUNT", kinds: ["MENTORIA"], direction: "UP" },
  { value: "crm.conversion", label: "Taxa de conversão do funil", unit: "PERCENT", kinds: ["MENTORIA"], direction: "UP" },
  { value: "pessoal.result", label: "Resultado pessoal (receitas − despesas)", unit: "BRL", kinds: ["PESSOAL"], direction: "UP" },
  { value: "pessoal.expenses", label: "Despesas pessoais", unit: "BRL", kinds: ["PESSOAL"], direction: "DOWN" },
  { value: "pessoal.reserves", label: "Reservas (saldo atual)", unit: "BRL", kinds: ["PESSOAL"], direction: "UP" },
  { value: "turbo.compensation", label: "Remuneração TURBO recebida", unit: "BRL", kinds: ["TURBO"], direction: "UP" },
  { value: "content.published", label: "Conteúdos publicados", unit: "COUNT", kinds: [], direction: "UP" },
  { value: "tasks.done", label: "Tarefas concluídas", unit: "COUNT", kinds: [], direction: "UP" },
  { value: "habits.rate", label: "Realização dos hábitos", unit: "PERCENT", kinds: [], direction: "UP" },
] as const satisfies readonly { value: string; label: string; unit: GoalUnit; kinds: readonly string[]; direction: "UP" | "DOWN" }[];

export type AutoMetricKey = (typeof AUTO_METRICS)[number]["value"];
export const autoMetric = (v: string | null | undefined) => AUTO_METRICS.find((m) => m.value === v) ?? null;

export function formatGoalValue(value: number | null | undefined, unit: string | null | undefined): string {
  if (value == null) return "—";
  if (unit === "BRL") return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (unit === "PERCENT") return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  const num = value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return unit && unit !== "COUNT" ? `${num} ${unit}` : num;
}

export type GoalForProgress = {
  measure: string;
  direction: string;
  startValue: number | null;
  targetValue: number | null;
  currentValue: number | null;
  startDate: string | null;
  dueDate: string | null;
  stepsTotal: number;
  stepsDone: number;
};

export type GoalProgressView = {
  /** 0–100 */
  progress: number;
  /** Situação calculada (não altera o status salvo) */
  situation: "ACHIEVED" | "ON_TRACK" | "BEHIND" | "WITHIN_LIMIT" | "OVER_LIMIT" | "NO_DATA" | "ENDED_MISSED";
  /** % do período já decorrido (null se não há datas) */
  elapsedPct: number | null;
  /** Modo limite (direção DOWN sem valor inicial): quanto do limite já foi usado */
  usedPct: number | null;
};

const clamp = (v: number) => Math.max(0, Math.min(100, v));

export function elapsedPct(startDate: string | null, dueDate: string | null, today: string): number | null {
  if (!startDate || !dueDate) return null;
  const s = Date.parse(`${startDate}T00:00:00Z`);
  const e = Date.parse(`${dueDate}T00:00:00Z`) + 86_400_000;
  const t = Date.parse(`${today}T00:00:00Z`) + 86_400_000;
  if (e <= s) return null;
  return Math.round(clamp(((t - s) / (e - s)) * 100));
}

/**
 * Progresso de uma meta.
 * - Qualitativa: etapas concluídas ÷ etapas.
 * - Quantitativa, direção UP: (atual − inicial) ÷ (alvo − inicial).
 * - Direção DOWN com valor inicial (ex.: reduzir de 80 para 70): (inicial − atual) ÷ (inicial − alvo).
 * - Direção DOWN sem valor inicial é um LIMITE (ex.: gastar até R$ 2.000): fica "dentro do limite"
 *   enquanto atual ≤ alvo e só é "atingida" quando o período termina.
 */
export function computeGoalProgress(g: GoalForProgress, today: string): GoalProgressView {
  const elapsed = elapsedPct(g.startDate, g.dueDate, today);
  const ended = !!g.dueDate && today > g.dueDate;

  if (g.measure === "QUALITATIVE") {
    if (!g.stepsTotal) return { progress: 0, situation: "NO_DATA", elapsedPct: elapsed, usedPct: null };
    const progress = Math.round((g.stepsDone / g.stepsTotal) * 100);
    return { progress, situation: situationFor(progress, elapsed, ended), elapsedPct: elapsed, usedPct: null };
  }

  if (g.targetValue == null || g.currentValue == null) return { progress: 0, situation: "NO_DATA", elapsedPct: elapsed, usedPct: null };
  const target = g.targetValue;
  const current = g.currentValue;

  if (g.direction === "DOWN" && g.startValue == null) {
    const usedPct = target > 0 ? Math.round((current / target) * 1000) / 10 : current <= 0 ? 0 : 100;
    const within = current <= target;
    if (ended) return { progress: within ? 100 : 0, situation: within ? "ACHIEVED" : "ENDED_MISSED", elapsedPct: elapsed, usedPct };
    return { progress: within ? 100 : 0, situation: within ? "WITHIN_LIMIT" : "OVER_LIMIT", elapsedPct: elapsed, usedPct };
  }

  const start = g.startValue ?? 0;
  const span = g.direction === "DOWN" ? start - target : target - start;
  const done = g.direction === "DOWN" ? start - current : current - start;
  const progress = span <= 0 ? (done >= 0 ? 100 : 0) : Math.round(clamp((done / span) * 100));
  return { progress, situation: situationFor(progress, elapsed, ended), elapsedPct: elapsed, usedPct: null };
}

function situationFor(progress: number, elapsed: number | null, ended: boolean): GoalProgressView["situation"] {
  if (progress >= 100) return "ACHIEVED";
  if (ended) return "ENDED_MISSED";
  if (elapsed === null) return "ON_TRACK";
  // Tolerância de 5 pontos para não alarmar por pouco
  return progress + 5 >= elapsed ? "ON_TRACK" : "BEHIND";
}

export const SITUATION_LABEL: Record<GoalProgressView["situation"], string> = {
  ACHIEVED: "Atingida",
  ON_TRACK: "No ritmo",
  BEHIND: "Abaixo do ritmo",
  WITHIN_LIMIT: "Dentro do limite",
  OVER_LIMIT: "Acima do limite",
  NO_DATA: "Sem dados",
  ENDED_MISSED: "Prazo encerrado",
};

/** Datas padrão de um horizonte, a partir de hoje. */
export function horizonDates(horizon: string, today: string): { start: string; end: string } | null {
  const [y, m] = today.split("-").map(Number) as [number, number];
  const pad = (v: number) => String(v).padStart(2, "0");
  const last = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  if (horizon === "MONTHLY") return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(last(y, m))}` };
  if (horizon === "QUARTERLY") {
    const q0 = Math.floor((m - 1) / 3) * 3 + 1;
    return { start: `${y}-${pad(q0)}-01`, end: `${y}-${pad(q0 + 2)}-${pad(last(y, q0 + 2))}` };
  }
  if (horizon === "YEARLY") return { start: `${y}-01-01`, end: `${y}-12-31` };
  return null;
}
