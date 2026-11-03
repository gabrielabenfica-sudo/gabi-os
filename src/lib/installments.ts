import { addMonths, format, parseISO } from "date-fns";
import type { FinanceInstallment } from "./types";

export const INSTALLMENT_KINDS: Array<{ value: FinanceInstallment["kind"]; label: string }> = [
  { value: "CREDIT_CARD", label: "Cartão de crédito" },
  { value: "CHECK", label: "Cheque" },
  { value: "LOAN", label: "Empréstimo" },
  { value: "NOTE", label: "Notinha" },
];

export const KIND_LABEL: Record<string, string> = {
  CREDIT_CARD: "Cartão",
  CHECK: "Cheque",
  LOAN: "Empréstimo",
  NOTE: "Notinha",
};

export type InstallmentDue = {
  plan: FinanceInstallment;
  number: number;
  dueDate: string;
  amountCents: number;
  paid: boolean;
};

/** Splits the total across monthly installments, the last one absorbing the remainder. */
export function planDues(plan: FinanceInstallment): InstallmentDue[] {
  const count = Math.max(1, plan.installments || 1);
  const base = Math.floor(plan.total_cents / count);
  const remainder = plan.total_cents - base * count;
  const paid = new Set(plan.paid ?? []);

  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    const dueDate = format(addMonths(parseISO(plan.first_due_date), index), "yyyy-MM-dd");
    return {
      plan,
      number,
      dueDate,
      amountCents: index === count - 1 ? base + remainder : base,
      paid: paid.has(number),
    };
  });
}

export function duesForMonth(plans: FinanceInstallment[], monthISO: string) {
  return plans
    .flatMap((plan) => planDues(plan))
    .filter((due) => due.dueDate.startsWith(monthISO))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function planProgress(plan: FinanceInstallment) {
  const dues = planDues(plan);
  const paid = dues.filter((due) => due.paid).length;
  return { total: dues.length, paid };
}
