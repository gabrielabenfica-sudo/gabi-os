import { describe, expect, it } from "vitest";
import { durationLabel, findOverlaps, routineKey, routineProgress, sortRoutine, toMinutes, weekdaysLabel } from "./routine";

const item = (id: string, startTime: string | null, endTime: string | null, done = false) => ({ id, startTime, endTime, title: id, done });

describe("rotina do dia", () => {
  it("converte horário em minutos", () => {
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("07:30")).toBe(450);
    expect(toMinutes("23:59")).toBe(1439);
  });

  it("ordena por horário e deixa os itens sem horário no fim, na ordem original", () => {
    const sorted = sortRoutine([item("livre1", null, null), item("almoco", "12:00", "13:00"), item("livre2", null, null), item("academia", "06:30", "07:30"), item("reuniao", "12:00", "12:30")]);
    expect(sorted.map((i) => i.id)).toEqual(["academia", "reuniao", "almoco", "livre1", "livre2"]);
  });

  it("detecta sobreposição, mas não blocos que só encostam", () => {
    const overlaps = findOverlaps([
      item("a", "08:00", "09:00"),
      item("b", "09:00", "10:00"), // encosta em a
      item("c", "09:30", "11:00"), // sobrepõe b
      item("d", "13:00", null), // sem fim: não entra
      item("e", "10:30", "10:45"), // dentro de c
    ]);
    expect([...overlaps].sort()).toEqual(["b", "c", "e"]);
  });

  it("calcula duração legível", () => {
    expect(durationLabel("08:00", "09:30")).toBe("1h30");
    expect(durationLabel("08:00", "10:00")).toBe("2h");
    expect(durationLabel("08:00", "08:45")).toBe("45 min");
    expect(durationLabel("09:00", "08:00")).toBeNull();
    expect(durationLabel("09:00", null)).toBeNull();
  });

  it("calcula progresso", () => {
    expect(routineProgress([])).toEqual({ done: 0, total: 0, percent: 0 });
    expect(routineProgress([item("a", null, null, true), item("b", null, null), item("c", null, null)])).toEqual({ done: 1, total: 3, percent: 33 });
  });

  it("gera a mesma chave para o mesmo bloco, ignorando maiúsculas e espaços", () => {
    expect(routineKey({ title: " Academia ", startTime: "06:30" })).toBe(routineKey({ title: "academia", startTime: "06:30" }));
    expect(routineKey({ title: "Academia", startTime: null })).not.toBe(routineKey({ title: "Academia", startTime: "06:30" }));
  });

  it("descreve os dias da semana", () => {
    expect(weekdaysLabel([0, 1, 2, 3, 4, 5, 6])).toBe("Todos os dias");
    expect(weekdaysLabel([5, 4, 3, 2, 1])).toBe("Seg a Sex");
    expect(weekdaysLabel([6, 0])).toBe("Fins de semana");
    expect(weekdaysLabel([1, 3])).toBe("Seg, Qua");
    expect(weekdaysLabel([])).toBe("Nenhum dia");
  });
});
