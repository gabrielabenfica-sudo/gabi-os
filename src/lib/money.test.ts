import { describe, expect, it } from "vitest";
import { formatBRL, parseBRLToCents, splitInstallments, sumCents } from "./money";

const nbsp = (s: string) => s.replace(/ /g, " ");

describe("formatBRL", () => {
  it("formata centavos no padrão brasileiro", () => {
    expect(nbsp(formatBRL(123456))).toBe("R$ 1.234,56");
    expect(nbsp(formatBRL(5))).toBe("R$ 0,05");
    expect(nbsp(formatBRL(100000000))).toBe("R$ 1.000.000,00");
    expect(nbsp(formatBRL(-2550))).toBe("-R$ 25,50");
  });
  it("rejeita valores não inteiros", () => {
    expect(() => formatBRL(10.5)).toThrow();
  });
});

describe("parseBRLToCents", () => {
  it.each([
    ["1.234,56", 123456],
    ["1234,56", 123456],
    ["1234.56", 123456],
    ["R$ 10", 1000],
    ["R$ 1.234", 123400],
    ["0,1", 10],
    ["-5,5", -550],
    ["1.000.000,00", 100000000],
  ])("%s → %d", (input, expected) => {
    expect(parseBRLToCents(input)).toBe(expected);
  });

  it.each(["", "abc", "1,234,5", "10,999"])("rejeita %s", (input) => {
    expect(parseBRLToCents(input)).toBeNull();
  });

  it("não sofre erro de ponto flutuante", () => {
    expect(parseBRLToCents("0,29")).toBe(29);
    expect(parseBRLToCents("1,15")).toBe(115);
  });
});

describe("splitInstallments", () => {
  it("soma exatamente o total e joga a sobra na primeira parcela", () => {
    const parts = splitInstallments(10000, 3);
    expect(parts).toEqual([3334, 3333, 3333]);
    expect(sumCents(parts)).toBe(10000);
  });
  it("parcela única", () => {
    expect(splitInstallments(999, 1)).toEqual([999]);
  });
  it("rejeita número de parcelas inválido", () => {
    expect(() => splitInstallments(1000, 0)).toThrow();
  });
});
