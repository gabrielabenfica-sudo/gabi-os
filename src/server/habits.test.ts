import { describe, expect, it } from "vitest";
import { computeHabitStats } from "./habits";

const TZ = "America/Sao_Paulo";
const created = new Date("2026-10-01T12:00:00Z");

describe("estatísticas de hábitos", () => {
  it("diário: dias anteriores não marcados reduzem o percentual; hoje pendente não penaliza", () => {
    const done = new Set(["2026-10-19", "2026-10-20", "2026-10-22"]);
    const s = computeHabitStats({ frequency: "DAILY", daysOfWeek: [], timesPerWeek: null, createdAt: created }, done, "2026-10-19", "2026-10-23", "2026-10-23", TZ);
    expect(s).toMatchObject({ expected: 4, done: 3, rate: 75 });
    // Sequência: hoje pendente, ontem (22) feito, 21 não → 1
    expect(s.streak).toBe(1);
  });

  it("personalizado: só conta os dias escolhidos", () => {
    // seg(1), qua(3), sex(5). Semana 2026-10-19 (seg) a 2026-10-23 (sex)
    const done = new Set(["2026-10-19", "2026-10-21"]);
    const s = computeHabitStats({ frequency: "CUSTOM", daysOfWeek: [1, 3, 5], timesPerWeek: null, createdAt: created }, done, "2026-10-19", "2026-10-25", "2026-10-25", TZ);
    expect(s).toMatchObject({ expected: 3, done: 2, rate: 67 });
  });

  it("semanal: cobra a meta só em semanas encerradas", () => {
    // Meta 3x/semana. Semana 12–18: 2 feitos. Semana 19–25 (em andamento): 1 feito.
    const done = new Set(["2026-10-13", "2026-10-15", "2026-10-20"]);
    const s = computeHabitStats({ frequency: "WEEKLY", daysOfWeek: [], timesPerWeek: 3, createdAt: created }, done, "2026-10-12", "2026-10-25", "2026-10-21", TZ);
    expect(s).toMatchObject({ expected: 4, done: 3, rate: 75 });
  });

  it("não conta dias antes da criação nem futuros", () => {
    const s = computeHabitStats({ frequency: "DAILY", daysOfWeek: [], timesPerWeek: null, createdAt: new Date("2026-10-22T12:00:00Z") }, new Set(["2026-10-22"]), "2026-10-01", "2026-10-31", "2026-10-23", TZ);
    expect(s).toMatchObject({ expected: 1, done: 1, rate: 100 });
  });

  it("sem nada esperado ainda, percentual é nulo (não zero)", () => {
    const s = computeHabitStats({ frequency: "DAILY", daysOfWeek: [], timesPerWeek: null, createdAt: new Date("2026-10-23T12:00:00Z") }, new Set(), "2026-10-23", "2026-10-23", "2026-10-23", TZ);
    expect(s.rate).toBeNull();
  });
});
