import { randomUUID } from "node:crypto";
import type { FinancialTransaction, Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { AppError, NotFoundError } from "@/server/errors";
import { addMonthsYmd, dateToYmd, todayYmd, ymdToDate } from "@/lib/dates";
import { splitInstallments } from "@/lib/money";
import { NATURES, NATURE_LABEL } from "@/lib/finance/labels";
import { assertAccount, assertCategory, auditFinance, cents, financeAccess, monthRange, ymd, ym } from "./common";

export { NATURES, NATURE_LABEL };

export const transactionCreateSchema = z
  .object({
    workspaceId: z.string().min(1),
    type: z.enum(["INCOME", "EXPENSE"]),
    description: z.string().trim().min(1, "Informe a descrição.").max(200),
    amountCents: cents,
    categoryId: z.string().nullable().optional(),
    accountId: z.string().nullable().optional(),
    competenceDate: ymd,
    dueDate: ymd.nullable().optional(),
    paid: z.boolean().default(false),
    paidAt: ymd.nullable().optional(),
    nature: z.enum(NATURES).default("ONE_OFF"),
    /** Repetir mensalmente (fixa/recorrente): total de meses, incluindo o primeiro */
    repeatMonths: z.number().int().min(2).max(60).nullable().optional(),
    /** Parcelar: o valor informado é o TOTAL, dividido em N parcelas mensais */
    installments: z.number().int().min(2).max(60).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.repeatMonths && v.installments) ctx.addIssue({ code: "custom", message: "Escolha repetir OU parcelar.", path: ["installments"] });
    if (v.paid && !v.accountId) ctx.addIssue({ code: "custom", message: "Escolha a conta em que o valor foi pago/recebido.", path: ["accountId"] });
  });
export type TransactionCreateInput = z.input<typeof transactionCreateSchema>;

export const transactionUpdateSchema = z.object({
  description: z.string().trim().min(1, "Informe a descrição.").max(200).optional(),
  amountCents: cents.optional(),
  categoryId: z.string().nullable().optional(),
  accountId: z.string().nullable().optional(),
  competenceDate: ymd.optional(),
  dueDate: ymd.nullable().optional(),
  nature: z.enum(NATURES).optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type TransactionUpdateInput = z.input<typeof transactionUpdateSchema>;

/** Rótulo exibido: "Aluguel" ou "Curso (3/10)". */
export function transactionLabel(t: Pick<FinancialTransaction, "description" | "seriesIndex" | "seriesTotal" | "nature">) {
  return t.nature === "INSTALLMENT" && t.seriesIndex && t.seriesTotal ? `${t.description} (${t.seriesIndex}/${t.seriesTotal})` : t.description;
}

/** Lançamentos gerados por outros módulos são editados na origem. */
function assertEditable(t: FinancialTransaction) {
  if (t.compensationRecordId) throw new AppError("Este lançamento vem da Remuneração TURBO. Edite por lá.");
  if (t.receivableId) throw new AppError("Este lançamento vem de uma venda da Mentoria. Edite pela venda.");
}

export async function createTransaction(userId: string, input: TransactionCreateInput, tz: string) {
  const data = transactionCreateSchema.parse(input);
  await financeAccess(userId, data.workspaceId, true);
  await assertCategory(db, data.workspaceId, data.categoryId, data.type);
  const account = await assertAccount(db, data.workspaceId, data.accountId);
  if (account?.archived) throw new AppError("Esta conta está arquivada.");

  const count = data.installments ?? data.repeatMonths ?? 1;
  const amounts = data.installments ? splitInstallments(data.amountCents, data.installments) : Array(count).fill(data.amountCents);
  const groupId = count > 1 ? randomUUID() : null;
  const nature = data.installments ? "INSTALLMENT" : data.repeatMonths && data.nature === "ONE_OFF" ? "RECURRING" : data.nature;
  const paidAt = data.paid ? data.paidAt ?? todayYmd(tz) : null;

  const rows: Prisma.FinancialTransactionCreateManyInput[] = amounts.map((amount: number, i: number) => ({
    workspaceId: data.workspaceId,
    type: data.type,
    description: data.description,
    amountCents: amount,
    categoryId: data.categoryId ?? null,
    accountId: data.accountId ?? null,
    competenceDate: ymdToDate(addMonthsYmd(data.competenceDate, i)),
    dueDate: data.dueDate ? ymdToDate(addMonthsYmd(data.dueDate, i)) : null,
    // Só o primeiro pode nascer pago; os demais ficam previstos
    status: i === 0 && data.paid ? "REALIZED" : "PLANNED",
    paidAt: i === 0 && paidAt ? ymdToDate(paidAt) : null,
    nature,
    recurrenceGroupId: groupId,
    seriesIndex: count > 1 ? i + 1 : null,
    seriesTotal: count > 1 ? count : null,
    notes: data.notes || null,
  }));

  const created = await db.$transaction(async (tx) => {
    let list: FinancialTransaction[];
    if (groupId) {
      await tx.financialTransaction.createMany({ data: rows });
      list = await tx.financialTransaction.findMany({ where: { recurrenceGroupId: groupId }, orderBy: { seriesIndex: "asc" } });
    } else {
      list = [await tx.financialTransaction.create({ data: rows[0]! as Prisma.FinancialTransactionUncheckedCreateInput })];
    }
    await auditFinance(tx, {
      userId,
      workspaceId: data.workspaceId,
      entity: "FinancialTransaction",
      entityId: list[0]!.id,
      action: count > 1 ? "create_series" : "create",
      after: { ...rows[0], count, totalCents: amounts.reduce((s: number, v: number) => s + v, 0) },
    });
    return list;
  });
  return created;
}

async function loadForWrite(userId: string, id: string) {
  const t = await db.financialTransaction.findFirst({ where: { id, deletedAt: null } });
  if (!t) throw new NotFoundError("Lançamento");
  await financeAccess(userId, t.workspaceId, true);
  return t;
}

/**
 * Edita um lançamento. Em séries, `scope: "following"` aplica a mesma alteração
 * (descrição, valor, categoria, conta, observações) a este e aos próximos ainda
 * não pagos. Datas só mudam no lançamento escolhido.
 */
export async function updateTransaction(userId: string, id: string, input: TransactionUpdateInput, scope: "one" | "following" = "one") {
  const before = await loadForWrite(userId, id);
  assertEditable(before);
  const data = transactionUpdateSchema.parse(input);
  await assertCategory(db, before.workspaceId, data.categoryId, before.type);
  await assertAccount(db, before.workspaceId, data.accountId);
  if (before.status === "REALIZED" && data.accountId === null) throw new AppError("Lançamento pago precisa de uma conta.");

  const shared: Prisma.FinancialTransactionUpdateManyMutationInput = {};
  if (data.description !== undefined) shared.description = data.description;
  if (data.amountCents !== undefined) shared.amountCents = data.amountCents;
  if (data.notes !== undefined) shared.notes = data.notes || null;
  if (data.nature !== undefined && before.nature !== "INSTALLMENT") shared.nature = data.nature;

  return db.$transaction(async (tx) => {
    const own: Prisma.FinancialTransactionUncheckedUpdateInput = { ...shared };
    if (data.categoryId !== undefined) own.categoryId = data.categoryId;
    if (data.accountId !== undefined) own.accountId = data.accountId;
    if (data.competenceDate !== undefined) own.competenceDate = ymdToDate(data.competenceDate);
    if (data.dueDate !== undefined) own.dueDate = data.dueDate ? ymdToDate(data.dueDate) : null;
    const after = await tx.financialTransaction.update({ where: { id }, data: own });

    let affected = 1;
    if (scope === "following" && before.recurrenceGroupId && before.seriesIndex) {
      const res = await tx.financialTransaction.updateMany({
        where: {
          recurrenceGroupId: before.recurrenceGroupId,
          seriesIndex: { gt: before.seriesIndex },
          status: "PLANNED",
          deletedAt: null,
        },
        data: {
          ...shared,
          ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
          ...(data.accountId !== undefined ? { accountId: data.accountId } : {}),
        },
      });
      affected += res.count;
    }
    await auditFinance(tx, { userId, workspaceId: before.workspaceId, entity: "FinancialTransaction", entityId: id, action: scope === "following" ? "update_following" : "update", before, after: { ...after, affected } });
    return { transaction: after, affected };
  });
}

/** Marca como pago/recebido (realizado) ou volta para previsto. */
export async function setTransactionPaid(userId: string, id: string, input: { paid: boolean; accountId?: string | null; paidAt?: string | null }, tz: string) {
  const before = await loadForWrite(userId, id);
  assertEditable(before);
  const data = z.object({ paid: z.boolean(), accountId: z.string().nullable().optional(), paidAt: ymd.nullable().optional() }).parse(input);
  let patch: Prisma.FinancialTransactionUncheckedUpdateInput;
  if (data.paid) {
    const accountId = data.accountId ?? before.accountId;
    if (!accountId) throw new AppError("Escolha a conta em que o valor foi pago/recebido.");
    const acc = await assertAccount(db, before.workspaceId, accountId);
    if (acc?.archived) throw new AppError("Esta conta está arquivada.");
    patch = { status: "REALIZED", accountId, paidAt: ymdToDate(data.paidAt ?? todayYmd(tz)) };
  } else {
    patch = { status: "PLANNED", paidAt: null, reconciled: false };
  }
  const after = await db.financialTransaction.update({ where: { id }, data: patch });
  await auditFinance(db, { userId, workspaceId: before.workspaceId, entity: "FinancialTransaction", entityId: id, action: data.paid ? "mark_paid" : "mark_unpaid", before, after });
  return after;
}

/** Exclusão lógica. Em séries, pode excluir este e os próximos não pagos. */
export async function deleteTransaction(userId: string, id: string, scope: "one" | "following" = "one") {
  const before = await loadForWrite(userId, id);
  assertEditable(before);
  const now = new Date();
  let count = 1;
  await db.$transaction(async (tx) => {
    await tx.financialTransaction.update({ where: { id }, data: { deletedAt: now } });
    if (scope === "following" && before.recurrenceGroupId && before.seriesIndex) {
      const res = await tx.financialTransaction.updateMany({
        where: { recurrenceGroupId: before.recurrenceGroupId, seriesIndex: { gt: before.seriesIndex }, status: "PLANNED", deletedAt: null },
        data: { deletedAt: now },
      });
      count += res.count;
    }
    await auditFinance(tx, { userId, workspaceId: before.workspaceId, entity: "FinancialTransaction", entityId: id, action: scope === "following" ? "delete_following" : "delete", before, after: { count } });
  });
  return { count };
}

export async function restoreTransaction(userId: string, id: string) {
  const t = await db.financialTransaction.findUnique({ where: { id } });
  if (!t) throw new NotFoundError("Lançamento");
  await financeAccess(userId, t.workspaceId, true);
  await db.financialTransaction.update({ where: { id }, data: { deletedAt: null } });
  await auditFinance(db, { userId, workspaceId: t.workspaceId, entity: "FinancialTransaction", entityId: id, action: "restore" });
}

// ═══════════════════════════════════════════════════════════════
// Listagem
// ═══════════════════════════════════════════════════════════════

export type TransactionFilters = {
  month: string;
  type?: "INCOME" | "EXPENSE";
  status?: "PLANNED" | "REALIZED" | "OVERDUE";
  categoryId?: string;
  accountId?: string;
  search?: string;
};

export const txInclude = {
  category: { select: { id: true, name: true, color: true, costType: true } },
  account: { select: { id: true, name: true } },
} satisfies Prisma.FinancialTransactionInclude;

export async function listTransactions(userId: string, workspaceId: string, filters: TransactionFilters, tz: string) {
  await financeAccess(userId, workspaceId);
  const { from, to } = monthRange(ym.parse(filters.month));
  const today = ymdToDate(todayYmd(tz));
  const where: Prisma.FinancialTransactionWhereInput = {
    workspaceId,
    deletedAt: null,
    status: { not: "CANCELLED" },
    competenceDate: { gte: from, lte: to },
  };
  if (filters.type) where.type = filters.type;
  if (filters.status === "PLANNED" || filters.status === "REALIZED") where.status = filters.status;
  if (filters.status === "OVERDUE") Object.assign(where, { status: "PLANNED", OR: [{ dueDate: { lt: today } }, { dueDate: null, competenceDate: { lt: today } }] });
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.accountId) where.accountId = filters.accountId;
  if (filters.search?.trim()) where.description = { contains: filters.search.trim(), mode: "insensitive" };
  const rows = await db.financialTransaction.findMany({
    where,
    include: txInclude,
    orderBy: [{ competenceDate: "asc" }, { createdAt: "asc" }],
    take: 1000,
  });
  const todayYmd_ = dateToYmd(today);
  return rows.map((t) => ({
    ...t,
    label: transactionLabel(t),
    overdue: t.status === "PLANNED" && dateToYmd(t.dueDate ?? t.competenceDate) < todayYmd_,
    locked: Boolean(t.compensationRecordId || t.receivableId),
  }));
}

export type TransactionRow = Awaited<ReturnType<typeof listTransactions>>[number];

/** CSV (separado por ponto e vírgula, padrão do Excel em português). */
export function transactionsToCsv(rows: TransactionRow[]): string {
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const money = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const header = ["Competência", "Vencimento", "Pagamento", "Tipo", "Descrição", "Categoria", "Conta", "Natureza", "Situação", "Valor (R$)"];
  const lines = rows.map((t) =>
    [
      dateToYmd(t.competenceDate).split("-").reverse().join("/"),
      t.dueDate ? dateToYmd(t.dueDate).split("-").reverse().join("/") : "",
      t.paidAt ? dateToYmd(t.paidAt).split("-").reverse().join("/") : "",
      t.type === "INCOME" ? "Receita" : "Despesa",
      t.label,
      t.category?.name ?? "",
      t.account?.name ?? "",
      NATURE_LABEL[t.nature as keyof typeof NATURE_LABEL] ?? t.nature,
      t.status === "REALIZED" ? (t.type === "INCOME" ? "Recebido" : "Pago") : "Previsto",
      money(t.type === "INCOME" ? t.amountCents : -t.amountCents),
    ]
      .map((v) => esc(String(v)))
      .join(";"),
  );
  return "﻿" + [header.join(";"), ...lines].join("\r\n");
}
