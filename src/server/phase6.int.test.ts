import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { listWorkspaces } from "@/server/workspaces";
import { createTestUser } from "../../tests/factories";
import { balancesFor, createAccount } from "./finance/accounts";
import { createTransaction } from "./finance/transactions";
import { confirmImport, listImports, previewImport, undoImport } from "./finance/imports";
import { personalMonthly } from "./finance/summary";

const TZ = "America/Sao_Paulo";

const ofx = (rows: { date: string; amount: string; id: string; memo: string }[]) =>
  `OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL<BANKTRANLIST>\n${rows
    .map((r) => `<STMTTRN>\n<TRNTYPE>OTHER\n<DTPOSTED>${r.date}\n<TRNAMT>${r.amount}\n<FITID>${r.id}\n<MEMO>${r.memo}\n</STMTTRN>`)
    .join("\n")}\n</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

async function setup() {
  const user = await createTestUser({ name: "Gabriela" });
  const ws = await listWorkspaces(user.id);
  const pessoal = ws.find((w) => w.kind === "PESSOAL")!;
  const conta = await createAccount(user.id, { workspaceId: pessoal.id, name: "Banco", type: "CHECKING", initialBalanceCents: 100_000 });
  return { user, pessoal, conta };
}

describe("importação de extratos", () => {
  it("OFX: cria realizados, concilia o previsto compatível, não duplica ao reimportar e pode ser desfeita", async () => {
    const { user, pessoal, conta } = await setup();
    const moradia = await db.financialCategory.findFirstOrThrow({ where: { workspaceId: pessoal.id, name: "Moradia" } });
    const aluguel = await createTransaction(user.id, { workspaceId: pessoal.id, type: "EXPENSE", description: "Aluguel", amountCents: 150_000, competenceDate: "2026-10-05", categoryId: moradia.id }, TZ);
    const file = ofx([
      { date: "20261006", amount: "-1500.00", id: "F1", memo: "TED ALUGUEL" },
      { date: "20261007", amount: "-89.90", id: "F2", memo: "MERCADO" },
      { date: "20261008", amount: "3000.00", id: "F3", memo: "PIX RECEBIDO" },
    ]);
    const input = { accountId: conta.id, fileName: "extrato.ofx", content: file };

    const pre = await previewImport(user.id, input);
    expect(pre.format).toBe("OFX");
    expect(pre.rows.map((r) => r.status)).toEqual(["MATCH", "NEW", "NEW"]);
    expect(pre.rows[0]!.match?.id).toBe(aluguel[0]!.id);

    const res = await confirmImport(user.id, { ...input, selections: pre.rows.map((r) => ({ externalId: r.externalId })) });
    expect(res).toMatchObject({ created: 2, reconciled: 1, skipped: 0 });
    // Aluguel virou pago (não foi criado outro); saldo = 1000 − 1500 − 89,90 + 3000
    const rent = await db.financialTransaction.findUniqueOrThrow({ where: { id: aluguel[0]!.id } });
    expect(rent).toMatchObject({ status: "REALIZED", accountId: conta.id, reconciled: true });
    expect((await balancesFor([conta.id])).get(conta.id)).toBe(100_000 - 150_000 - 8_990 + 300_000);
    const [oct] = await personalMonthly(user.id, pessoal, "2026-10", "2026-10");
    expect(oct!.expenseTotal).toBe(150_000 + 8_990); // sem contar o aluguel duas vezes

    // Reimportar o mesmo arquivo: tudo já importado
    const again = await previewImport(user.id, input);
    expect(again.rows.every((r) => r.status === "IMPORTED")).toBe(true);
    const res2 = await confirmImport(user.id, { ...input, selections: again.rows.map((r) => ({ externalId: r.externalId })) });
    expect(res2).toMatchObject({ created: 0, reconciled: 0, skipped: 3 });

    // Desfazer: remove os criados e devolve o aluguel a previsto
    const batches = await listImports(user.id, pessoal.id);
    const first = batches.find((b) => b.id === res.batchId)!;
    expect(first.imported).toBe(3);
    expect(await undoImport(user.id, res.batchId!)).toEqual({ removed: 2, restored: 1 });
    expect(await db.financialTransaction.findUniqueOrThrow({ where: { id: aluguel[0]!.id } })).toMatchObject({ status: "PLANNED", paidAt: null, externalId: null });
    expect((await balancesFor([conta.id])).get(conta.id)).toBe(100_000);
    expect((await previewImport(user.id, input)).rows.map((r) => r.status)).toEqual(["MATCH", "NEW", "NEW"]);
  });

  it("CSV: mapeamento automático, possível duplicado de lançamento manual e categoria por linha", async () => {
    const { user, pessoal, conta } = await setup();
    const alimentacao = await db.financialCategory.findFirstOrThrow({ where: { workspaceId: pessoal.id, name: "Alimentação" } });
    await createTransaction(user.id, { workspaceId: pessoal.id, type: "EXPENSE", description: "Padaria", amountCents: 1_550, competenceDate: "2026-10-10", paid: true, paidAt: "2026-10-10", accountId: conta.id }, TZ);
    const csv = "Data;Descrição;Valor\n10/10/2026;PADARIA DO ZE;-15,50\n11/10/2026;RESTAURANTE;-60,00\n";
    const input = { accountId: conta.id, fileName: "extrato.csv", content: csv };
    const pre = await previewImport(user.id, input);
    expect(pre.format).toBe("CSV");
    expect(pre.rows.map((r) => r.status)).toEqual(["DUPLICATE", "NEW"]);

    const res = await confirmImport(user.id, { ...input, selections: [{ externalId: pre.rows[1]!.externalId, categoryId: alimentacao.id }] });
    expect(res).toMatchObject({ created: 1, skipped: 1 });
    const t = await db.financialTransaction.findFirstOrThrow({ where: { externalId: pre.rows[1]!.externalId } });
    expect(t).toMatchObject({ description: "RESTAURANTE", amountCents: 6_000, type: "EXPENSE", categoryId: alimentacao.id, status: "REALIZED" });

    // CSV sem cabeçalho reconhecível pede o mapeamento
    const odd = await previewImport(user.id, { accountId: conta.id, fileName: "x.csv", content: "a;b;c\n10/10/2026;X;1,00" });
    expect(odd.needsMapping).toBe(true);
    const mapped = await previewImport(user.id, { accountId: conta.id, fileName: "x.csv", content: "a;b;c\n10/10/2026;X;1,00", mapping: { date: 0, description: 1, amount: 2, header: true } });
    expect(mapped.rows).toHaveLength(1);

    // Sem permissão de outra usuária
    const other = await createTestUser();
    await expect(previewImport(other.id, input)).rejects.toThrow();
  });
});
