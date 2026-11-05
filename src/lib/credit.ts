import { addMonths, differenceInCalendarMonths, format, parseISO, startOfMonth } from "date-fns";
import type { CardEntry, Loan } from "./types";

/** "yyyy-MM-01" for any date. */
export const monthStart = (date: Date | string) =>
  format(startOfMonth(typeof date === "string" ? parseISO(date) : date), "yyyy-MM-dd");

const monthsBetween = (from: string, to: string) => differenceInCalendarMonths(parseISO(to), parseISO(from));

export type InvoiceLine = {
  entry: CardEntry;
  /** Installment number in this invoice (1-based); null for recurring charges. */
  number: number | null;
  amountCents: number;
};

/** Charges of one card entry that land in the invoice of `month` (yyyy-MM-01). */
export function entryLine(entry: CardEntry, month: string): InvoiceLine | null {
  const offset = monthsBetween(entry.first_invoice, month);
  if (offset < 0) return null;
  if (entry.kind === "RECURRING") {
    if (entry.end_invoice && monthsBetween(entry.end_invoice, month) > 0) return null;
    return { entry, number: null, amountCents: entry.amount_cents };
  }
  const number = offset + 1;
  if (number > Math.max(1, entry.installments)) return null;
  return { entry, number, amountCents: entry.amount_cents };
}

export function invoiceLines(entries: CardEntry[], month: string) {
  return entries
    .map((entry) => entryLine(entry, month))
    .filter((line): line is InvoiceLine => line !== null)
    .sort((a, b) => b.amountCents - a.amountCents);
}

export const sumLines = (lines: InvoiceLine[]) => lines.reduce((sum, line) => sum + line.amountCents, 0);

/** Last invoice month of an installment purchase. */
export const lastInvoice = (entry: CardEntry) =>
  format(addMonths(parseISO(entry.first_invoice), Math.max(1, entry.installments) - 1), "yyyy-MM-dd");

/**
 * What is still to come for an installment purchase counting from `month` (inclusive):
 * how many installments and how much money.
 */
export function remainingFrom(entry: CardEntry, month: string) {
  if (entry.kind !== "INSTALLMENT") return { count: 0, cents: 0 };
  const total = Math.max(1, entry.installments);
  const offset = monthsBetween(entry.first_invoice, month);
  const done = Math.min(total, Math.max(0, offset));
  const count = total - done;
  return { count, cents: count * entry.amount_cents };
}

/** Builds the first invoice month from "parcela X de Y na fatura de <month>". */
export function firstInvoiceFromCurrent(currentNumber: number, invoiceMonth: string) {
  return format(addMonths(parseISO(invoiceMonth), -(Math.max(1, currentNumber) - 1)), "yyyy-MM-dd");
}

/** Due date of one invoice given the card's due day (falls back to the 10th). */
export function invoiceDueDate(month: string, dueDay: number | null) {
  const base = parseISO(month);
  const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const day = Math.min(Math.max(1, dueDay ?? 10), lastDay);
  return format(new Date(base.getFullYear(), base.getMonth(), day), "yyyy-MM-dd");
}

/* ---------- Empréstimos ---------- */

export function loanDueDate(loan: Loan, number: number) {
  return format(addMonths(parseISO(loan.first_due_date), number - 1), "yyyy-MM-dd");
}

export function loanStatus(loan: Loan) {
  const total = Math.max(1, loan.installments_total);
  const paid = new Set((loan.paid ?? []).filter((n) => n >= 1 && n <= total));
  const paidCount = paid.size;
  const remainingCount = total - paidCount;
  const remainingCents = remainingCount * loan.installment_cents;
  const paidCents = paidCount * loan.installment_cents;
  let next: number | null = null;
  for (let n = 1; n <= total; n += 1) {
    if (!paid.has(n)) {
      next = n;
      break;
    }
  }
  return {
    total,
    paid,
    paidCount,
    remainingCount,
    remainingCents,
    paidCents,
    totalCents: total * loan.installment_cents,
    next,
    nextDue: next ? loanDueDate(loan, next) : null,
    endDate: loanDueDate(loan, total),
  };
}

/** The installment of a loan that falls in `month` (yyyy-MM), if any. */
export function loanDueInMonth(loan: Loan, monthKey: string) {
  const total = Math.max(1, loan.installments_total);
  for (let n = 1; n <= total; n += 1) {
    const date = loanDueDate(loan, n);
    if (date.startsWith(monthKey)) return { number: n, date, paid: (loan.paid ?? []).includes(n) };
  }
  return null;
}

/** Parses "1.234,56", "1234.56" or "1234" into cents. */
export function parseMoney(value: string) {
  const clean = value.trim().replace(/[R$\s]/g, "");
  if (!clean) return null;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) : null;
}

export const centsToInput = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? "" : (cents / 100).toFixed(2).replace(".", ",");
