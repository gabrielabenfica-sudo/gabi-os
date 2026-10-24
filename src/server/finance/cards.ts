import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { AppError, NotFoundError } from "@/server/errors";
import { dateToYmd, todayYmd, ymdToDate } from "@/lib/dates";
import { splitInstallments } from "@/lib/money";
import { installmentSlots, invoiceState, type InvoiceState } from "@/lib/finance/card-cycle";
import { assertAccount, assertCategory, auditFinance, cents, financeAccess, ymd, type Tx } from "./common";

export const cardSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(1, "Informe o nome do cartão.").max(60),
  institution: z.string().trim().max(60).nullable().optional(),
  limitCents: z.number().int().min(0).max(100_000_000_000),
  closingDay: z.number().int().min(1, "Dia inválido.").max(31, "Dia inválido."),
  dueDay: z.number().int().min(1, "Dia inválido.").max(31, "Dia inválido."),
  paymentAccountId: z.string().nullable().optional(),
});
export type CardInput = z.input<typeof cardSchema>;

export const purchaseSchema = z
  .object({
    cardId: z.string().min(1),
    description: z.string().trim().min(1, "Informe a descrição.").max(200),
    totalCents: z.number().int().refine((v) => v !== 0, "Informe o valor.").refine((v) => Math.abs(v) <= 100_000_000_000, "Valor alto demais."),
    installmentsCount: z.number().int().min(1).max(48),
    purchaseDate: ymd,
    categoryId: z.string().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => v.totalCents > 0 || v.installmentsCount === 1, { message: "Estornos/créditos são lançados em parcela única.", path: ["installmentsCount"] });
export type PurchaseInput = z.input<typeof purchaseSchema>;

// ═══════════════════════════════════════════════════════════════
// Cartões
// ═══════════════════════════════════════════════════════════════

async function loadCard(userId: string, cardId: string, write = false) {
  const card = await db.creditCard.findUnique({ where: { id: cardId } });
  if (!card) throw new NotFoundError("Cartão");
  await financeAccess(userId, card.workspaceId, write);
  return card;
}

export async function createCard(userId: string, input: CardInput) {
  const data = cardSchema.parse(input);
  await financeAccess(userId, data.workspaceId, true);
  await assertAccount(db, data.workspaceId, data.paymentAccountId);
  const card = await db.creditCard.create({ data: { ...data, institution: data.institution || null, paymentAccountId: data.paymentAccountId || null } });
  await auditFinance(db, { userId, workspaceId: data.workspaceId, entity: "CreditCard", entityId: card.id, action: "create", after: card });
  return card;
}

/** Alterar fechamento/vencimento vale para compras novas; faturas existentes mantêm suas datas. */
export async function updateCard(userId: string, cardId: string, input: Omit<CardInput, "workspaceId">) {
  const before = await loadCard(userId, cardId, true);
  const data = cardSchema.omit({ workspaceId: true }).parse(input);
  await assertAccount(db, before.workspaceId, data.paymentAccountId);
  const after = await db.creditCard.update({ where: { id: cardId }, data: { ...data, institution: data.institution || null, paymentAccountId: data.paymentAccountId || null } });
  await auditFinance(db, { userId, workspaceId: before.workspaceId, entity: "CreditCard", entityId: cardId, action: "update", before, after });
  return after;
}

export async function setCardArchived(userId: string, cardId: string, archived: boolean) {
  const card = await loadCard(userId, cardId, true);
  await db.creditCard.update({ where: { id: cardId }, data: { archived } });
  await auditFinance(db, { userId, workspaceId: card.workspaceId, entity: "CreditCard", entityId: cardId, action: archived ? "archive" : "unarchive" });
}

type InvoiceAgg = { id: string; cardId: string; referenceMonth: Date; closingDate: Date; dueDate: Date; totalCents: number; paidCents: number };

async function invoiceTotals(where: Prisma.CardInvoiceWhereInput): Promise<InvoiceAgg[]> {
  const invoices = await db.cardInvoice.findMany({ where, orderBy: { referenceMonth: "asc" }, select: { id: true, cardId: true, referenceMonth: true, closingDate: true, dueDate: true } });
  if (!invoices.length) return [];
  const ids = invoices.map((i) => i.id);
  const [inst, pays] = await Promise.all([
    db.installment.groupBy({ by: ["invoiceId"], where: { invoiceId: { in: ids }, purchase: { deletedAt: null } }, _sum: { amountCents: true } }),
    db.transfer.groupBy({ by: ["cardInvoiceId"], where: { cardInvoiceId: { in: ids }, deletedAt: null, status: "REALIZED" }, _sum: { amountCents: true } }),
  ]);
  const total = new Map(inst.map((i) => [i.invoiceId, i._sum.amountCents ?? 0]));
  const paid = new Map(pays.map((p) => [p.cardInvoiceId!, p._sum.amountCents ?? 0]));
  return invoices.map((i) => ({ ...i, totalCents: total.get(i.id) ?? 0, paidCents: paid.get(i.id) ?? 0 }));
}

export type InvoiceView = {
  id: string;
  referenceMonth: string;
  closingDate: string;
  dueDate: string;
  totalCents: number;
  paidCents: number;
  remainingCents: number;
  state: InvoiceState;
};

function toView(i: InvoiceAgg, today: string): InvoiceView {
  const v = { referenceMonth: dateToYmd(i.referenceMonth), closingDate: dateToYmd(i.closingDate), dueDate: dateToYmd(i.dueDate), totalCents: i.totalCents, paidCents: i.paidCents };
  return { id: i.id, ...v, remainingCents: Math.max(0, i.totalCents - i.paidCents), state: invoiceState(v, today) };
}

/** Cartões com limite usado/disponível e fatura atual. */
export async function listCards(userId: string, workspaceId: string, tz: string, opts: { includeArchived?: boolean } = {}) {
  await financeAccess(userId, workspaceId);
  const today = todayYmd(tz);
  const cards = await db.creditCard.findMany({
    where: { workspaceId, ...(opts.includeArchived ? {} : { archived: false }) },
    include: { paymentAccount: { select: { id: true, name: true } } },
    orderBy: [{ archived: "asc" }, { createdAt: "asc" }],
  });
  const all = await invoiceTotals({ cardId: { in: cards.map((c) => c.id) } });
  const byCard = new Map<string, InvoiceView[]>();
  for (const inv of all) byCard.set(inv.cardId, [...(byCard.get(inv.cardId) ?? []), toView(inv, today)]);
  return cards.map((c) => {
    const invoices = byCard.get(c.id) ?? [];
    // Limite usado: tudo que já foi comprado e ainda não foi pago (inclui parcelas futuras)
    const usedCents = Math.max(0, invoices.reduce((s, i) => s + i.totalCents - i.paidCents, 0));
    const current = invoices.find((i) => i.closingDate > today) ?? null;
    const nextDue = invoices.find((i) => i.remainingCents > 0 && i.state !== "OPEN") ?? null;
    return { ...c, usedCents, availableCents: c.limitCents - usedCents, currentInvoice: current, nextDueInvoice: nextDue, overdue: invoices.filter((i) => i.state === "OVERDUE") };
  });
}

export type CardSummary = Awaited<ReturnType<typeof listCards>>[number];

export async function listInvoices(userId: string, cardId: string, tz: string) {
  await loadCard(userId, cardId);
  const today = todayYmd(tz);
  return (await invoiceTotals({ cardId })).map((i) => toView(i, today));
}

export async function getInvoice(userId: string, invoiceId: string, tz: string) {
  const invoice = await db.cardInvoice.findUnique({ where: { id: invoiceId }, include: { card: true } });
  if (!invoice) throw new NotFoundError("Fatura");
  await financeAccess(userId, invoice.card.workspaceId);
  const [agg] = await invoiceTotals({ id: invoiceId });
  const [installments, payments] = await Promise.all([
    db.installment.findMany({
      where: { invoiceId, purchase: { deletedAt: null } },
      include: { purchase: { include: { category: { select: { id: true, name: true, color: true } } } } },
      orderBy: [{ purchase: { purchaseDate: "asc" } }, { purchase: { createdAt: "asc" } }],
    }),
    db.transfer.findMany({
      where: { cardInvoiceId: invoiceId, deletedAt: null },
      include: { fromAccount: { select: { id: true, name: true } } },
      orderBy: { date: "asc" },
    }),
  ]);
  return { ...toView(agg!, todayYmd(tz)), card: invoice.card, installments, payments };
}

// ═══════════════════════════════════════════════════════════════
// Compras e parcelas
// ═══════════════════════════════════════════════════════════════

/** Cria (ou reaproveita) as faturas e as parcelas de uma compra. */
async function writeInstallments(tx: Tx, card: { id: string; closingDay: number; dueDay: number }, purchaseId: string, input: { totalCents: number; installmentsCount: number; purchaseDate: string }) {
  const slots = installmentSlots(input.purchaseDate, input.installmentsCount, card.closingDay, card.dueDay);
  const sign = input.totalCents < 0 ? -1 : 1;
  const amounts = splitInstallments(Math.abs(input.totalCents), input.installmentsCount).map((a) => a * sign);
  for (const [i, slot] of slots.entries()) {
    const invoice = await tx.cardInvoice.upsert({
      where: { cardId_referenceMonth: { cardId: card.id, referenceMonth: ymdToDate(slot.referenceMonth) } },
      create: { cardId: card.id, referenceMonth: ymdToDate(slot.referenceMonth), closingDate: ymdToDate(slot.closingDate), dueDate: ymdToDate(slot.dueDate) },
      update: {},
    });
    await tx.installment.create({ data: { purchaseId, invoiceId: invoice.id, number: i + 1, amountCents: amounts[i]! } });
  }
}

/** Remove faturas que ficaram sem parcelas e sem pagamentos. */
async function pruneEmptyInvoices(tx: Tx, cardId: string) {
  const empty = await tx.cardInvoice.findMany({ where: { cardId, installments: { none: {} }, payments: { none: {} } }, select: { id: true } });
  if (empty.length) await tx.cardInvoice.deleteMany({ where: { id: { in: empty.map((e) => e.id) } } });
}

export async function createPurchase(userId: string, input: PurchaseInput) {
  const data = purchaseSchema.parse(input);
  const card = await loadCard(userId, data.cardId, true);
  if (card.archived) throw new AppError("Este cartão está arquivado.");
  await assertCategory(db, card.workspaceId, data.categoryId, "EXPENSE");
  return db.$transaction(async (tx) => {
    const purchase = await tx.cardPurchase.create({
      data: {
        cardId: card.id,
        description: data.description,
        totalCents: data.totalCents,
        installmentsCount: data.installmentsCount,
        purchaseDate: ymdToDate(data.purchaseDate),
        categoryId: data.categoryId ?? null,
        notes: data.notes || null,
      },
    });
    await writeInstallments(tx, card, purchase.id, data);
    await auditFinance(tx, { userId, workspaceId: card.workspaceId, entity: "CardPurchase", entityId: purchase.id, action: "create", after: purchase });
    return purchase;
  });
}

async function loadPurchase(userId: string, purchaseId: string) {
  const p = await db.cardPurchase.findFirst({ where: { id: purchaseId, deletedAt: null }, include: { card: true } });
  if (!p) throw new NotFoundError("Compra");
  await financeAccess(userId, p.card.workspaceId, true);
  return p;
}

/** Editar refaz as parcelas com os novos dados. */
export async function updatePurchase(userId: string, purchaseId: string, input: Omit<PurchaseInput, "cardId">) {
  const before = await loadPurchase(userId, purchaseId);
  const data = purchaseSchema.parse({ ...input, cardId: before.cardId });
  await assertCategory(db, before.card.workspaceId, data.categoryId, "EXPENSE");
  return db.$transaction(async (tx) => {
    await tx.installment.deleteMany({ where: { purchaseId } });
    const after = await tx.cardPurchase.update({
      where: { id: purchaseId },
      data: {
        description: data.description,
        totalCents: data.totalCents,
        installmentsCount: data.installmentsCount,
        purchaseDate: ymdToDate(data.purchaseDate),
        categoryId: data.categoryId ?? null,
        notes: data.notes || null,
      },
    });
    await writeInstallments(tx, before.card, purchaseId, data);
    await pruneEmptyInvoices(tx, before.cardId);
    await auditFinance(tx, { userId, workspaceId: before.card.workspaceId, entity: "CardPurchase", entityId: purchaseId, action: "update", before, after });
    return after;
  });
}

export async function deletePurchase(userId: string, purchaseId: string) {
  const before = await loadPurchase(userId, purchaseId);
  await db.$transaction(async (tx) => {
    await tx.installment.deleteMany({ where: { purchaseId } });
    await tx.cardPurchase.update({ where: { id: purchaseId }, data: { deletedAt: new Date() } });
    await pruneEmptyInvoices(tx, before.cardId);
    await auditFinance(tx, { userId, workspaceId: before.card.workspaceId, entity: "CardPurchase", entityId: purchaseId, action: "delete", before });
  });
}

// ═══════════════════════════════════════════════════════════════
// Pagamento da fatura (transferência: conta → cartão)
// ═══════════════════════════════════════════════════════════════

/**
 * Pagar a fatura NÃO cria despesa (as compras já são as despesas):
 * é uma transferência que tira o dinheiro da conta. Assim nada é contado duas vezes.
 */
export async function payInvoice(userId: string, invoiceId: string, input: { accountId: string; amountCents?: number; date: string }) {
  const invoice = await db.cardInvoice.findUnique({ where: { id: invoiceId }, include: { card: true } });
  if (!invoice) throw new NotFoundError("Fatura");
  await financeAccess(userId, invoice.card.workspaceId, true);
  const data = z.object({ accountId: z.string().min(1, "Escolha a conta."), amountCents: cents.optional(), date: ymd }).parse(input);
  const account = await assertAccount(db, invoice.card.workspaceId, data.accountId);
  if (account?.archived) throw new AppError("Esta conta está arquivada.");
  const [agg] = await invoiceTotals({ id: invoiceId });
  const remaining = agg!.totalCents - agg!.paidCents;
  const amount = data.amountCents ?? remaining;
  if (amount <= 0) throw new AppError("Esta fatura não tem saldo a pagar.");
  const transfer = await db.transfer.create({
    data: {
      kind: "CARD_PAYMENT",
      fromWorkspaceId: invoice.card.workspaceId,
      toWorkspaceId: invoice.card.workspaceId,
      fromAccountId: data.accountId,
      toAccountId: null,
      cardInvoiceId: invoiceId,
      amountCents: amount,
      date: ymdToDate(data.date),
      description: `Pagamento da fatura ${invoice.card.name}`,
      status: "REALIZED",
    },
  });
  await auditFinance(db, { userId, workspaceId: invoice.card.workspaceId, entity: "Transfer", entityId: transfer.id, action: "pay_invoice", after: transfer });
  return transfer;
}

/** Compras do cartão (para busca e edição). */
export async function listPurchases(userId: string, cardId: string, opts: { take?: number } = {}) {
  await loadCard(userId, cardId);
  return db.cardPurchase.findMany({
    where: { cardId, deletedAt: null },
    include: { category: { select: { id: true, name: true } } },
    orderBy: { purchaseDate: "desc" },
    take: opts.take ?? 200,
  });
}
