import { describe, expect, it } from "vitest";
import { compareFormats, engagementRate, interactions, latestMetric } from "./content";

describe("métricas de conteúdo", () => {
  it("engajamento usa alcance e, sem alcance, visualizações; sem base é null", () => {
    expect(interactions({ date: "2026-10-01", likes: 80, comments: 10, shares: 5, saves: 5 })).toBe(100);
    expect(engagementRate({ date: "2026-10-01", reach: 1000, likes: 80, comments: 10, shares: 5, saves: 5 })).toBe(10);
    expect(engagementRate({ date: "2026-10-01", views: 400, likes: 10 })).toBe(2.5);
    expect(engagementRate({ date: "2026-10-01", likes: 10 })).toBeNull();
  });

  it("última leitura vale", () => {
    const m = latestMetric([
      { date: "2026-10-02", reach: 200 },
      { date: "2026-10-05", reach: 500 },
      { date: "2026-10-03", reach: 300 },
    ]);
    expect(m?.reach).toBe(500);
    expect(latestMetric([])).toBeNull();
  });

  it("comparação de formatos ignora itens sem métricas nas médias", () => {
    const r = compareFormats([
      { format: "REELS", metric: { date: "2026-10-01", reach: 1000, likes: 100, followsGained: 3 } },
      { format: "REELS", metric: { date: "2026-10-01", reach: 2000, likes: 100 } },
      { format: "REELS", metric: null },
      { format: "CAROUSEL", metric: { date: "2026-10-01", reach: 500, saves: 75 } },
    ]);
    expect(r[0]).toMatchObject({ format: "CAROUSEL", count: 1, avgEngagement: 15 });
    expect(r[1]).toMatchObject({ format: "REELS", count: 3, withMetrics: 2, avgReach: 1500, avgEngagement: 7.5, followsGained: 3 });
  });
});
