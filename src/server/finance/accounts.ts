import type { AccountType, TransferKind } from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { AppError, NotFoundError } from "@/server/errors";
import { requireWorkspaceAccess } from "@/server/workspaces";
import { ymdToDate } from "@/lib/dates";
import { auditFinance, cents, financeAccess, ymd } from "./common";

const ACCOUNT_TYPES = ["CHECKING", "SAVINGS", "CASH", "INVESTMENT", "WALLET", "OTHER"] as const;
export const RESERVE_TYPES: AccountType[] = ["SAVINGS", "INVESTMENT"];

export const accountSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(1, "Informe o nome da conta.").max(80),
  type: z.enum(ACCOUNT_TYPES),
  institution: z.string().trim().max(80).nullable().optional(),
  initialBalanceCents: z.number().int().min(-100_000_000_000).max(100_000_000_000),
  initialBalanceDate: ymd.nullable().optional(),
});
export type AccountInput = z.input<typeof accountSchema>;

// ═══════════════════════════════════════════════════════════════
// Saldos
// ═══════════════════════════════════════════════════════════════

/**
 * Saldo = saldo inicial + receitas recebidas − despesas pagas
 *       + transferências recebidas − transferências enviadas (inclui pagamento de fatura).
 * Compras no cartão NÃO mexem no saldo: só o pagamento da fatura.
 * `asOf` (inclusive) permite calcular o saldo em uma data passada.
 */
export async function balancesFor(accountIds: string[], asOf?: string): Promise<Map<string, number>> {
  const result = new Map(accountIds.map((id) => [id, 0]));
  if (!accountIds.length) return result;
  const until = asOf ? ymdToDate(asOf) : undefined;
  const dateFilter = until ? { lte: until } : undefined;

  const [accounts, txs, ins, outs] = await Promise.all([
    db.financialAccount.findMany({ where: { id: { in: accountIds } }, select: { id: true, initialBalanceCents: true, initialBalanceDate: true } }),
    db.financialTransaction.groupBy({
      by: ["accountId", "type"],
      where: { accountId: { in: accountIds }, status: "REALIZED", deletedAt: null, ...(dateFilter ? { paidAt: dateFilter } : {}) },
      _sum: { amountCents: true },
    }),
    db.transfer.groupBy({
      by: ["toAccountId"],
      where: { toAccountId: { in: accountIds }, status: "REALIZED", deletedAt: null, ...(dateFilter ? { date: dateFilter } : {}) },
      _sum: { amountCents: true },
    }),
    db.transfer.groupBy({
      by: ["fromAccountId"],
      where: { fromAccountId: { in: accountIds }, status: "REALIZED", deletedAt: null, ...(dateFilter ? { date: dateFilter } : {}) },
      _sum: { amountCents: true },
    }),
  ]);
  for (const a of accounts) {
    if (!until || !a.initialBalanceDate || a.initialBalanceDate <= until) result.set(a.id, a.initialBalanceCents);
  }
  for (const t of txs) {
    if (!t.accountId) continue;
    const v = t._sum.amountCents ?? 0;
    result.set(t.accountId, (result.get(t.accountId) ?? 0) + (t.type === "INCOME" ? v : -v));
  }
  for (const t of ins) if (t.toAccountId) result.set(t.toAccountId, (result.get(t.toAccountId) ?? 0) + (t._sum.amountCents ?? 0));
  for (const t of outs) if (t.fromAccountId) result.set(t.fromAccountId, (result.get(t.fromAccountId) ?? 0) - (t._sum.amountCents ?? 0));
  return result;
}

export async function listAccounts(userId: string, workspaceId: string, opts: { includeArchived?: boolean } = {}) {
  await financeAccess(userId, workspaceId);
  const accounts = await db.financialAccount.findMany({
    where: { workspaceId, ...(opts.includeArchived ? {} : { archived: false }) },
    orderBy: [{ archived: "asc" }, { createdAt: "asc" }],
  });
  const balances = await balancesFor(accounts.map((a) => a.id));
  return accounts.map((a) => ({ ...a, balanceCents: balances.get(a.id) ?? 0, isReserve: RESERVE_TYPES.includes(a.type) }));
}

export type AccountWithBalance = Awaited<ReturnType<typeof listAccounts>>[number];

export async function createAccount(userId: string, input: AccountInput) {
  const data = accountSchema.parse(input);
  await financeAccess(userId, data.workspaceId, true);
  const account = await db.financialAccount.create({
    data: {
      workspaceId: data.workspaceId,
      name: data.name,
      type: data.type,
      institution: data.institution || null,
      initialBalanceCents: data.initialBalanceCents,
      initialBalanceDate: data.initialBalanceDate ? ymdToDate(data.initialBalanceDate) : null,
    },
  });
  await auditFinance(db, { userId, workspaceId: data.workspaceId, entity: "FinancialAccount", entityId: account.id, action: "create", after: account });
  return account;
}

async function loadAccount(userId: string, accountId: string) {
  const acc = await db.financialAccount.findUnique({ where: { id: accountId } });
  if (!acc) throw new NotFoundError("Conta");
  await financeAccess(userId, acc.workspaceId, true);
  return acc;
}

export async function updateAccount(userId: string, accountId: string, input: Omit<AccountInput, "workspaceId">) {
  const before = await loadAccount(userId, accountId);
  const data = accountSchema.omit({ workspaceId: true }).parse(input);
  const after = await db.financialAccount.update({
    where: { id: accountId },
    data: {
      name: data.name,
      type: data.type,
      institution: data.institution || null,
      initialBalanceCents: data.initialBalanceCents,
      initialBalanceDate: data.initialBalanceDate ? ymdToDate(data.initialBalanceDate) : null,
    },
  });
  await auditFinance(db, { userId, workspaceId: before.workspaceId, entity: "FinancialAccount", entityId: accountId, action: "update", before, after });
  return after;
}

export async function setAccountArchived(userId: string, accountId: string, archived: boolean) {
  const acc = await loadAccount(userId, accountId);
  await db.financialAccount.update({ where: { id: accountId }, data: { archived } });
  await auditFinance(db, { userId, workspaceId: acc.workspaceId, entity: "FinancialAccount", entityId: accountId, action: archived ? "archive" : "unarchive" });
}

/** Só exclui contas sem movimentação; com histórico, use arquivar. */
export async function deleteAccount(userId: string, accountId: string) {
  const acc = await loadAccount(userId, accountId);
  const [txs, transfers, cards] = await Promise.all([
    db.financialTransaction.count({ where: { accountId, deletedAt: null } }),
    db.transfer.count({ where: { OR: [{ fromAccountId: accountId }, { toAccountId: accountId }], deletedAt: null } }),
    db.creditCard.count({ where: { paymentAccountId: accountId } }),
  ]);
  if (txs || transfers) throw new AppError("Esta conta tem movimentações. Arquive em vez de excluir, para manter o histórico.");
  if (cards) throw new AppError("Há cartões que usam esta conta para pagamento.");
  await db.financialAccount.delete({ where: { id: accountId } });
  await auditFinance(db, { userId, workspaceId: acc.workspaceId, entity: "FinancialAccount", entityId: accountId, action: "delete", before: acc });
}

// ═══════════════════════════════════════════════════════════════
// Transferências (internas, retiradas da Mentoria, reservas)
// ═══════════════════════════════════════════════════════════════

export const transferSchema = z.object({
  fromAccountId: z.string().min(1, "Escolha a conta de origem."),
  toAccountId: z.string().min(1, "Escolha a conta de destino."),
  amountCents: cents,
  date: ymd,
  description: z.string().trim().max(200).nullable().optional(),
});

/**
 * Transferência não é receita nem despesa. Entre ambientes, fica rastreável:
 * Mentoria → Pessoal = retirada/distribuição (aparece como receita pessoal
 * "Retiradas da Mentoria", nunca como faturamento).
 */
export async function createTransfer(userId: string, input: z.input<typeof transferSchema>) {
  const data = transferSchema.parse(input);
  if (data.fromAccountId === data.toAccountId) throw new AppError("Escolha contas diferentes.");
  const [from, to] = await Promise.all([
    db.financialAccount.findUnique({ where: { id: data.fromAccountId }, include: { workspace: true } }),
    db.financialAccount.findUnique({ where: { id: data.toAccountId }, include: { workspace: true } }),
  ]);
  if (!from || !to) throw new NotFoundError("Conta");
  await requireWorkspaceAccess(userId, from.workspaceId, { module: "finance", write: true });
  await requireWorkspaceAccess(userId, to.workspaceId, { module: "finance", write: true });
  if (from.archived || to.archived) throw new AppError("Não é possível usar uma conta arquivada.");

  let kind: TransferKind = "INTERNAL";
  if (from.workspace.kind === "MENTORIA" && to.workspace.kind === "PESSOAL") kind = "DISTRIBUTION";
  else if (from.workspaceId === to.workspaceId && RESERVE_TYPES.includes(to.type) !== RESERVE_TYPES.includes(from.type)) kind = "INVESTMENT";

  const transfer = await db.transfer.create({
    data: {
      kind,
      fromWorkspaceId: from.workspaceId,
      toWorkspaceId: to.workspaceId,
      fromAccountId: from.id,
      toAccountId: to.id,
      amountCents: data.amountCents,
      date: ymdToDate(data.date),
      description: data.description || null,
      status: "REALIZED",
    },
  });
  await auditFinance(db, { userId, workspaceId: from.workspaceId, entity: "Transfer", entityId: transfer.id, action: "create", after: transfer });
  return transfer;
}

export async function deleteTransfer(userId: string, transferId: string) {
  const t = await db.transfer.findFirst({ where: { id: transferId, deletedAt: null } });
  if (!t) throw new NotFoundError("Transferência");
  await requireWorkspaceAccess(userId, t.fromWorkspaceId, { module: "finance", write: true });
  if (t.toWorkspaceId !== t.fromWorkspaceId) await requireWorkspaceAccess(userId, t.toWorkspaceId, { module: "finance", write: true });
  await db.transfer.update({ where: { id: transferId }, data: { deletedAt: new Date() } });
  await auditFinance(db, { userId, workspaceId: t.fromWorkspaceId, entity: "Transfer", entityId: transferId, action: "delete", before: t });
}

/** Transferências de um mês que envolvem o ambiente (entrada ou saída). */
export async function listTransfers(userId: string, workspaceId: string, from: Date, to: Date) {
  await financeAccess(userId, workspaceId);
  return db.transfer.findMany({
    where: { deletedAt: null, date: { gte: from, lte: to }, OR: [{ fromWorkspaceId: workspaceId }, { toWorkspaceId: workspaceId }] },
    include: {
      fromAccount: { select: { id: true, name: true } },
      toAccount: { select: { id: true, name: true } },
      fromWorkspace: { select: { id: true, name: true } },
      toWorkspace: { select: { id: true, name: true } },
      cardInvoice: { select: { id: true, card: { select: { name: true } } } },
    },
    orderBy: { date: "desc" },
  });
}

/** Contas de destino possíveis para transferência (todos os ambientes com financeiro). */
export async function transferTargets(userId: string) {
  const members = await db.workspaceMember.findMany({ where: { userId }, include: { workspace: true } });
  const ids = members.filter((m) => m.role === "OWNER" || m.role === "ADMIN" || m.modules.includes("finance")).map((m) => m.workspaceId);
  return db.financialAccount.findMany({
    where: { workspaceId: { in: ids }, archived: false },
    select: { id: true, name: true, workspaceId: true, workspace: { select: { name: true, kind: true } } },
    orderBy: [{ workspace: { position: "asc" } }, { createdAt: "asc" }],
  });
}
