import { z } from "zod";
import { db } from "@/server/db";
import { AppError, NotFoundError } from "@/server/errors";
import { addDaysYmd, dateToYmd, ymdToDate } from "@/lib/dates";
import { detectFormat, guessCsvMapping, parseCsv, parseOfx, type CsvMapping, type ParsedRow } from "@/lib/finance/import-parsers";
import { auditFinance, financeAccess } from "./common";

/**
 * Importação de extratos (OFX/CSV) em uma conta:
 * - cada linha vira um lançamento REALIZADO (data = competência = caixa);
 * - o `externalId` (FITID ou hash da linha) é único por conta: importar o mesmo
 *   arquivo de novo não duplica nada;
 * - se já existe um lançamento PREVISTO compatível (mesmo tipo e valor, data
 *   próxima), a linha é sugerida para CONCILIAR: o previsto vira pago em vez de
 *   criar outro — evitando contar a mesma despesa duas vezes;
 * - lançamentos já pagos com mesmo valor e data na mesma conta aparecem como
 *   "possível duplicado" e vêm desmarcados.
 */

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MATCH_WINDOW_DAYS = 5;

const mappingSchema = z.object({
  delimiter: z.string().max(1).optional(),
  date: z.number().int().min(0).max(200),
  description: z.number().int().min(0).max(200),
  amount: z.number().int().min(0).max(200).nullable().optional(),
  debit: z.number().int().min(0).max(200).nullable().optional(),
  credit: z.number().int().min(0).max(200).nullable().optional(),
  header: z.boolean(),
  invert: z.boolean().optional(),
});

const fileSchema = z.object({
  accountId: z.string().min(1, "Escolha a conta."),
  fileName: z.string().trim().min(1).max(200),
  content: z.string().min(1, "Arquivo vazio.").max(MAX_IMPORT_BYTES, "Arquivo grande demais (máximo 2 MB)."),
  mapping: mappingSchema.nullable().optional(),
});
export type ImportFileInput = z.input<typeof fileSchema>;

async function loadAccount(userId: string, accountId: string, write = false) {
  const account = await db.financialAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new NotFoundError("Conta");
  await financeAccess(userId, account.workspaceId, write);
  if (account.archived) throw new AppError("Esta conta está arquivada.");
  return account;
}

function parse(input: z.output<typeof fileSchema>) {
  const format = detectFormat(input.fileName, input.content);
  if (format === "OFX") return { format, ...parseOfx(input.content), headers: null as string[] | null, mapping: null as CsvMapping | null };
  const guess = guessCsvMapping(input.content);
  const mapping = (input.mapping as CsvMapping | null | undefined) ?? guess.mapping;
  if (!mapping) return { format, rows: [] as ParsedRow[], errors: [], headers: guess.headers, mapping: null, needsMapping: true as const };
  if (mapping.amount == null && mapping.debit == null && mapping.credit == null) throw new AppError("Escolha a coluna de valor (ou débito/crédito).");
  return { format, ...parseCsv(input.content, mapping), headers: guess.headers, mapping };
}

export type PreviewRow = ParsedRow & {
  status: "NEW" | "MATCH" | "DUPLICATE" | "IMPORTED";
  /** Previsto que será conciliado (status MATCH) ou lançamento parecido (DUPLICATE) */
  match: { id: string; description: string; date: string; amountCents: number } | null;
};

/** Lê o arquivo e classifica cada linha, sem gravar nada. */
export async function previewImport(userId: string, input: ImportFileInput) {
  const data = fileSchema.parse(input);
  const account = await loadAccount(userId, data.accountId);
  const parsed = parse(data);
  if ("needsMapping" in parsed) return { ...parsed, rows: [] as PreviewRow[], account: { id: account.id, name: account.name } };
  const rows = await classify(account.id, account.workspaceId, parsed.rows);
  return { format: parsed.format, rows, errors: parsed.errors, headers: parsed.headers, mapping: parsed.mapping, needsMapping: false as const, account: { id: account.id, name: account.name } };
}

async function classify(accountId: string, workspaceId: string, rows: ParsedRow[]): Promise<PreviewRow[]> {
  if (!rows.length) return [];
  const dates = rows.map((r) => r.date).sort();
  const from = ymdToDate(addDaysYmd(dates[0]!, -MATCH_WINDOW_DAYS));
  const to = ymdToDate(addDaysYmd(dates[dates.length - 1]!, MATCH_WINDOW_DAYS));
  const [imported, planned, realized] = await Promise.all([
    db.financialTransaction.findMany({ where: { accountId, externalId: { in: rows.map((r) => r.externalId) } }, select: { externalId: true } }),
    db.financialTransaction.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        status: "PLANNED",
        OR: [{ accountId }, { accountId: null }],
        AND: [{ OR: [{ competenceDate: { gte: from, lte: to } }, { dueDate: { gte: from, lte: to } }] }],
      },
      select: { id: true, type: true, amountCents: true, description: true, competenceDate: true, dueDate: true },
    }),
    db.financialTransaction.findMany({
      where: { accountId, deletedAt: null, status: "REALIZED", externalId: null, paidAt: { gte: from, lte: to } },
      select: { id: true, type: true, amountCents: true, description: true, paidAt: true },
    }),
  ]);
  const importedSet = new Set(imported.map((i) => i.externalId));
  const usedPlanned = new Set<string>();
  const usedRealized = new Set<string>();
  const dist = (a: string, b: string) => Math.abs(ymdToDate(a).getTime() - ymdToDate(b).getTime()) / 86_400_000;

  return rows.map((r) => {
    if (importedSet.has(r.externalId)) return { ...r, status: "IMPORTED" as const, match: null };
    const type = r.amountCents > 0 ? "INCOME" : "EXPENSE";
    const abs = Math.abs(r.amountCents);
    const p = planned
      .filter((t) => !usedPlanned.has(t.id) && t.type === type && t.amountCents === abs)
      .map((t) => ({ t, d: Math.min(dist(dateToYmd(t.competenceDate), r.date), t.dueDate ? dist(dateToYmd(t.dueDate), r.date) : Infinity) }))
      .filter((x) => x.d <= MATCH_WINDOW_DAYS)
      .sort((a, b) => a.d - b.d)[0];
    if (p) {
      usedPlanned.add(p.t.id);
      return { ...r, status: "MATCH" as const, match: { id: p.t.id, description: p.t.description, date: dateToYmd(p.t.dueDate ?? p.t.competenceDate), amountCents: p.t.amountCents } };
    }
    const dup = realized.find((t) => !usedRealized.has(t.id) && t.type === type && t.amountCents === abs && dist(dateToYmd(t.paidAt!), r.date) <= 1);
    if (dup) {
      usedRealized.add(dup.id);
      return { ...r, status: "DUPLICATE" as const, match: { id: dup.id, description: dup.description, date: dateToYmd(dup.paidAt!), amountCents: dup.amountCents } };
    }
    return { ...r, status: "NEW" as const, match: null };
  });
}

const confirmSchema = fileSchema.extend({
  /** Linhas escolhidas (pelo externalId) e, opcionalmente, a categoria de cada uma */
  selections: z
    .array(z.object({ externalId: z.string().min(1).max(200), categoryId: z.string().nullable().optional(), reconcile: z.boolean().default(true) }))
    .min(1, "Selecione ao menos uma linha.")
    .max(5000),
});
export type ConfirmImportInput = z.input<typeof confirmSchema>;

/**
 * Grava as linhas selecionadas. O arquivo é lido de novo no servidor (o cliente
 * só escolhe linhas), então valores e datas não podem ser alterados no caminho.
 */
export async function confirmImport(userId: string, input: ConfirmImportInput) {
  const data = confirmSchema.parse(input);
  const account = await loadAccount(userId, data.accountId, true);
  const parsed = parse(data);
  if ("needsMapping" in parsed) throw new AppError("Defina as colunas do CSV.");
  const preview = await classify(account.id, account.workspaceId, parsed.rows);
  const byId = new Map(preview.map((r) => [r.externalId, r]));
  const chosen = data.selections.map((s) => ({ s, row: byId.get(s.externalId) })).filter((x) => x.row && x.row.status !== "IMPORTED");

  const categoryIds = [...new Set(chosen.map((c) => c.s.categoryId).filter((v): v is string => !!v))];
  const categories = await db.financialCategory.findMany({ where: { id: { in: categoryIds }, workspaceId: account.workspaceId } });
  if (categories.length !== categoryIds.length) throw new AppError("Categoria inválida para este ambiente.");
  const catKind = new Map(categories.map((c) => [c.id, c.kind]));

  if (!chosen.length) return { batchId: null, created: 0, reconciled: 0, skipped: parsed.rows.length };
  return db.$transaction(async (tx) => {
    const batch = await tx.importBatch.create({
      data: { userId, workspaceId: account.workspaceId, accountId: account.id, fileName: data.fileName, format: parsed.format, totalRows: parsed.rows.length },
    });
    let created = 0;
    let reconciled = 0;
    const skipped = parsed.rows.length - chosen.length;
    for (const { s, row } of chosen) {
      const r = row!;
      const type = r.amountCents > 0 ? "INCOME" : "EXPENSE";
      const categoryId = s.categoryId && catKind.get(s.categoryId) === type ? s.categoryId : null;
      if (r.status === "MATCH" && s.reconcile && r.match) {
        // Concilia: o previsto vira pago (sem criar outro lançamento)
        const res = await tx.financialTransaction.updateMany({
          where: { id: r.match.id, status: "PLANNED", deletedAt: null },
          data: { status: "REALIZED", paidAt: ymdToDate(r.date), accountId: account.id, externalId: r.externalId, importBatchId: batch.id, reconciled: true, ...(categoryId ? { categoryId } : {}) },
        });
        if (res.count === 1) {
          reconciled++;
          continue;
        }
      }
      await tx.financialTransaction.create({
        data: {
          workspaceId: account.workspaceId,
          accountId: account.id,
          type,
          status: "REALIZED",
          description: r.description.slice(0, 200),
          amountCents: Math.abs(r.amountCents),
          competenceDate: ymdToDate(r.date),
          paidAt: ymdToDate(r.date),
          nature: "VARIABLE",
          categoryId,
          externalId: r.externalId,
          importBatchId: batch.id,
          reconciled: true,
        },
      });
      created++;
    }
    const result = await tx.importBatch.update({ where: { id: batch.id }, data: { imported: created + reconciled, duplicates: skipped } });
    await auditFinance(tx, { userId, workspaceId: account.workspaceId, entity: "ImportBatch", entityId: batch.id, action: "import", after: { created, reconciled, skipped, fileName: data.fileName } });
    return { batchId: result.id, created, reconciled, skipped };
  });
}

export async function listImports(userId: string, workspaceId: string) {
  await financeAccess(userId, workspaceId);
  return db.importBatch.findMany({
    where: { workspaceId },
    include: { account: { select: { name: true } }, _count: { select: { transactions: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

/**
 * Desfaz uma importação: apaga os lançamentos criados por ela e devolve os
 * conciliados ao estado de previsto. Assim a mesma linha pode ser importada de novo.
 */
export async function undoImport(userId: string, batchId: string) {
  const batch = await db.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new NotFoundError("Importação");
  await financeAccess(userId, batch.workspaceId, true);
  return db.$transaction(async (tx) => {
    const txs = await tx.financialTransaction.findMany({ where: { importBatchId: batchId }, select: { id: true, nature: true, createdAt: true, reconciled: true, recurrenceGroupId: true, seriesIndex: true } });
    // Conciliados são lançamentos que já existiam (foram criados antes da importação)
    const reconciledIds = txs.filter((t) => t.createdAt < batch.createdAt).map((t) => t.id);
    const createdIds = txs.filter((t) => t.createdAt >= batch.createdAt).map((t) => t.id);
    if (reconciledIds.length) {
      await tx.financialTransaction.updateMany({ where: { id: { in: reconciledIds } }, data: { status: "PLANNED", paidAt: null, externalId: null, importBatchId: null, reconciled: false } });
    }
    await tx.financialTransaction.deleteMany({ where: { id: { in: createdIds } } });
    await tx.importBatch.delete({ where: { id: batchId } });
    await auditFinance(tx, { userId, workspaceId: batch.workspaceId, entity: "ImportBatch", entityId: batchId, action: "undo_import", after: { removed: createdIds.length, restored: reconciledIds.length } });
    return { removed: createdIds.length, restored: reconciledIds.length };
  });
}
