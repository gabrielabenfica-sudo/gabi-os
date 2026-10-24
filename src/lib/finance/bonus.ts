/**
 * Bonificação por faixas de atingimento da meta.
 * Ex.: [{ minPercent: 80, amountCents: 50000 }, { minPercent: 100, amountCents: 100000 }]
 * Atingiu 92% → R$ 500,00. Abaixo de todas as faixas → R$ 0,00.
 */
export type BonusTier = { minPercent: number; amountCents: number };

export function achievementPercent(target: number | null | undefined, achieved: number | null | undefined): number | null {
  if (target === null || target === undefined || achieved === null || achieved === undefined) return null;
  if (target <= 0) return null;
  return Math.round((achieved / target) * 10000) / 100;
}

export function bonusForPercent(tiers: BonusTier[], percent: number | null): number {
  if (percent === null || !tiers.length) return 0;
  const sorted = [...tiers].sort((a, b) => a.minPercent - b.minPercent);
  let amount = 0;
  for (const t of sorted) if (percent >= t.minPercent) amount = t.amountCents;
  return amount;
}

/** Valor previsto: valor manual tem prioridade; senão calcula pelas faixas. */
export function expectedBonus(rule: { tiers: BonusTier[]; targetValue: number | null; achievedValue: number | null; manualCents: number | null }): {
  percent: number | null;
  cents: number;
  source: "manual" | "tiers" | "none";
} {
  const percent = achievementPercent(rule.targetValue, rule.achievedValue);
  if (rule.manualCents !== null && rule.manualCents !== undefined) return { percent, cents: rule.manualCents, source: "manual" };
  if (!rule.tiers.length) return { percent, cents: 0, source: "none" };
  return { percent, cents: bonusForPercent(rule.tiers, percent), source: "tiers" };
}

export function parseTiers(raw: unknown): BonusTier[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is BonusTier => typeof t === "object" && t !== null && Number.isFinite((t as BonusTier).minPercent) && Number.isSafeInteger((t as BonusTier).amountCents))
    .map((t) => ({ minPercent: t.minPercent, amountCents: t.amountCents }))
    .sort((a, b) => a.minPercent - b.minPercent);
}
