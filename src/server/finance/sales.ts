import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { AppError, NotFoundError } from "@/server/errors";
import { addMonthsYmd, dateToYmd, todayYmd, ymdToDate } from "@/lib/dates";
import { splitInstallments } from "@/lib/money";
import { assertAccount, auditFinance, categoryByName, cents, financeAccess, ymd, type Tx } from "./common";

/**
 * Vendas da Mentoria.
 * - Faturamento = valor vendido, na data da venda (competência).
 * - Recebimento = dinheiro que entrou, quando cada parcela é paga.
 * Uma venda gera recebíveis (parcelas). Receber uma parcela cria UMA receita
 * realizada vinculada; essa receita nunca entra de novo no faturamento.
 */

async function assertMentoria(workspaceId: string) {
  const ws = await db.workspace.findUnique({ where: { id: workspaceId } });
  if (ws?.kind !== "MENTORIA") throw new AppError("Vendas pertencem ao ambiente Mentoria.");
}

// ─── Produtos / mentorias ──────────────────────────────────────

const programSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome.").max(120),
  description: z.string().max(2000).nullable().optional(),
  priceCents: z.number().int().min(0).max(100_000_000_000).nullable().optional(),
  durationWeeks: z.number().int().min(1).max(520).nullable().optional(),
  active: z.boolean().default(true),
});

export async function listPrograms(userId: string, workspaceId: string) {
  await financeAccess(userId, workspaceId);
  return db.mentorshipProgram.findMany({ where: { workspaceId }, orderBy: [{ active: "desc" }, { name: "asc" }] });
}

export async function createProgram(userId: string, workspaceId: string, input: z.input<typeof programSchema>) {
  await financeAccess(userId, workspaceId, true);
  await assertMentoria(workspaceId);
  const data = programSchema.parse(input);
  return db.mentorshipProgram.create({ data: { workspaceId, ...data, description: data.description || null } });
}

export async function updateProgram(userId: string, id: string, input: z.input<typeof programSchema>) {
  const p = await db.mentorshipProgram.findUnique({ where: { id } });
  if (!p) throw new NotFoundError("Produto");
  await financeAccess(userId, p.workspaceId, true);
  const data = programSchema.parse(input);
  return db.mentorshipProgram.update({ where: { id }, data: { ...data, description: data.description || null } });
}

// ─── Vendas ────────────────────────────────────────────────────

export const saleSchema = z
  .object({
    workspaceId: z.string().min(1),
    customerName: z.string().trim().min(1, "Informe o cliente.").max(120),
    programId: z.string().nullable().optional(),
    description: z.string().trim().min(1, "Informe o que foi vendido.").max(200),
    totalCents: cents,
    saleDate: ymd,
    paymentType: z.enum(["CASH", "INSTALLMENTS"]),
    installmentsCount: z.number().int().min(1).max(36),
    firstDueDate: ymd,
    commissionCents: z.number().int().min(0).max(100_000_000_000).default(0),
    /** À vista e já pago: registra o recebimento na hora */
    receivedNow: z.object({ accountId: z.string().min(1, "Escolha a conta."), date: ymd }).nullable().optional(),
    leadId: z.string().nullable().optional(),
    menteeId: z.string().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.paymentType === "CASH" && v.installmentsCount !== 1) ctx.addIssue({ code: "custom", message: "Venda à vista tem uma parcela.", path: ["installmentsCount"] });
    if (v.paymentType === "INSTALLMENTS" && v.installmentsCount < 2) ctx.addIssue({ code: "custom", message: "Parcelado precisa de 2 parcelas ou mais.", path: ["installmentsCount"] });
    if (v.commissionCents > v.totalCents) ctx.addIssue({ code: "custom", message: "A comissão não pode passar do valor da venda.", path: ["commissionCents"] });
  });
export type SaleInput = z.input<typeof saleSchema>;

function receivableRows(saleId: string, totalCents: number, count: number, firstDueDate: string): Prisma.ReceivableCreateManyInput[] {
  return splitInstallments(totalCents, count).map((amount, i) => ({
    saleId,
    number: i + 1,
    amountCents: amount,
    dueDate: ymdToDate(addMonthsYmd(firstDueDate, i)),
  }));
}

/** Comissão vira uma despesa prevista vinculada à venda (uma só). */
async function syncCommission(tx: Tx, sale: { id: string; workspaceId: string; description: string; customerName: string | null; commissionCents: number; saleDate: Date; status: string }) {
  const existing = await tx.financialTransaction.findFirst({ where: { saleId: sale.id, type: "EXPENSE", description: { startsWith: "Comissão ·" }, deletedAt: null } });
  if (sale.commissionCents <= 0 || sale.status === "CANCELLED") {
    if (existing && existing.status === "PLANNED") await tx.financialTransaction.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    return;
  }
  const category = await categoryByName(tx, sale.workspaceId, "EXPENSE", ["Comissões"]);
  const data = {
    description: `Comissão · ${sale.customerName ?? sale.description}`,
    amountCents: sale.commissionCents,
    competenceDate: sale.saleDate,
    categoryId: category?.id ?? null,
  };
  if (existing) {
    if (existing.status === "PLANNED") await tx.financialTransaction.update({ where: { id: existing.id }, data });
  } else {
    await tx.financialTransaction.create({
      data: { ...data, workspaceId: sale.workspaceId, type: "EXPENSE", status: "PLANNED", nature: "VARIABLE", saleId: sale.id },
    });
  }
}

export async function createSale(userId: string, input: SaleInput) {
  const data = saleSchema.parse(input);
  await financeAccess(userId, data.workspaceId, true);
  await assertMentoria(data.workspaceId);
  if (data.programId && !(await db.mentorshipProgram.findFirst({ where: { id: data.programId, workspaceId: data.workspaceId } }))) {
    throw new AppError("Produto inválido para este ambiente.");
  }
  if (data.receivedNow) await assertAccount(db, data.workspaceId, data.receivedNow.accountId);

  const sale = await db.$transaction(async (tx) => {
    const sale = await tx.sale.create({
      data: {
        workspaceId: data.workspaceId,
        customerName: data.customerName,
        programId: data.programId ?? null,
        leadId: data.leadId ?? null,
        menteeId: data.menteeId ?? null,
        description: data.description,
        totalCents: data.totalCents,
        saleDate: ymdToDate(data.saleDate),
        paymentType: data.paymentType,
        installmentsCount: data.installmentsCount,
        commissionCents: data.commissionCents,
        notes: data.notes || null,
      },
    });
    await tx.receivable.createMany({ data: receivableRows(sale.id, data.totalCents, data.installmentsCount, data.firstDueDate) });
    await syncCommission(tx, sale);
    await auditFinance(tx, { userId, workspaceId: data.workspaceId, entity: "Sale", entityId: sale.id, action: "create", after: sale });
    return sale;
  });
  if (data.receivedNow) {
    const first = await db.receivable.findFirstOrThrow({ where: { saleId: sale.id, number: 1 } });
    await receiveReceivable(userId, first.id, { accountId: data.receivedNow.accountId, date: data.receivedNow.date });
  }
  return sale;
}

async function loadSale(userId: string, id: string) {
  const sale = await db.sale.findFirst({ where: { id, deletedAt: null }, include: { receivables: { orderBy: { number: "asc" } } } });
  if (!sale) throw new NotFoundError("Venda");
  await financeAccess(userId, sale.workspaceId, true);
  return sale;
}

/** Valor e parcelas só podem mudar enquanto nenhuma parcela foi recebida. */
export async function updateSale(userId: string, id: string, input: Omit<SaleInput, "workspaceId" | "receivedNow">) {
  const before = await loadSale(userId, id);
  if (before.status === "CANCELLED") throw new AppError("Venda cancelada não pode ser editada.");
  const data = saleSchema.parse({ ...input, workspaceId: before.workspaceId });
  const anyReceived = before.receivables.some((r) => r.status === "RECEIVED");
  const scheduleChanged =
    data.totalCents !== before.totalCents ||
    data.installmentsCount !== before.installmentsCount ||
    data.firstDueDate !== dateToYmd(before.receivables[0]?.dueDate ?? before.saleDate);
  if (scheduleChanged && anyReceived) throw new AppError("Já há parcelas recebidas. Para mudar valor ou parcelas, desfaça os recebimentos primeiro.");
  if (data.programId && !(await db.mentorshipProgram.findFirst({ where: { id: data.programId, workspaceId: before.workspaceId } }))) {
    throw new AppError("Produto inválido para este ambiente.");
  }
  return db.$transaction(async (tx) => {
    const after = await tx.sale.update({
      where: { id },
      data: {
        customerName: data.customerName,
        programId: data.programId ?? null,
        description: data.description,
        totalCents: data.totalCents,
        saleDate: ymdToDate(data.saleDate),
        paymentType: data.paymentType,
        installmentsCount: data.installmentsCount,
        commissionCents: data.commissionCents,
        notes: data.notes || null,
      },
    });
    if (scheduleChanged) {
      await tx.receivable.deleteMany({ where: { saleId: id } });
      await tx.receivable.createMany({ data: receivableRows(id, data.totalCents, data.installmentsCount, data.firstDueDate) });
    }
    await syncCommission(tx, after);
    await auditFinance(tx, { userId, workspaceId: before.workspaceId, entity: "Sale", entityId: id, action: "update", before, after });
    return after;
  });
}

/** Cancelar: parcelas pendentes deixam de ser cobradas. O que já entrou continua registrado. */
export async function cancelSale(userId: string, id: string) {
  const before = await loadSale(userId, id);
  return db.$transaction(async (tx) => {
    await tx.receivable.updateMany({ where: { saleId: id, status: "PENDING" }, data: { status: "CANCELLED" } });
    const after = await tx.sale.update({ where: { id }, data: { status: "CANCELLED" } });
    await syncCommission(tx, after);
    await auditFinance(tx, { userId, workspaceId: before.workspaceId, entity: "Sale", entityId: id, action: "cancel", before, after });
    return after;
  });
}

/** Reembolso: despesa realizada (categoria Reembolsos) vinculada à venda. */
export async function refundSale(userId: string, id: string, input: { amountCents: number; accountId: string; date: string; cancelPending: boolean }) {
  const before = await loadSale(userId, id);
  const data = z.object({ amountCents: cents, accountId: z.string().min(1, "Escolha a conta."), date: ymd, cancelPending: z.boolean() }).parse(input);
  await assertAccount(db, before.workspaceId, data.accountId);
  const received = before.receivables.filter((r) => r.status === "RECEIVED").reduce((s, r) => s + (r.receivedCents ?? r.amountCents), 0);
  if (before.refundedCents + data.amountCents > received) throw new AppError("O reembolso não pode passar do valor já recebido.");
  return db.$transaction(async (tx) => {
    const category = await categoryByName(tx, before.workspaceId, "EXPENSE", ["Reembolsos"]);
    await tx.financialTransaction.create({
      data: {
        workspaceId: before.workspaceId,
        type: "EXPENSE",
        status: "REALIZED",
        description: `Reembolso · ${before.customerName ?? before.description}`,
        amountCents: data.amountCents,
        accountId: data.accountId,
        categoryId: category?.id ?? null,
        competenceDate: ymdToDate(data.date),
        paidAt: ymdToDate(data.date),
        nature: "ONE_OFF",
        saleId: id,
      },
    });
    if (data.cancelPending) await tx.receivable.updateMany({ where: { saleId: id, status: "PENDING" }, data: { status: "CANCELLED" } });
    const refunded = before.refundedCents + data.amountCents;
    const pendingLeft = data.cancelPending ? 0 : before.receivables.filter((r) => r.status === "PENDING").length;
    const after = await tx.sale.update({
      where: { id },
      data: { refundedCents: refunded, status: refunded >= received && pendingLeft === 0 ? "REFUNDED" : before.status },
    });
    await auditFinance(tx, { userId, workspaceId: before.workspaceId, entity: "Sale", entityId: id, action: "refund", before, after: { ...after, amount: data.amountCents } });
    return after;
  });
}

export async function deleteSale(userId: string, id: string) {
  const before = await loadSale(userId, id);
  if (before.receivables.some((r) => r.status === "RECEIVED")) throw new AppError("Esta venda tem parcelas recebidas. Cancele em vez de excluir.");
  await db.$transaction(async (tx) => {
    await tx.financialTransaction.updateMany({ where: { saleId: id, status: "PLANNED", deletedAt: null }, data: { deletedAt: new Date() } });
    await tx.sale.update({ where: { id }, data: { deletedAt: new Date() } });
    await auditFinance(tx, { userId, workspaceId: before.workspaceId, entity: "Sale", entityId: id, action: "delete", before });
  });
}

// ─── Recebíveis ────────────────────────────────────────────────

async function loadReceivable(userId: string, id: string) {
  const r = await db.receivable.findUnique({ where: { id }, include: { sale: true, transaction: true } });
  if (!r || r.sale.deletedAt) throw new NotFoundError("Parcela");
  await financeAccess(userId, r.sale.workspaceId, true);
  return r;
}

export async function receiveReceivable(userId: string, id: string, input: { accountId: string; date: string; amountCents?: number }) {
  const before = await loadReceivable(userId, id);
  if (before.status === "CANCELLED") throw new AppError("Esta parcela foi cancelada.");
  const data = z.object({ accountId: z.string().min(1, "Escolha a conta."), date: ymd, amountCents: cents.optional() }).parse(input);
  const account = await assertAccount(db, before.sale.workspaceId, data.accountId);
  if (account?.archived) throw new AppError("Esta conta está arquivada.");
  const amount = data.amountCents ?? before.amountCents;
  return db.$transaction(async (tx) => {
    const r = await tx.receivable.update({ where: { id }, data: { status: "RECEIVED", receivedAt: ymdToDate(data.date), receivedCents: amount, accountId: data.accountId } });
    const category = await categoryByName(tx, before.sale.workspaceId, "INCOME", ["Vendas de mentoria"]);
    const txData = {
      workspaceId: before.sale.workspaceId,
      type: "INCOME" as const,
      status: "REALIZED" as const,
      description: `${before.sale.customerName ?? before.sale.description} · parcela ${before.number}/${before.sale.installmentsCount}`,
      amountCents: amount,
      accountId: data.accountId,
      categoryId: category?.id ?? null,
      competenceDate: ymdToDate(data.date),
      paidAt: ymdToDate(data.date),
      nature: "ONE_OFF",
      saleId: before.saleId,
    };
    if (before.transaction) await tx.financialTransaction.update({ where: { id: before.transaction.id }, data: { ...txData, deletedAt: null } });
    else await tx.financialTransaction.create({ data: { ...txData, receivableId: id } });
    await auditFinance(tx, { userId, workspaceId: before.sale.workspaceId, entity: "Receivable", entityId: id, action: "receive", before, after: r });
    return r;
  });
}

export async function unreceiveReceivable(userId: string, id: string) {
  const before = await loadReceivable(userId, id);
  if (before.status !== "RECEIVED") return before;
  if (before.sale.refundedCents > 0) throw new AppError("A venda tem reembolso registrado. Ajuste o reembolso antes de desfazer recebimentos.");
  return db.$transaction(async (tx) => {
    if (before.transaction) await tx.financialTransaction.delete({ where: { id: before.transaction.id } });
    const r = await tx.receivable.update({ where: { id }, data: { status: "PENDING", receivedAt: null, receivedCents: null, accountId: null } });
    await auditFinance(tx, { userId, workspaceId: before.sale.workspaceId, entity: "Receivable", entityId: id, action: "unreceive", before, after: r });
    return r;
  });
}

// ─── Consultas ─────────────────────────────────────────────────

export async function listSales(userId: string, workspaceId: string, filters: { from?: string; to?: string; status?: string; search?: string } = {}, tz = "America/Sao_Paulo") {
  await financeAccess(userId, workspaceId);
  const where: Prisma.SaleWhereInput = { workspaceId, deletedAt: null };
  if (filters.from || filters.to) where.saleDate = { ...(filters.from ? { gte: ymdToDate(filters.from) } : {}), ...(filters.to ? { lte: ymdToDate(filters.to) } : {}) };
  if (filters.status && ["ACTIVE", "CANCELLED", "REFUNDED"].includes(filters.status)) where.status = filters.status as "ACTIVE";
  if (filters.search?.trim()) where.OR = [{ customerName: { contains: filters.search.trim(), mode: "insensitive" } }, { description: { contains: filters.search.trim(), mode: "insensitive" } }];
  const today = todayYmd(tz);
  const sales = await db.sale.findMany({
    where,
    include: { receivables: { orderBy: { number: "asc" }, include: { account: { select: { name: true } } } }, program: { select: { id: true, name: true } } },
    orderBy: { saleDate: "desc" },
    take: 500,
  });
  return sales.map((s) => {
    const received = s.receivables.filter((r) => r.status === "RECEIVED").reduce((t, r) => t + (r.receivedCents ?? 0), 0);
    const pending = s.receivables.filter((r) => r.status === "PENDING");
    const overdue = pending.filter((r) => dateToYmd(r.dueDate) < today);
    return {
      ...s,
      receivedCents: received,
      pendingCents: pending.reduce((t, r) => t + r.amountCents, 0),
      overdueCents: overdue.reduce((t, r) => t + r.amountCents, 0),
      overdueCount: overdue.length,
    };
  });
}

export type SaleRow = Awaited<ReturnType<typeof listSales>>[number];

/** Parcelas a receber (pendentes) e inadimplência. */
export async function receivablesOverview(workspaceIds: string[], today: string) {
  const pending = await db.receivable.findMany({
    where: { status: "PENDING", sale: { workspaceId: { in: workspaceIds }, deletedAt: null, status: { not: "CANCELLED" } } },
    include: { sale: { select: { id: true, customerName: true, description: true, installmentsCount: true } } },
    orderBy: { dueDate: "asc" },
  });
  const overdue = pending.filter((r) => dateToYmd(r.dueDate) < today);
  return {
    pending,
    pendingCents: pending.reduce((s, r) => s + r.amountCents, 0),
    overdue,
    overdueCents: overdue.reduce((s, r) => s + r.amountCents, 0),
  };
}
