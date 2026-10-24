import type { CompensationRecord, Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { AppError, NotFoundError } from "@/server/errors";
import { requireWorkspaceAccess } from "@/server/workspaces";
import { addMonthsYm, dateToYmd, dayOfMonthYmd, formatYm, ymdToDate } from "@/lib/dates";
import { expectedBonus, parseTiers } from "@/lib/finance/bonus";
import { assertAccount, auditFinance, categoryByName, cents, financeAccess, ymd, ym, type Tx } from "./common";

/**
 * Remuneração TURBO: só a remuneração da usuária, nunca o faturamento da empresa.
 * O registro vive no ambiente TURBO. Quando o valor é RECEBIDO, gera UMA receita
 * realizada no ambiente Pessoal (vínculo único), na conta escolhida.
 * Valor previsto nunca é tratado como dinheiro recebido.
 */

export const KIND_LABEL = { SALARY: "Salário", BONUS: "Bonificação", OTHER: "Outro" } as const;

const recordSchema = z.object({
  workspaceId: z.string().min(1),
  kind: z.enum(["SALARY", "BONUS", "OTHER"]),
  referenceMonth: ym,
  description: z.string().trim().max(200).nullable().optional(),
  expectedCents: z.number().int().min(0).max(100_000_000_000),
  expectedDate: ymd.nullable().optional(),
  bonusRuleId: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type CompensationInput = z.input<typeof recordSchema>;

async function assertTurbo(workspaceId: string) {
  const ws = await db.workspace.findUnique({ where: { id: workspaceId } });
  if (ws?.kind !== "TURBO") throw new AppError("A remuneração pertence ao ambiente TURBO.");
}

export async function createCompensation(userId: string, input: CompensationInput) {
  const data = recordSchema.parse(input);
  await financeAccess(userId, data.workspaceId, true);
  await assertTurbo(data.workspaceId);
  if (data.bonusRuleId && !(await db.bonusRule.findFirst({ where: { id: data.bonusRuleId, workspaceId: data.workspaceId } }))) {
    throw new AppError("Regra de bonificação inválida.");
  }
  const rec = await db.compensationRecord.create({
    data: {
      workspaceId: data.workspaceId,
      kind: data.kind,
      referenceMonth: ymdToDate(`${data.referenceMonth}-01`),
      description: data.description || null,
      expectedCents: data.expectedCents,
      expectedDate: data.expectedDate ? ymdToDate(data.expectedDate) : null,
      bonusRuleId: data.bonusRuleId ?? null,
      notes: data.notes || null,
    },
  });
  await auditFinance(db, { userId, workspaceId: data.workspaceId, entity: "CompensationRecord", entityId: rec.id, action: "create", after: rec });
  return rec;
}

async function load(userId: string, id: string) {
  const rec = await db.compensationRecord.findFirst({ where: { id, deletedAt: null }, include: { transaction: true } });
  if (!rec) throw new NotFoundError("Registro de remuneração");
  await financeAccess(userId, rec.workspaceId, true);
  return rec;
}

export async function updateCompensation(userId: string, id: string, input: Omit<CompensationInput, "workspaceId">) {
  const before = await load(userId, id);
  const data = recordSchema.omit({ workspaceId: true }).parse(input);
  const after = await db.compensationRecord.update({
    where: { id },
    data: {
      kind: data.kind,
      referenceMonth: ymdToDate(`${data.referenceMonth}-01`),
      description: data.description || null,
      expectedCents: data.expectedCents,
      expectedDate: data.expectedDate ? ymdToDate(data.expectedDate) : null,
      notes: data.notes || null,
    },
  });
  // Mantém a descrição da receita vinculada coerente
  if (before.transaction) {
    await db.financialTransaction.update({ where: { id: before.transaction.id }, data: { description: incomeDescription(after) } });
  }
  await auditFinance(db, { userId, workspaceId: before.workspaceId, entity: "CompensationRecord", entityId: id, action: "update", before, after });
  return after;
}

function incomeDescription(r: Pick<CompensationRecord, "kind" | "referenceMonth" | "description">) {
  const base = r.kind === "SALARY" ? "Salário TURBO" : r.kind === "BONUS" ? "Bonificação TURBO" : r.description || "Remuneração TURBO";
  return `${base} · ${formatYm(dateToYmd(r.referenceMonth).slice(0, 7), true)}`;
}

/** Registra o recebimento: cria (ou atualiza) a receita no ambiente Pessoal. */
export async function receiveCompensation(userId: string, id: string, input: { receivedCents: number; receivedDate: string; accountId: string }) {
  const before = await load(userId, id);
  const data = z.object({ receivedCents: cents, receivedDate: ymd, accountId: z.string().min(1, "Escolha a conta que recebeu.") }).parse(input);
  const account = await db.financialAccount.findUnique({ where: { id: data.accountId }, include: { workspace: true } });
  if (!account) throw new NotFoundError("Conta");
  if (account.workspace.kind !== "PESSOAL") throw new AppError("A remuneração deve entrar em uma conta do ambiente Pessoal.");
  if (account.archived) throw new AppError("Esta conta está arquivada.");
  await requireWorkspaceAccess(userId, account.workspaceId, { module: "finance", write: true });

  return db.$transaction(async (tx) => {
    const rec = await tx.compensationRecord.update({
      where: { id },
      data: { status: "RECEIVED", receivedCents: data.receivedCents, receivedDate: ymdToDate(data.receivedDate) },
    });
    const category = await categoryByName(tx, account.workspaceId, "INCOME", rec.kind === "BONUS" ? ["Bonificações TURBO", "Bonificação TURBO"] : ["Salário TURBO"]);
    const txData = {
      workspaceId: account.workspaceId,
      type: "INCOME" as const,
      status: "REALIZED" as const,
      description: incomeDescription(rec),
      amountCents: data.receivedCents,
      accountId: account.id,
      categoryId: category?.id ?? null,
      competenceDate: ymdToDate(data.receivedDate),
      paidAt: ymdToDate(data.receivedDate),
      nature: rec.kind === "SALARY" ? "FIXED" : "VARIABLE",
    };
    const income = before.transaction
      ? await tx.financialTransaction.update({ where: { id: before.transaction.id }, data: { ...txData, deletedAt: null } })
      : await tx.financialTransaction.create({ data: { ...txData, compensationRecordId: id } });
    await auditFinance(tx, { userId, workspaceId: before.workspaceId, entity: "CompensationRecord", entityId: id, action: "receive", before, after: { record: rec, incomeId: income.id } });
    return rec;
  });
}

/** Desfaz o recebimento: volta a previsto e remove a receita gerada. */
export async function unreceiveCompensation(userId: string, id: string) {
  const before = await load(userId, id);
  if (before.status !== "RECEIVED") return before;
  return db.$transaction(async (tx) => {
    await removeLinkedIncome(tx, before.transaction?.id);
    const rec = await tx.compensationRecord.update({ where: { id }, data: { status: "EXPECTED", receivedCents: null, receivedDate: null } });
    await auditFinance(tx, { userId, workspaceId: before.workspaceId, entity: "CompensationRecord", entityId: id, action: "unreceive", before, after: rec });
    return rec;
  });
}

async function removeLinkedIncome(tx: Tx, transactionId: string | undefined) {
  // Remove de fato (e não só marca) para liberar o vínculo único com o registro
  if (transactionId) await tx.financialTransaction.delete({ where: { id: transactionId } });
}

export async function setCompensationCancelled(userId: string, id: string, cancelled: boolean) {
  const before = await load(userId, id);
  return db.$transaction(async (tx) => {
    if (cancelled) await removeLinkedIncome(tx, before.transaction?.id);
    const rec = await tx.compensationRecord.update({
      where: { id },
      data: cancelled ? { status: "CANCELLED", receivedCents: null, receivedDate: null } : { status: "EXPECTED" },
    });
    await auditFinance(tx, { userId, workspaceId: before.workspaceId, entity: "CompensationRecord", entityId: id, action: cancelled ? "cancel" : "reactivate", before, after: rec });
    return rec;
  });
}

export async function deleteCompensation(userId: string, id: string) {
  const before = await load(userId, id);
  await db.$transaction(async (tx) => {
    await removeLinkedIncome(tx, before.transaction?.id);
    await tx.compensationRecord.update({ where: { id }, data: { deletedAt: new Date() } });
    await auditFinance(tx, { userId, workspaceId: before.workspaceId, entity: "CompensationRecord", entityId: id, action: "delete", before });
  });
}

/** Cria salários previstos para os próximos meses (sem duplicar meses já cadastrados). */
export async function generateSalaries(
  userId: string,
  input: { workspaceId: string; amountCents: number; payDay: number; fromMonth: string; months: number; paidNextMonth: boolean },
) {
  const data = z
    .object({
      workspaceId: z.string(),
      amountCents: cents,
      payDay: z.number().int().min(1).max(31),
      fromMonth: ym,
      months: z.number().int().min(1).max(24),
      paidNextMonth: z.boolean(),
    })
    .parse(input);
  await financeAccess(userId, data.workspaceId, true);
  await assertTurbo(data.workspaceId);
  const months = Array.from({ length: data.months }, (_, i) => addMonthsYm(data.fromMonth, i));
  const existing = await db.compensationRecord.findMany({
    where: { workspaceId: data.workspaceId, kind: "SALARY", deletedAt: null, referenceMonth: { in: months.map((m) => ymdToDate(`${m}-01`)) } },
    select: { referenceMonth: true },
  });
  const taken = new Set(existing.map((e) => dateToYmd(e.referenceMonth).slice(0, 7)));
  const rows: Prisma.CompensationRecordCreateManyInput[] = months
    .filter((m) => !taken.has(m))
    .map((m) => ({
      workspaceId: data.workspaceId,
      kind: "SALARY",
      referenceMonth: ymdToDate(`${m}-01`),
      expectedCents: data.amountCents,
      expectedDate: ymdToDate(dayOfMonthYmd(data.paidNextMonth ? addMonthsYm(m, 1) : m, data.payDay)),
    }));
  if (rows.length) await db.compensationRecord.createMany({ data: rows });
  await auditFinance(db, { userId, workspaceId: data.workspaceId, entity: "CompensationRecord", entityId: "batch", action: "generate_salaries", after: { created: rows.length, skipped: taken.size, ...data } });
  return { created: rows.length, skipped: taken.size };
}

// ═══════════════════════════════════════════════════════════════
// Regras de bonificação (variam mês a mês)
// ═══════════════════════════════════════════════════════════════

const tierSchema = z.object({ minPercent: z.number().min(0).max(1000), amountCents: z.number().int().min(0).max(100_000_000_000) });
const ruleSchema = z.object({
  workspaceId: z.string().min(1),
  referenceMonth: ym,
  title: z.string().trim().min(1, "Informe o nome da meta/bonificação.").max(120),
  criteria: z.string().max(2000).nullable().optional(),
  targetValue: z.number().min(0).max(1e12).nullable().optional(),
  achievedValue: z.number().min(0).max(1e12).nullable().optional(),
  tiers: z.array(tierSchema).max(10).default([]),
  /** Valor previsto informado manualmente (substitui o cálculo por faixas) */
  expectedCents: z.number().int().min(0).max(100_000_000_000).nullable().optional(),
});
export type BonusRuleInput = z.input<typeof ruleSchema>;

function computeRule(r: { tiers: unknown; targetValue: Prisma.Decimal | null; achievedValue: Prisma.Decimal | null; expectedCents: number | null }) {
  return expectedBonus({
    tiers: parseTiers(r.tiers),
    targetValue: r.targetValue === null ? null : Number(r.targetValue),
    achievedValue: r.achievedValue === null ? null : Number(r.achievedValue),
    manualCents: r.expectedCents,
  });
}

/** Mantém a bonificação prevista do mês sincronizada com a regra (se ainda não recebida). */
async function syncBonusRecord(tx: Tx, ruleId: string) {
  const rule = await tx.bonusRule.findUniqueOrThrow({ where: { id: ruleId } });
  const { cents: value } = computeRule(rule);
  const record = await tx.compensationRecord.findFirst({ where: { bonusRuleId: ruleId, deletedAt: null } });
  if (!record) {
    return tx.compensationRecord.create({
      data: { workspaceId: rule.workspaceId, kind: "BONUS", referenceMonth: rule.referenceMonth, description: rule.title, expectedCents: value, bonusRuleId: ruleId },
    });
  }
  if (record.status === "EXPECTED") {
    return tx.compensationRecord.update({ where: { id: record.id }, data: { expectedCents: value, referenceMonth: rule.referenceMonth, description: rule.title } });
  }
  return record;
}

function ruleData(data: z.output<typeof ruleSchema>) {
  return {
    referenceMonth: ymdToDate(`${data.referenceMonth}-01`),
    title: data.title,
    criteria: data.criteria || null,
    targetValue: data.targetValue ?? null,
    achievedValue: data.achievedValue ?? null,
    tiers: data.tiers,
    expectedCents: data.expectedCents ?? null,
  };
}

export async function createBonusRule(userId: string, input: BonusRuleInput) {
  const data = ruleSchema.parse(input);
  await financeAccess(userId, data.workspaceId, true);
  await assertTurbo(data.workspaceId);
  return db.$transaction(async (tx) => {
    const rule = await tx.bonusRule.create({ data: { workspaceId: data.workspaceId, ...ruleData(data) } });
    await syncBonusRecord(tx, rule.id);
    await auditFinance(tx, { userId, workspaceId: data.workspaceId, entity: "BonusRule", entityId: rule.id, action: "create", after: rule });
    return rule;
  });
}

export async function updateBonusRule(userId: string, id: string, input: Omit<BonusRuleInput, "workspaceId">) {
  const before = await db.bonusRule.findUnique({ where: { id } });
  if (!before) throw new NotFoundError("Regra de bonificação");
  await financeAccess(userId, before.workspaceId, true);
  const data = ruleSchema.omit({ workspaceId: true }).parse(input);
  return db.$transaction(async (tx) => {
    const after = await tx.bonusRule.update({ where: { id }, data: ruleData({ ...data, workspaceId: before.workspaceId }) });
    await syncBonusRecord(tx, id);
    await auditFinance(tx, { userId, workspaceId: before.workspaceId, entity: "BonusRule", entityId: id, action: "update", before, after });
    return after;
  });
}

export async function deleteBonusRule(userId: string, id: string) {
  const rule = await db.bonusRule.findUnique({ where: { id }, include: { records: { where: { deletedAt: null } } } });
  if (!rule) throw new NotFoundError("Regra de bonificação");
  await financeAccess(userId, rule.workspaceId, true);
  if (rule.records.some((r) => r.status === "RECEIVED")) throw new AppError("A bonificação desta regra já foi recebida. Desfaça o recebimento antes de excluir.");
  await db.$transaction(async (tx) => {
    await tx.compensationRecord.updateMany({ where: { bonusRuleId: id, deletedAt: null }, data: { deletedAt: new Date() } });
    await tx.bonusRule.delete({ where: { id } });
    await auditFinance(tx, { userId, workspaceId: rule.workspaceId, entity: "BonusRule", entityId: id, action: "delete", before: rule });
  });
}

// ═══════════════════════════════════════════════════════════════
// Consultas
// ═══════════════════════════════════════════════════════════════

export async function compensationYear(userId: string, workspaceId: string, year: number) {
  await financeAccess(userId, workspaceId);
  const from = ymdToDate(`${year}-01-01`);
  const to = ymdToDate(`${year}-12-01`);
  const [records, rules] = await Promise.all([
    db.compensationRecord.findMany({
      where: { workspaceId, deletedAt: null, referenceMonth: { gte: from, lte: to } },
      include: { transaction: { select: { id: true, accountId: true, account: { select: { name: true } } } }, bonusRule: { select: { id: true, title: true } } },
      orderBy: [{ referenceMonth: "asc" }, { kind: "asc" }, { createdAt: "asc" }],
    }),
    db.bonusRule.findMany({ where: { workspaceId, referenceMonth: { gte: from, lte: to } }, orderBy: { referenceMonth: "asc" } }),
  ]);

  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const active = records.filter((r) => r.status !== "CANCELLED");
  const monthly = months.map((m) => {
    const rs = active.filter((r) => dateToYmd(r.referenceMonth).startsWith(m));
    const pick = (kind: string, field: "expected" | "received") =>
      rs.filter((r) => r.kind === kind).reduce((s, r) => s + (field === "expected" ? r.expectedCents : r.status === "RECEIVED" ? r.receivedCents ?? 0 : 0), 0);
    const salaryExpected = pick("SALARY", "expected");
    const bonusExpected = pick("BONUS", "expected");
    const otherExpected = pick("OTHER", "expected");
    const salaryReceived = pick("SALARY", "received");
    const bonusReceived = pick("BONUS", "received");
    const otherReceived = pick("OTHER", "received");
    return {
      month: m,
      salaryExpected, bonusExpected, otherExpected,
      salaryReceived, bonusReceived, otherReceived,
      totalExpected: salaryExpected + bonusExpected + otherExpected,
      totalReceived: salaryReceived + bonusReceived + otherReceived,
      // A receber: previsto ainda não recebido (não conta como dinheiro em caixa)
      pendingCents: rs.filter((r) => r.status === "EXPECTED").reduce((s, r) => s + r.expectedCents, 0),
    };
  });
  const totals = monthly.reduce(
    (t, m) => ({ expected: t.expected + m.totalExpected, received: t.received + m.totalReceived, pending: t.pending + m.pendingCents, bonusReceived: t.bonusReceived + m.bonusReceived, salaryReceived: t.salaryReceived + m.salaryReceived }),
    { expected: 0, received: 0, pending: 0, bonusReceived: 0, salaryReceived: 0 },
  );
  return {
    year,
    records,
    rules: rules.map((r) => ({ ...r, targetValue: r.targetValue === null ? null : Number(r.targetValue), achievedValue: r.achievedValue === null ? null : Number(r.achievedValue), tiers: parseTiers(r.tiers), computed: computeRule(r) })),
    monthly,
    totals,
  };
}

export type CompensationYear = Awaited<ReturnType<typeof compensationYear>>;

/** Remuneração prevista e não recebida, por data prevista (para o financeiro pessoal). */
export async function expectedCompensationBetween(userId: string, from: Date, to: Date) {
  const members = await db.workspaceMember.findMany({ where: { userId, workspace: { kind: "TURBO" } } });
  const ids = members.filter((m) => m.role === "OWNER" || m.role === "ADMIN" || m.modules.includes("finance")).map((m) => m.workspaceId);
  const rows = await db.compensationRecord.findMany({ where: { workspaceId: { in: ids }, deletedAt: null, status: "EXPECTED" } });
  // Sem data prevista, considera o dia 1 do mês de referência
  return rows.filter((r) => {
    const when = r.expectedDate ?? r.referenceMonth;
    return when >= from && when <= to;
  });
}
