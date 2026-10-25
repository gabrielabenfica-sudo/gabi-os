"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/current";
import { run } from "@/server/errors";
import * as accounts from "@/server/finance/accounts";
import * as categories from "@/server/finance/categories";
import * as tx from "@/server/finance/transactions";
import * as cards from "@/server/finance/cards";
import * as sales from "@/server/finance/sales";
import * as comp from "@/server/finance/compensation";
import * as imports from "@/server/finance/imports";

const refresh = () => revalidatePath("/", "layout");

async function act<T>(fn: (userId: string, tz: string) => Promise<T>, message?: string) {
  const u = await requireUser();
  const r = await run(() => fn(u.id, u.timezone), message);
  if (r.ok) refresh();
  return r;
}

// ─── Contas e transferências ───────────────────────────────────
export const createAccountAction = async (input: accounts.AccountInput) => act((u) => accounts.createAccount(u, input), "Conta criada.");
export const updateAccountAction = async (id: string, input: Omit<accounts.AccountInput, "workspaceId">) => act((u) => accounts.updateAccount(u, id, input), "Conta salva.");
export const archiveAccountAction = async (id: string, archived: boolean) => act((u) => accounts.setAccountArchived(u, id, archived), archived ? "Conta arquivada." : "Conta reativada.");
export const deleteAccountAction = async (id: string) => act((u) => accounts.deleteAccount(u, id), "Conta excluída.");
export const createTransferAction = async (input: { fromAccountId: string; toAccountId: string; amountCents: number; date: string; description?: string | null }) =>
  act((u) => accounts.createTransfer(u, input), "Transferência registrada.");
export const deleteTransferAction = async (id: string) => act((u) => accounts.deleteTransfer(u, id), "Transferência excluída.");

// ─── Categorias ────────────────────────────────────────────────
export const createCategoryAction = async (workspaceId: string, input: { name: string; kind: "INCOME" | "EXPENSE"; color?: string | null; costType?: (typeof categories.COST_TYPES)[number] | null }) =>
  act((u) => categories.createCategory(u, workspaceId, input), "Categoria criada.");
export const updateCategoryAction = async (id: string, input: { name?: string; color?: string | null; costType?: string | null }) => act((u) => categories.updateCategory(u, id, input), "Categoria salva.");
export const archiveCategoryAction = async (id: string, archived: boolean) => act((u) => categories.setCategoryArchived(u, id, archived), archived ? "Categoria arquivada." : "Categoria reativada.");

// ─── Lançamentos ───────────────────────────────────────────────
export const createTransactionAction = async (input: tx.TransactionCreateInput) =>
  act(async (u, tz) => (await tx.createTransaction(u, input, tz)).length, "Lançamento criado.");
export const updateTransactionAction = async (id: string, input: tx.TransactionUpdateInput, scope: "one" | "following") =>
  act(async (u) => (await tx.updateTransaction(u, id, input, scope)).affected, "Lançamento salvo.");
export const setTransactionPaidAction = async (id: string, input: { paid: boolean; accountId?: string | null; paidAt?: string | null }) =>
  act((u, tz) => tx.setTransactionPaid(u, id, input, tz).then(() => null), input.paid ? "Marcado como pago/recebido." : "Voltou para previsto.");
export const deleteTransactionAction = async (id: string, scope: "one" | "following") => act(async (u) => (await tx.deleteTransaction(u, id, scope)).count, "Lançamento excluído.");
export const restoreTransactionAction = async (id: string) => act((u) => tx.restoreTransaction(u, id), "Lançamento restaurado.");

// ─── Cartões ───────────────────────────────────────────────────
export const createCardAction = async (input: cards.CardInput) => act((u) => cards.createCard(u, input), "Cartão criado.");
export const updateCardAction = async (id: string, input: Omit<cards.CardInput, "workspaceId">) => act((u) => cards.updateCard(u, id, input), "Cartão salvo.");
export const archiveCardAction = async (id: string, archived: boolean) => act((u) => cards.setCardArchived(u, id, archived), archived ? "Cartão arquivado." : "Cartão reativado.");
export const createPurchaseAction = async (input: cards.PurchaseInput) => act((u) => cards.createPurchase(u, input).then(() => null), "Compra lançada.");
export const updatePurchaseAction = async (id: string, input: Omit<cards.PurchaseInput, "cardId">) => act((u) => cards.updatePurchase(u, id, input).then(() => null), "Compra salva.");
export const deletePurchaseAction = async (id: string) => act((u) => cards.deletePurchase(u, id), "Compra excluída.");
export const payInvoiceAction = async (invoiceId: string, input: { accountId: string; amountCents?: number; date: string }) =>
  act((u) => cards.payInvoice(u, invoiceId, input).then(() => null), "Pagamento registrado.");
export async function getInvoiceAction(invoiceId: string) {
  const u = await requireUser();
  return run(() => cards.getInvoice(u.id, invoiceId, u.timezone));
}
export async function listInvoicesAction(cardId: string) {
  const u = await requireUser();
  return run(() => cards.listInvoices(u.id, cardId, u.timezone));
}

// ─── Mentoria: vendas ──────────────────────────────────────────
export const createProgramAction = async (workspaceId: string, input: { name: string; priceCents?: number | null; durationWeeks?: number | null; active?: boolean }) =>
  act((u) => sales.createProgram(u, workspaceId, input), "Produto criado.");
export const updateProgramAction = async (id: string, input: { name: string; priceCents?: number | null; durationWeeks?: number | null; active?: boolean }) =>
  act((u) => sales.updateProgram(u, id, input), "Produto salvo.");
export const createSaleAction = async (input: sales.SaleInput) => act((u) => sales.createSale(u, input).then(() => null), "Venda registrada.");
export const updateSaleAction = async (id: string, input: Omit<sales.SaleInput, "workspaceId" | "receivedNow">) => act((u) => sales.updateSale(u, id, input).then(() => null), "Venda salva.");
export const cancelSaleAction = async (id: string) => act((u) => sales.cancelSale(u, id).then(() => null), "Venda cancelada.");
export const deleteSaleAction = async (id: string) => act((u) => sales.deleteSale(u, id), "Venda excluída.");
export const refundSaleAction = async (id: string, input: { amountCents: number; accountId: string; date: string; cancelPending: boolean }) =>
  act((u) => sales.refundSale(u, id, input).then(() => null), "Reembolso registrado.");
export const receiveReceivableAction = async (id: string, input: { accountId: string; date: string; amountCents?: number }) =>
  act((u) => sales.receiveReceivable(u, id, input).then(() => null), "Recebimento registrado.");
export const unreceiveReceivableAction = async (id: string) => act((u) => sales.unreceiveReceivable(u, id).then(() => null), "Recebimento desfeito.");

// ─── Remuneração TURBO ─────────────────────────────────────────
export const createCompensationAction = async (input: comp.CompensationInput) => act((u) => comp.createCompensation(u, input).then(() => null), "Registro criado.");
export const updateCompensationAction = async (id: string, input: Omit<comp.CompensationInput, "workspaceId">) => act((u) => comp.updateCompensation(u, id, input).then(() => null), "Registro salvo.");
export const receiveCompensationAction = async (id: string, input: { receivedCents: number; receivedDate: string; accountId: string }) =>
  act((u) => comp.receiveCompensation(u, id, input).then(() => null), "Recebimento registrado e lançado no financeiro pessoal.");
export const unreceiveCompensationAction = async (id: string) => act((u) => comp.unreceiveCompensation(u, id).then(() => null), "Recebimento desfeito.");
export const cancelCompensationAction = async (id: string, cancelled: boolean) => act((u) => comp.setCompensationCancelled(u, id, cancelled).then(() => null), cancelled ? "Registro cancelado." : "Registro reativado.");
export const deleteCompensationAction = async (id: string) => act((u) => comp.deleteCompensation(u, id), "Registro excluído.");
export const generateSalariesAction = async (input: { workspaceId: string; amountCents: number; payDay: number; fromMonth: string; months: number; paidNextMonth: boolean }) =>
  act((u) => comp.generateSalaries(u, input));
export const createBonusRuleAction = async (input: comp.BonusRuleInput) => act((u) => comp.createBonusRule(u, input).then(() => null), "Regra criada e bonificação prevista atualizada.");
export const updateBonusRuleAction = async (id: string, input: Omit<comp.BonusRuleInput, "workspaceId">) => act((u) => comp.updateBonusRule(u, id, input).then(() => null), "Regra salva.");
export const deleteBonusRuleAction = async (id: string) => act((u) => comp.deleteBonusRule(u, id), "Regra excluída.");

// ─── Importação de extratos (OFX/CSV) ──────────────────────────
export async function previewImportAction(input: imports.ImportFileInput) {
  const u = await requireUser();
  return run(() => imports.previewImport(u.id, input));
}
export const confirmImportAction = async (input: imports.ConfirmImportInput) =>
  act((u) => imports.confirmImport(u, input), "Extrato importado.");
export const undoImportAction = async (batchId: string) => act((u) => imports.undoImport(u, batchId), "Importação desfeita.");
