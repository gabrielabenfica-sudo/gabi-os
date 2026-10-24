import { describe, expect, it } from "vitest";
import { installmentSlots, invoiceForPurchase, invoiceState } from "./card-cycle";
import { addMonthsYmd } from "@/lib/dates";
import { bonusForPercent, expectedBonus, achievementPercent } from "./bonus";

describe("ciclo do cartão", () => {
  // Fecha dia 3, vence dia 10
  it("compra antes do fechamento entra na fatura do mês", () => {
    expect(invoiceForPurchase("2026-10-02", 3, 10)).toEqual({ referenceMonth: "2026-10-01", closingDate: "2026-10-03", dueDate: "2026-10-10" });
  });
  it("compra no dia do fechamento ou depois vai para a próxima", () => {
    expect(invoiceForPurchase("2026-10-03", 3, 10).referenceMonth).toBe("2026-11-01");
    expect(invoiceForPurchase("2026-10-25", 3, 10)).toEqual({ referenceMonth: "2026-11-01", closingDate: "2026-11-03", dueDate: "2026-11-10" });
  });
  it("vencimento antes do fechamento cai no mês seguinte", () => {
    // Fecha dia 25, vence dia 5
    expect(invoiceForPurchase("2026-10-10", 25, 5)).toEqual({ referenceMonth: "2026-11-01", closingDate: "2026-10-25", dueDate: "2026-11-05" });
    expect(invoiceForPurchase("2026-10-26", 25, 5)).toEqual({ referenceMonth: "2026-12-01", closingDate: "2026-11-25", dueDate: "2026-12-05" });
  });
  it("ajusta dias inexistentes (fechamento 31 em fevereiro)", () => {
    expect(invoiceForPurchase("2027-02-15", 31, 8)).toEqual({ referenceMonth: "2027-03-01", closingDate: "2027-02-28", dueDate: "2027-03-08" });
  });
  it("distribui parcelas em faturas consecutivas, inclusive na virada do ano", () => {
    const slots = installmentSlots("2026-11-20", 4, 3, 10);
    expect(slots.map((s) => s.referenceMonth)).toEqual(["2026-12-01", "2027-01-01", "2027-02-01", "2027-03-01"]);
    expect(slots[1]).toEqual({ referenceMonth: "2027-01-01", closingDate: "2027-01-03", dueDate: "2027-01-10" });
  });
  it("situação da fatura", () => {
    const inv = { totalCents: 1000, paidCents: 0, closingDate: "2026-11-03", dueDate: "2026-11-10" };
    expect(invoiceState(inv, "2026-11-01")).toBe("OPEN");
    expect(invoiceState(inv, "2026-11-05")).toBe("CLOSED");
    expect(invoiceState(inv, "2026-11-11")).toBe("OVERDUE");
    expect(invoiceState({ ...inv, paidCents: 400 }, "2026-11-05")).toBe("PARTIAL");
    expect(invoiceState({ ...inv, paidCents: 1000 }, "2026-11-20")).toBe("PAID");
  });
  it("soma meses ajustando o fim do mês", () => {
    expect(addMonthsYmd("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsYmd("2026-12-15", 2)).toBe("2027-02-15");
    expect(addMonthsYmd("2026-03-31", -1)).toBe("2026-02-28");
  });
});

describe("bonificação", () => {
  const tiers = [{ minPercent: 100, amountCents: 100000 }, { minPercent: 80, amountCents: 50000 }];
  it("aplica a maior faixa atingida", () => {
    expect(bonusForPercent(tiers, 79.9)).toBe(0);
    expect(bonusForPercent(tiers, 80)).toBe(50000);
    expect(bonusForPercent(tiers, 120)).toBe(100000);
  });
  it("calcula o percentual e respeita valor manual", () => {
    expect(achievementPercent(50, 46)).toBe(92);
    expect(achievementPercent(0, 10)).toBeNull();
    expect(expectedBonus({ tiers, targetValue: 50, achievedValue: 46, manualCents: null })).toEqual({ percent: 92, cents: 50000, source: "tiers" });
    expect(expectedBonus({ tiers, targetValue: 50, achievedValue: 46, manualCents: 70000 })).toMatchObject({ cents: 70000, source: "manual" });
    expect(expectedBonus({ tiers: [], targetValue: null, achievedValue: null, manualCents: null })).toEqual({ percent: null, cents: 0, source: "none" });
  });
});
