/** Cálculos puros do MAAS (servidor e telas). */

export type MaasPoint = { id: string; date: string; scores: { key: string; name: string; score: number }[] };

const avg = (v: number[]) => (v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null);

/**
 * `assessments` em ordem cronológica. `labels` traz o nome atual de cada área
 * (para áreas renomeadas). Áreas que não aparecem numa avaliação ficam sem ponto
 * nessa data — nunca viram zero.
 */
export function maasStats(assessments: MaasPoint[], labels: Map<string, string> = new Map()) {
  const latest = assessments[assessments.length - 1] ?? null;
  const previous = assessments[assessments.length - 2] ?? null;
  const prevByKey = new Map(previous?.scores.map((s) => [s.key, s.score]) ?? []);
  const comparison = (latest?.scores ?? [])
    .map((s) => ({
      key: s.key,
      name: labels.get(s.key) ?? s.name,
      score: s.score,
      previous: prevByKey.get(s.key) ?? null,
      delta: prevByKey.has(s.key) ? s.score - prevByKey.get(s.key)! : null,
    }))
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name, "pt-BR"));

  const keys = new Map<string, string>();
  for (const a of assessments) for (const s of a.scores) keys.set(s.key, labels.get(s.key) ?? s.name);
  const series = [...keys.entries()].map(([key, name]) => ({
    key,
    name,
    points: assessments.flatMap((a) => {
      const s = a.scores.find((x) => x.key === key);
      return s ? [{ date: a.date, score: s.score }] : [];
    }),
  }));

  return {
    latest: latest ? { id: latest.id, date: latest.date, average: avg(latest.scores.map((s) => s.score)) } : null,
    previous: previous ? { id: previous.id, date: previous.date, average: avg(previous.scores.map((s) => s.score)) } : null,
    comparison,
    /** Áreas com nota mais baixa na última avaliação (foco sugerido pelos próprios dados) */
    lowest: comparison.slice(0, 3),
    averages: assessments.map((a) => ({ date: a.date, average: avg(a.scores.map((s) => s.score))! })),
    series,
  };
}
