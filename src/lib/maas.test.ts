import { describe, expect, it } from "vitest";
import { lifeWheelSummary, maasStats } from "./maas";

describe("MAAS", () => {
  it("compara com a avaliação anterior e ordena pelas notas mais baixas", () => {
    const r = maasStats(
      [
        { id: "a", date: "2026-09-01", scores: [{ key: "s", name: "Saúde", score: 5 }, { key: "f", name: "Finanças", score: 7 }] },
        { id: "b", date: "2026-10-01", scores: [{ key: "s", name: "Saúde", score: 8 }, { key: "f", name: "Finanças", score: 6 }, { key: "p", name: "Propósito", score: 9 }] },
      ],
      new Map([["s", "Saúde e energia"]]),
    );
    expect(r.latest).toEqual({ id: "b", date: "2026-10-01", average: 7.7 });
    expect(r.previous?.average).toBe(6);
    expect(r.comparison.map((c) => [c.name, c.delta])).toEqual([["Finanças", -1], ["Saúde e energia", 3], ["Propósito", null]]);
    expect(r.lowest[0]!.name).toBe("Finanças");
    expect(r.series.find((s) => s.key === "p")!.points).toEqual([{ date: "2026-10-01", score: 9 }]);
    expect(r.averages).toEqual([{ date: "2026-09-01", average: 6 }, { date: "2026-10-01", average: 7.7 }]);
  });

  it("sem avaliações não inventa números", () => {
    const r = maasStats([]);
    expect(r.latest).toBeNull();
    expect(r.comparison).toEqual([]);
  });

  it("resume a roda da vida para o Dashboard", () => {
    const d = (v: string) => new Date(`${v}T00:00:00Z`);
    expect(lifeWheelSummary([])).toBeNull();
    const r = lifeWheelSummary([
      { date: d("2026-11-01"), scores: [{ areaId: "s", areaName: "Saúde", score: 8 }, { areaId: "f", areaName: "Finanças", score: 4 }, { areaId: "p", areaName: "Propósito", score: 9 }, { areaId: "l", areaName: "Lazer", score: 4 }] },
      { date: d("2026-10-01"), scores: [{ areaId: "s", areaName: "Saúde", score: 5 }, { areaId: "f", areaName: "Finanças", score: 5 }] },
    ])!;
    expect(r.date).toBe("2026-11-01");
    expect(r.average).toBe(6.3);
    expect(r.delta).toBe(1.3);
    expect(r.areas).toBe(4);
    expect(r.lowest.map((a) => a.name)).toEqual(["Finanças", "Lazer", "Saúde"]);
    expect(lifeWheelSummary([{ date: d("2026-11-01"), scores: [{ areaId: "s", areaName: "Saúde", score: 7 }] }])!.delta).toBeNull();
  });
});
