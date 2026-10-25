import { describe, expect, it } from "vitest";
import { computeGoalProgress, elapsedPct, formatGoalValue, horizonDates, type GoalForProgress } from "./goals";

const base: GoalForProgress = { measure: "QUANTITATIVE", direction: "UP", startValue: null, targetValue: 100, currentValue: 0, startDate: "2026-10-01", dueDate: "2026-10-31", stepsTotal: 0, stepsDone: 0 };

describe("progresso de metas", () => {
  it("UP: proporcional ao alvo, com ritmo pelo tempo decorrido", () => {
    expect(computeGoalProgress({ ...base, currentValue: 50 }, "2026-10-15")).toMatchObject({ progress: 50, situation: "ON_TRACK" });
    expect(computeGoalProgress({ ...base, currentValue: 20 }, "2026-10-20")).toMatchObject({ progress: 20, situation: "BEHIND" });
    expect(computeGoalProgress({ ...base, currentValue: 130 }, "2026-10-10")).toMatchObject({ progress: 100, situation: "ACHIEVED" });
    expect(computeGoalProgress({ ...base, currentValue: 90 }, "2026-11-02").situation).toBe("ENDED_MISSED");
  });

  it("UP com valor inicial conta só o avanço", () => {
    expect(computeGoalProgress({ ...base, startValue: 1000, targetValue: 2000, currentValue: 1250 }, "2026-10-05").progress).toBe(25);
  });

  it("DOWN com valor inicial: reduzir de 80 para 70", () => {
    expect(computeGoalProgress({ ...base, direction: "DOWN", startValue: 80, targetValue: 70, currentValue: 75 }, "2026-10-16").progress).toBe(50);
  });

  it("DOWN sem valor inicial é limite: só é atingida no fim do período", () => {
    const g = { ...base, direction: "DOWN", targetValue: 2000 };
    expect(computeGoalProgress({ ...g, currentValue: 1500 }, "2026-10-20")).toMatchObject({ situation: "WITHIN_LIMIT", usedPct: 75 });
    expect(computeGoalProgress({ ...g, currentValue: 2500 }, "2026-10-20")).toMatchObject({ situation: "OVER_LIMIT", usedPct: 125 });
    expect(computeGoalProgress({ ...g, currentValue: 1800 }, "2026-11-01").situation).toBe("ACHIEVED");
    expect(computeGoalProgress({ ...g, currentValue: 2100 }, "2026-11-01").situation).toBe("ENDED_MISSED");
  });

  it("qualitativa usa as etapas; sem dados não inventa progresso", () => {
    expect(computeGoalProgress({ ...base, measure: "QUALITATIVE", stepsTotal: 4, stepsDone: 1 }, "2026-10-05").progress).toBe(25);
    expect(computeGoalProgress({ ...base, measure: "QUALITATIVE" }, "2026-10-05").situation).toBe("NO_DATA");
    expect(computeGoalProgress({ ...base, currentValue: null }, "2026-10-05").situation).toBe("NO_DATA");
  });

  it("tempo decorrido e horizontes", () => {
    expect(elapsedPct("2026-10-01", "2026-10-10", "2026-10-05")).toBe(50);
    expect(elapsedPct(null, "2026-10-10", "2026-10-05")).toBeNull();
    expect(horizonDates("MONTHLY", "2026-02-10")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(horizonDates("QUARTERLY", "2026-11-10")).toEqual({ start: "2026-10-01", end: "2026-12-31" });
    expect(horizonDates("YEARLY", "2026-11-10")).toEqual({ start: "2026-01-01", end: "2026-12-31" });
    expect(horizonDates("CUSTOM", "2026-11-10")).toBeNull();
  });

  it("formatação", () => {
    expect(formatGoalValue(1234.5, "BRL")).toMatch(/R\$\s1\.234,50/);
    expect(formatGoalValue(12.5, "PERCENT")).toBe("12,5%");
    expect(formatGoalValue(3, "kg")).toBe("3 kg");
    expect(formatGoalValue(null, "BRL")).toBe("—");
  });
});
