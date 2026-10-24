import type { Prisma, WorkspaceKind } from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { requireWorkspaceAccess } from "@/server/workspaces";
import { audit } from "@/server/audit";
import { endOfMonthYmd, ymdToDate } from "@/lib/dates";

export const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
export const ym = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês inválido.");
/** Valor em centavos, positivo. */
export const cents = z.number({ invalid_type_error: "Informe o valor." }).int("Valor inválido.").positive("O valor deve ser maior que zero.").max(100_000_000_000, "Valor alto demais.");

export type Tx = Prisma.TransactionClient;

/** Permissão do módulo financeiro em um ambiente. */
export function financeAccess(userId: string, workspaceId: string, write = false) {
  return requireWorkspaceAccess(userId, workspaceId, { module: "finance", write });
}

/** Primeiro ambiente do tipo informado com acesso ao financeiro. */
export async function findFinanceWorkspace(userId: string, kind: WorkspaceKind) {
  const members = await db.workspaceMember.findMany({
    where: { userId, workspace: { kind } },
    include: { workspace: true },
    orderBy: { workspace: { position: "asc" } },
  });
  const m = members.find((x) => x.role === "OWNER" || x.role === "ADMIN" || x.modules.includes("finance"));
  return m?.workspace ?? null;
}

export function monthRange(month: string) {
  return { from: ymdToDate(`${month}-01`), to: ymdToDate(endOfMonthYmd(`${month}-01`)) };
}

export async function assertAccount(client: Tx | typeof db, workspaceId: string, accountId: string | null | undefined) {
  if (!accountId) return null;
  const acc = await client.financialAccount.findFirst({ where: { id: accountId, workspaceId } });
  if (!acc) throw new AppError("Conta inválida para este ambiente.");
  return acc;
}

export async function assertCategory(client: Tx | typeof db, workspaceId: string, categoryId: string | null | undefined, kind: "INCOME" | "EXPENSE") {
  if (!categoryId) return null;
  const cat = await client.financialCategory.findFirst({ where: { id: categoryId, workspaceId } });
  if (!cat) throw new AppError("Categoria inválida para este ambiente.");
  if (cat.kind !== kind) throw new AppError(kind === "INCOME" ? "Escolha uma categoria de receita." : "Escolha uma categoria de despesa.");
  return cat;
}

/** Busca categoria pelo nome (para lançamentos automáticos). */
export async function categoryByName(client: Tx | typeof db, workspaceId: string, kind: "INCOME" | "EXPENSE", names: string[]) {
  return client.financialCategory.findFirst({ where: { workspaceId, kind, name: { in: names } } });
}

/** Auditoria de alterações financeiras (obrigatória). */
export function auditFinance(
  client: Tx | typeof db,
  input: { userId: string; workspaceId: string; entity: string; entityId: string; action: string; before?: unknown; after?: unknown },
) {
  return audit(input, client);
}

export function sum(values: (number | null | undefined)[]): number {
  return values.reduce<number>((s, v) => s + (v ?? 0), 0);
}
