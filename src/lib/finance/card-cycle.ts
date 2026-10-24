import { addMonthsYm, dayOfMonthYmd, ymOf } from "@/lib/dates";

export type InvoiceSlot = {
  /** Primeiro dia do mês de vencimento ("YYYY-MM-01"): identifica a fatura */
  referenceMonth: string;
  closingDate: string;
  dueDate: string;
};

/**
 * Fatura de um mês de fechamento: fecha no dia `closingDay` do mês e vence no
 * dia `dueDay` do mesmo mês (se o vencimento for depois do fechamento) ou do
 * mês seguinte.
 */
export function invoiceForClosingMonth(closingYm: string, closingDay: number, dueDay: number): InvoiceSlot {
  const closingDate = dayOfMonthYmd(closingYm, closingDay);
  const dueYm = dueDay > closingDay ? closingYm : addMonthsYm(closingYm, 1);
  return { referenceMonth: `${dueYm}-01`, closingDate, dueDate: dayOfMonthYmd(dueYm, dueDay) };
}

/**
 * Em qual fatura cai uma compra. Compras feitas no dia do fechamento ou depois
 * entram na fatura seguinte (o dia do fechamento é o "melhor dia de compra").
 */
export function invoiceForPurchase(purchaseDate: string, closingDay: number, dueDay: number): InvoiceSlot {
  const ym = ymOf(purchaseDate);
  const thisMonth = invoiceForClosingMonth(ym, closingDay, dueDay);
  return purchaseDate < thisMonth.closingDate ? thisMonth : invoiceForClosingMonth(addMonthsYm(ym, 1), closingDay, dueDay);
}

/** Faturas de cada parcela: a 1ª pela data da compra, as seguintes nos meses subsequentes. */
export function installmentSlots(purchaseDate: string, count: number, closingDay: number, dueDay: number): InvoiceSlot[] {
  const first = invoiceForPurchase(purchaseDate, closingDay, dueDay);
  const firstClosingYm = ymOf(first.closingDate);
  return Array.from({ length: count }, (_, i) => invoiceForClosingMonth(addMonthsYm(firstClosingYm, i), closingDay, dueDay));
}

export type InvoiceState = "OPEN" | "CLOSED" | "OVERDUE" | "PARTIAL" | "PAID" | "EMPTY";

/** Situação da fatura calculada a partir do total, do que foi pago e das datas. */
export function invoiceState(inv: { totalCents: number; paidCents: number; closingDate: string; dueDate: string }, today: string): InvoiceState {
  if (inv.totalCents <= 0 && inv.paidCents === 0) return "EMPTY";
  if (inv.paidCents >= inv.totalCents && inv.totalCents > 0) return "PAID";
  if (today < inv.closingDate) return "OPEN";
  if (inv.paidCents > 0) return today > inv.dueDate ? "OVERDUE" : "PARTIAL";
  return today > inv.dueDate ? "OVERDUE" : "CLOSED";
}

export const INVOICE_STATE_LABEL: Record<InvoiceState, string> = {
  OPEN: "Aberta",
  CLOSED: "Fechada",
  OVERDUE: "Vencida",
  PARTIAL: "Paga parcialmente",
  PAID: "Paga",
  EMPTY: "Sem lançamentos",
};
