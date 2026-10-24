import { z } from "zod";
import { db } from "@/server/db";
import { AppError, NotFoundError } from "@/server/errors";
import { auditFinance, financeAccess } from "./common";

export const COST_TYPES = ["FIXED", "VARIABLE", "COMMISSION", "REFUND", "OTHER"] as const;

const schema = z.object({
  name: z.string().trim().min(1, "Informe o nome.").max(60),
  kind: z.enum(["INCOME", "EXPENSE"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  costType: z.enum(COST_TYPES).nullable().optional(),
});

export async function listCategories(userId: string, workspaceId: string, opts: { includeArchived?: boolean } = {}) {
  await financeAccess(userId, workspaceId);
  return db.financialCategory.findMany({
    where: { workspaceId, ...(opts.includeArchived ? {} : { archived: false }) },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
}

export async function createCategory(userId: string, workspaceId: string, input: z.input<typeof schema>) {
  await financeAccess(userId, workspaceId, true);
  const data = schema.parse(input);
  const exists = await db.financialCategory.findFirst({ where: { workspaceId, kind: data.kind, name: { equals: data.name, mode: "insensitive" } } });
  if (exists) {
    if (exists.archived) return db.financialCategory.update({ where: { id: exists.id }, data: { archived: false } });
    throw new AppError("Já existe uma categoria com esse nome.");
  }
  const cat = await db.financialCategory.create({ data: { workspaceId, name: data.name, kind: data.kind, color: data.color ?? null, costType: data.kind === "EXPENSE" ? data.costType ?? null : null } });
  await auditFinance(db, { userId, workspaceId, entity: "FinancialCategory", entityId: cat.id, action: "create", after: cat });
  return cat;
}

async function load(userId: string, id: string) {
  const cat = await db.financialCategory.findUnique({ where: { id } });
  if (!cat) throw new NotFoundError("Categoria");
  await financeAccess(userId, cat.workspaceId, true);
  return cat;
}

export async function updateCategory(userId: string, id: string, input: { name?: string; color?: string | null; costType?: string | null }) {
  const before = await load(userId, id);
  const data = z
    .object({ name: z.string().trim().min(1).max(60).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(), costType: z.enum(COST_TYPES).nullable().optional() })
    .parse(input);
  const after = await db.financialCategory.update({ where: { id }, data: { ...data, ...(before.kind === "INCOME" ? { costType: null } : {}) } });
  await auditFinance(db, { userId, workspaceId: before.workspaceId, entity: "FinancialCategory", entityId: id, action: "update", before, after });
  return after;
}

/** Arquivar mantém o histórico; lançamentos antigos continuam com a categoria. */
export async function setCategoryArchived(userId: string, id: string, archived: boolean) {
  const cat = await load(userId, id);
  await db.financialCategory.update({ where: { id }, data: { archived } });
  await auditFinance(db, { userId, workspaceId: cat.workspaceId, entity: "FinancialCategory", entityId: id, action: archived ? "archive" : "unarchive" });
}
