import { describe, expect, it } from "vitest";
import { appliesOn, checkKey, computeScheduleStats, durationLabel, itemActiveOn, periodOf } from "./routines";

// 2026-10-19 é segunda-feira; 2026-10-24 é sábado
const weekdays = [1, 2, 3, 4, 5];

describe("rotina do dia", () => {
  it("separa manhã, tarde e noite pelo horário", () => {
    expect(periodOf("06:00")).toBe("MANHA");
    expect(periodOf("11:59")).toBe("MANHA");
    expect(periodOf("12:00")).toBe("TARDE");
    expect(periodOf("17:59")).toBe("TARDE");
    expect(periodOf("18:00")).toBe("NOITE");
  });

  it("vale só nos dias da semana escolhidos", () => {
    expect(appliesOn({ daysOfWeek: weekdays }, "2026-10-19")).toBe(true);
    expect(appliesOn({ daysOfWeek: weekdays }, "2026-10-24")).toBe(false);
  });

  it("item vale a partir do dia em que entrou e até o dia em que saiu (exclusivo)", () => {
    const item = { id: "a", createdYmd: "2026-10-20", archivedYmd: "2026-10-23" };
    expect(itemActiveOn(item, "2026-10-19")).toBe(false);
    expect(itemActiveOn(item, "2026-10-20")).toBe(true);
    expect(itemActiveOn(item, "2026-10-22")).toBe(true);
    expect(itemActiveOn(item, "2026-10-23")).toBe(false);
  });

  it("percentual: dias anteriores contam inteiros; hoje só o que foi marcado", () => {
    const routine = {
      daysOfWeek: weekdays,
      items: [
        { id: "a", createdYmd: "2026-10-01", archivedYmd: null },
        { id: "b", createdYmd: "2026-10-01", archivedYmd: null },
      ],
    };
    // seg 19: a, b · ter 20: a · qua 21 (hoje): b
    const checks = new Set([checkKey("a", "2026-10-19"), checkKey("b", "2026-10-19"), checkKey("a", "2026-10-20"), checkKey("b", "2026-10-21")]);
    const s = computeScheduleStats([routine], checks, "2026-10-19", "2026-10-25", "2026-10-21");
    // Esperado: 2 (seg) + 2 (ter) + 1 marcado hoje = 5; feitos: 4
    expect(s).toEqual({ expected: 5, done: 4, rate: 80 });
  });

  it("não conta fim de semana numa rotina de dias úteis nem itens fora do período de vigência", () => {
    const routine = {
      daysOfWeek: weekdays,
      items: [
        { id: "novo", createdYmd: "2026-10-22", archivedYmd: null },
        { id: "antigo", createdYmd: "2026-10-01", archivedYmd: "2026-10-20" },
      ],
    };
    const checks = new Set([checkKey("antigo", "2026-10-19"), checkKey("novo", "2026-10-22"), checkKey("novo", "2026-10-24")]);
    const s = computeScheduleStats([routine], checks, "2026-10-19", "2026-10-25", "2026-10-26");
    // antigo: só seg 19 (feito) · novo: qui 22 (feito), sex 23 (não) · sábado 24 não conta
    expect(s).toEqual({ expected: 3, done: 2, rate: 67 });
  });

  it("sem nada esperado, percentual é nulo (não zero)", () => {
    const routine = { daysOfWeek: [6], items: [{ id: "a", createdYmd: "2026-10-01", archivedYmd: null }] };
    expect(computeScheduleStats([routine], new Set(), "2026-10-19", "2026-10-23", "2026-10-23").rate).toBeNull();
  });

  it("período inteiro no futuro não conta nada", () => {
    const routine = { daysOfWeek: weekdays, items: [{ id: "a", createdYmd: "2026-10-01", archivedYmd: null }] };
    expect(computeScheduleStats([routine], new Set(), "2026-11-02", "2026-11-06", "2026-10-26")).toEqual({ expected: 0, done: 0, rate: null });
  });
});

describe("duração de execução", () => {
  const t = (iso: string) => new Date(iso);
  it("formata minutos, horas e dias", () => {
    expect(durationLabel(t("2026-10-20T10:00:00Z"), t("2026-10-20T10:25:00Z"))).toBe("25 min");
    expect(durationLabel(t("2026-10-20T10:00:00Z"), t("2026-10-20T12:00:00Z"))).toBe("2 h");
    expect(durationLabel(t("2026-10-20T10:00:00Z"), t("2026-10-20T11:40:00Z"))).toBe("1 h 40 min");
    expect(durationLabel(t("2026-10-20T10:00:00Z"), t("2026-10-22T13:00:00Z"))).toBe("2 d 3 h");
  });
});
