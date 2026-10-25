import { describe, expect, it } from "vitest";
import { maasStats } from "./maas";

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
});
