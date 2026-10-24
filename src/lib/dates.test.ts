import { describe, expect, it } from "vitest";
import { formatDateBR, formatDateTimeBR, greetingFor, isValidTimezone } from "./dates";

describe("datas", () => {
  // 2026-10-23 23:30 UTC = 20:30 em São Paulo (UTC-3)
  const instant = new Date("2026-10-23T23:30:00Z");

  it("formata no padrão brasileiro respeitando o fuso", () => {
    expect(formatDateBR(instant, "America/Sao_Paulo")).toBe("23/10/2026");
    expect(formatDateBR(instant, "Asia/Tokyo")).toBe("24/10/2026");
    expect(formatDateTimeBR(instant, "America/Sao_Paulo")).toBe("23/10/2026 às 20:30");
  });

  it("saudação conforme o horário local", () => {
    expect(greetingFor(instant, "America/Sao_Paulo")).toBe("Boa noite");
    expect(greetingFor(new Date("2026-10-23T12:00:00Z"), "America/Sao_Paulo")).toBe("Bom dia");
    expect(greetingFor(new Date("2026-10-23T17:00:00Z"), "America/Sao_Paulo")).toBe("Boa tarde");
  });

  it("valida fusos IANA", () => {
    expect(isValidTimezone("America/Sao_Paulo")).toBe(true);
    expect(isValidTimezone("Marte/Olympus")).toBe(false);
  });
});
