import { describe, expect, it } from "vitest";
import { buildRRule, describeRRule, nextOccurrence, occurrencesBetween, parseRRule } from "./recurrence";

const TZ = "America/Sao_Paulo";

describe("recorrência", () => {
  it("monta e interpreta regras", () => {
    const rule = buildRRule({ freq: "WEEKLY", interval: 2, byWeekday: [3, 1] });
    expect(rule).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE");
    expect(parseRRule(rule)).toEqual({ freq: "WEEKLY", interval: 2, byWeekday: [1, 3], count: undefined, until: undefined });
    expect(parseRRule("lixo")).toBeNull();
  });

  it("descreve em português", () => {
    expect(describeRRule(null)).toBe("Não se repete");
    expect(describeRRule("FREQ=DAILY;INTERVAL=1")).toBe("Todo dia");
    expect(describeRRule("FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR")).toBe("Dias úteis");
    expect(describeRRule("FREQ=MONTHLY;INTERVAL=3;COUNT=4")).toBe("A cada 3 meses, 4 vezes");
  });

  it("mantém o horário local nas ocorrências semanais", () => {
    // Segunda, 2026-10-05 09:00 em São Paulo = 12:00Z
    const start = new Date("2026-10-05T12:00:00Z");
    const list = occurrencesBetween("FREQ=WEEKLY;INTERVAL=1", start, start, new Date("2026-10-26T23:59:00Z"), TZ);
    expect(list.map((d) => d.toISOString())).toEqual([
      "2026-10-05T12:00:00.000Z",
      "2026-10-12T12:00:00.000Z",
      "2026-10-19T12:00:00.000Z",
      "2026-10-26T12:00:00.000Z",
    ]);
  });

  it("respeita o horário de parede quando o fuso tem mudança de horário", () => {
    // Nova York muda para horário de inverno em 2026-11-01
    const start = new Date("2026-10-26T13:00:00Z"); // 09:00 EDT
    const next = nextOccurrence("FREQ=WEEKLY;INTERVAL=1", start, start, "America/New_York");
    expect(next?.toISOString()).toBe("2026-11-02T14:00:00.000Z"); // 09:00 EST
  });

  it("calcula a próxima ocorrência e respeita COUNT", () => {
    const start = new Date("2026-01-31T15:00:00Z");
    expect(nextOccurrence("FREQ=DAILY;INTERVAL=1;COUNT=2", start, start, TZ)?.toISOString()).toBe("2026-02-01T15:00:00.000Z");
    expect(nextOccurrence("FREQ=DAILY;INTERVAL=1;COUNT=2", start, new Date("2026-02-01T15:00:00Z"), TZ)).toBeNull();
  });
});
