/** Regras puras de conteúdo (usadas no servidor e nas telas). */

export const CONTENT_FORMATS = [
  { value: "REELS", label: "Reels" },
  { value: "CAROUSEL", label: "Carrossel" },
  { value: "STATIC", label: "Post estático" },
  { value: "STORIES", label: "Stories" },
  { value: "LIVE", label: "Live" },
  { value: "VIDEO", label: "Vídeo longo" },
  { value: "OTHER", label: "Outro" },
] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number]["value"];

export const formatLabel = (v: string | null | undefined) => CONTENT_FORMATS.find((f) => f.value === v)?.label ?? (v || "Sem formato");

export const CONTENT_PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "youtube", label: "YouTube" },
  { value: "tiktok", label: "TikTok" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "other", label: "Outra" },
] as const;

export const platformLabel = (v: string | null | undefined) => CONTENT_PLATFORMS.find((p) => p.value === v)?.label ?? (v || "—");

export type MetricLike = {
  date: Date | string;
  reach?: number | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  followsGained?: number | null;
};

const n = (v: number | null | undefined) => v ?? 0;

/** Interações = curtidas + comentários + compartilhamentos + salvamentos. */
export function interactions(m: MetricLike): number {
  return n(m.likes) + n(m.comments) + n(m.shares) + n(m.saves);
}

/**
 * Taxa de engajamento em % = interações ÷ alcance (ou visualizações, se não houver alcance).
 * Sem base (nem alcance nem visualizações), devolve null — nunca inventa um número.
 */
export function engagementRate(m: MetricLike): number | null {
  const base = m.reach || m.views || 0;
  if (!base) return null;
  return Math.round((interactions(m) / base) * 10000) / 100;
}

/** Métrica mais recente (os números do Instagram são acumulados, então vale a última leitura). */
export function latestMetric<T extends MetricLike>(metrics: T[]): T | null {
  let best: T | null = null;
  for (const m of metrics) {
    if (!best || new Date(m.date).getTime() > new Date(best.date).getTime()) best = m;
  }
  return best;
}

export type FormatComparison = {
  format: string;
  label: string;
  count: number;
  withMetrics: number;
  avgReach: number | null;
  avgViews: number | null;
  avgInteractions: number | null;
  avgEngagement: number | null;
  followsGained: number;
};

/** Compara formatos usando só conteúdos que têm métricas registradas. */
export function compareFormats(items: { format: string | null; metric: MetricLike | null }[]): FormatComparison[] {
  const groups = new Map<string, { format: string | null; metric: MetricLike | null }[]>();
  for (const it of items) {
    const key = it.format || "OTHER";
    groups.set(key, [...(groups.get(key) ?? []), it]);
  }
  const avg = (vals: number[]) => (vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null);
  return [...groups.entries()]
    .map(([format, list]) => {
      const ms = list.map((i) => i.metric).filter((m): m is MetricLike => !!m);
      return {
        format,
        label: formatLabel(format),
        count: list.length,
        withMetrics: ms.length,
        avgReach: avg(ms.filter((m) => m.reach != null).map((m) => m.reach!)),
        avgViews: avg(ms.filter((m) => m.views != null).map((m) => m.views!)),
        avgInteractions: avg(ms.map(interactions)),
        avgEngagement: avg(ms.map(engagementRate).filter((v): v is number => v !== null)),
        followsGained: ms.reduce((a, m) => a + n(m.followsGained), 0),
      };
    })
    .sort((a, b) => (b.avgEngagement ?? -1) - (a.avgEngagement ?? -1) || b.count - a.count);
}
