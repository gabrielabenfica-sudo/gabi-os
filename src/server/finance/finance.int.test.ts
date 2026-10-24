import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { listWorkspaces, ForbiddenError } from "@/server/workspaces";
import { createTestUser } from "../../../tests/factories";
import { addDaysYmd, todayYmd } from "@/lib/dates";
import { balancesFor, createAccount, createTransfer, deleteAccount, deleteTransfer, listAccounts } from "./accounts";
import { createTransaction, deleteTransaction, listTransactions, setTransactionPaid, updateTransaction } from "./transactions";
import { createCard, createPurchase, deletePurchase, getInvoice, listCards, listInvoices, payInvoice, updatePurchase } from "./cards";
import {
  createBonusRule, createCompensation, generateSalaries, receiveCompensation, unreceiveCompensation, updateBonusRule, compensationYear, deleteBonusRule,
} from "./compensation";
import { cancelSale, createSale, receiveReceivable, refundSale, unreceiveReceivable, updateSale, listSales } from "./sales";
import { cashProjection, expensesByCategory, mentoriaMonthly, netWorthSeries, payables, personalMonthly, receivablesList } from "./summary";

const TZ = "America/Sao_Paulo";

async function setup() {
  const user = await createTestUser({ name: "Gabriela" });
  const ws = await listWorkspaces(user.id);
  const turbo = ws.find((w) => w.kind === "TURBO")!;
  const pessoal = ws.find((w) => w.kind === "PESSOAL")!;
  const mentoria = ws.find((w) => w.kind === "MENTORIA")!;
  const conta = await createAccount(user.id, { workspaceId: pessoal.id, name: "Nubank", type: "CHECKING", initialBalanceCents: 100_000 });
  const contaMentoria = await createAccount(user.id, { workspaceId: mentoria.id, name: "PJ", type: "CHECKING", initialBalanceCents: 0 });
  const cat = (wsId: string, name: string) => db.financialCategory.findFirstOrThrow({ where: { workspaceId: wsId, name } });
  return { user, turbo, pessoal, mentoria, conta, contaMentoria, cat };
}

const balance = async (id: string) => (await balancesFor([id])).get(id)!;

describe("contas e lançamentos", () => {
  it("saldo considera só o realizado; previsto não mexe no saldo", async () => {
    const { user, pessoal, conta, cat } = await setup();
    await createTransaction(user.id, { workspaceId: pessoal.id, type: "INCOME", description: "Freela", amountCents: 50_000, competenceDate: "2026-10-05", paid: true, paidAt: "2026-10-05", accountId: conta.id }, TZ);
    const aluguel = await createTransaction(user.id, { workspaceId: pessoal.id, type: "EXPENSE", description: "Aluguel", amountCents: 30_000, competenceDate: "2026-10-10", categoryId: (await cat(pessoal.id, "Moradia")).id }, TZ);
    expect(await balance(conta.id)).toBe(150_000);

    await setTransactionPaid(user.id, aluguel[0]!.id, { paid: true, accountId: conta.id, paidAt: "2026-10-10" }, TZ);
    expect(await balance(conta.id)).toBe(120_000);
    expect(await (await balancesFor([conta.id], "2026-10-07")).get(conta.id)).toBe(150_000);

    await setTransactionPaid(user.id, aluguel[0]!.id, { paid: false }, TZ);
    expect(await balance(conta.id)).toBe(150_000);
    await expect(createTransaction(user.id, { workspaceId: pessoal.id, type: "EXPENSE", description: "X", amountCents: 100, competenceDate: "2026-10-01", paid: true }, TZ)).rejects.toThrow(/conta/);
    await expect(deleteAccount(user.id, conta.id)).rejects.toThrow(/movimentações/);
  });

  it("parcelado divide o total exatamente; recorrente repete o valor; edição e exclusão 'deste em diante'", async () => {
    const { user, pessoal } = await setup();
    const parc = await createTransaction(user.id, { workspaceId: pessoal.id, type: "EXPENSE", description: "Curso", amountCents: 100_000, competenceDate: "2026-01-31", installments: 3 }, TZ);
    expect(parc.map((t) => t.amountCents)).toEqual([33_334, 33_333, 33_333]);
    expect(parc.map((t) => t.competenceDate.toISOString().slice(0, 10))).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(parc.every((t) => t.nature === "INSTALLMENT" && t.seriesTotal === 3)).toBe(true);
    const listed = await listTransactions(user.id, pessoal.id, { month: "2026-02" }, TZ);
    expect(listed[0]!.label).toBe("Curso (2/3)");

    const rec = await createTransaction(user.id, { workspaceId: pessoal.id, type: "EXPENSE", description: "Academia", amountCents: 12_000, competenceDate: "2026-11-05", repeatMonths: 12, nature: "FIXED" }, TZ);
    expect(rec).toHaveLength(12);
    expect(new Set(rec.map((t) => t.amountCents))).toEqual(new Set([12_000]));

    const r = await updateTransaction(user.id, rec[5]!.id, { amountCents: 15_000 }, "following");
    expect(r.affected).toBe(7);
    const after = await db.financialTransaction.findMany({ where: { recurrenceGroupId: rec[0]!.recurrenceGroupId! }, orderBy: { seriesIndex: "asc" } });
    expect(after.slice(0, 5).every((t) => t.amountCents === 12_000)).toBe(true);
    expect(after.slice(5).every((t) => t.amountCents === 15_000)).toBe(true);

    const d = await deleteTransaction(user.id, rec[9]!.id, "following");
    expect(d.count).toBe(3);
    expect(await db.financialTransaction.count({ where: { recurrenceGroupId: rec[0]!.recurrenceGroupId!, deletedAt: null } })).toBe(9);
  });
});

describe("cartão de crédito", () => {
  it("parcelas vão para as faturas certas; pagamento é transferência e não duplica despesa", async () => {
    const { user, pessoal, conta } = await setup();
    const card = await createCard(user.id, { workspaceId: pessoal.id, name: "Nubank", limitCents: 500_000, closingDay: 3, dueDay: 10, paymentAccountId: conta.id });
    await createPurchase(user.id, { cardId: card.id, description: "Notebook", totalCents: 300_000, installmentsCount: 3, purchaseDate: "2026-10-20" });
    await createPurchase(user.id, { cardId: card.id, description: "Mercado", totalCents: 25_000, installmentsCount: 1, purchaseDate: "2026-10-02" });

    const invoices = await listInvoices(user.id, card.id, TZ);
    expect(invoices.map((i) => [i.referenceMonth, i.totalCents])).toEqual([
      ["2026-10-01", 25_000],
      ["2026-11-01", 100_000],
      ["2026-12-01", 100_000],
      ["2027-01-01", 100_000],
    ]);

    const cards = await listCards(user.id, pessoal.id, TZ);
    expect(cards[0]!.usedCents).toBe(325_000);
    expect(cards[0]!.availableCents).toBe(175_000);

    // Despesa de novembro = parcela do notebook (competência = mês da fatura)
    const [nov] = await personalMonthly(user.id, pessoal, "2026-11", "2026-11");
    expect(nov!.cardExpense).toBe(100_000);
    expect(nov!.expenseTotal).toBe(100_000);

    // Paga a fatura de novembro: saldo cai, despesa NÃO aumenta
    const novInv = invoices[1]!;
    await payInvoice(user.id, novInv.id, { accountId: conta.id, date: "2026-11-10" });
    expect(await balance(conta.id)).toBe(0);
    const [novAfter] = await personalMonthly(user.id, pessoal, "2026-11", "2026-11");
    expect(novAfter!.expenseTotal).toBe(100_000);
    const inv = await getInvoice(user.id, novInv.id, TZ);
    expect(inv.state).toBe("PAID");
    expect((await listCards(user.id, pessoal.id, TZ))[0]!.usedCents).toBe(225_000);

    const cats = await expensesByCategory(pessoal.id, "2026-11");
    expect(cats).toEqual([{ id: null, name: "Sem categoria", color: null, amountCents: 100_000 }]);
  });

  it("editar compra refaz parcelas; excluir remove faturas vazias; estorno abate da fatura", async () => {
    const { user, pessoal } = await setup();
    const card = await createCard(user.id, { workspaceId: pessoal.id, name: "Inter", limitCents: 100_000, closingDay: 25, dueDay: 5 });
    const p = await createPurchase(user.id, { cardId: card.id, description: "Tênis", totalCents: 60_000, installmentsCount: 2, purchaseDate: "2026-10-10" });
    expect((await listInvoices(user.id, card.id, TZ)).map((i) => i.referenceMonth)).toEqual(["2026-11-01", "2026-12-01"]);
    await updatePurchase(user.id, p.id, { description: "Tênis", totalCents: 60_000, installmentsCount: 3, purchaseDate: "2026-10-10" });
    expect((await listInvoices(user.id, card.id, TZ)).map((i) => i.totalCents)).toEqual([20_000, 20_000, 20_000]);
    await createPurchase(user.id, { cardId: card.id, description: "Estorno", totalCents: -5_000, installmentsCount: 1, purchaseDate: "2026-10-12" });
    expect((await listInvoices(user.id, card.id, TZ))[0]!.totalCents).toBe(15_000);
    await expect(createPurchase(user.id, { cardId: card.id, description: "X", totalCents: -5_000, installmentsCount: 2, purchaseDate: "2026-10-12" })).rejects.toThrow(/parcela única/);
    await deletePurchase(user.id, p.id);
    expect((await listInvoices(user.id, card.id, TZ)).map((i) => i.referenceMonth)).toEqual(["2026-11-01"]);
  });
});

describe("transferências entre ambientes", () => {
  it("retirada da Mentoria: receita pessoal, não é faturamento nem despesa da Mentoria; patrimônio total não muda", async () => {
    const { user, pessoal, mentoria, conta, contaMentoria } = await setup();
    await createSale(user.id, { workspaceId: mentoria.id, customerName: "Ana", description: "Mentoria Individual", totalCents: 300_000, saleDate: "2026-10-01", paymentType: "CASH", installmentsCount: 1, firstDueDate: "2026-10-01", receivedNow: { accountId: contaMentoria.id, date: "2026-10-01" } });
    const totalBefore = (await balance(conta.id)) + (await balance(contaMentoria.id));

    const t = await createTransfer(user.id, { fromAccountId: contaMentoria.id, toAccountId: conta.id, amountCents: 100_000, date: "2026-10-15" });
    expect(t.kind).toBe("DISTRIBUTION");
    expect((await balance(conta.id)) + (await balance(contaMentoria.id))).toBe(totalBefore);

    const [p] = await personalMonthly(user.id, pessoal, "2026-10", "2026-10");
    expect(p!.distributions).toBe(100_000);
    expect(p!.incomeTotal).toBe(100_000);

    const [m] = await mentoriaMonthly(mentoria.id, "2026-10", "2026-10");
    expect(m!.revenueCents).toBe(300_000);
    expect(m!.expensesCents).toBe(0);
    expect(m!.profitCents).toBe(300_000);
    expect(m!.distributionsCents).toBe(100_000);
    expect(m!.cashFlowCents).toBe(200_000);

    await deleteTransfer(user.id, t.id);
    expect(await balance(contaMentoria.id)).toBe(300_000);
  });

  it("transferência para reserva é aplicação, não despesa", async () => {
    const { user, pessoal, conta } = await setup();
    const reserva = await createAccount(user.id, { workspaceId: pessoal.id, name: "Reserva", type: "SAVINGS", initialBalanceCents: 0 });
    const t = await createTransfer(user.id, { fromAccountId: conta.id, toAccountId: reserva.id, amountCents: 40_000, date: "2026-10-03" });
    expect(t.kind).toBe("INVESTMENT");
    const [oct] = await personalMonthly(user.id, pessoal, "2026-10", "2026-10");
    expect(oct!.expenseTotal).toBe(0);
    const accs = await listAccounts(user.id, pessoal.id);
    expect(accs.find((a) => a.id === reserva.id)).toMatchObject({ balanceCents: 40_000, isReserve: true });
    const nw = await netWorthSeries([pessoal.id], ["2026-10"], "2026-10-31");
    expect(nw[0]).toEqual({ month: "2026-10", totalCents: 100_000, reservesCents: 40_000 });
  });
});

describe("remuneração TURBO", () => {
  it("previsto não é recebido; receber cria UMA receita pessoal; desfazer remove", async () => {
    const { user, turbo, pessoal, conta } = await setup();
    const g = await generateSalaries(user.id, { workspaceId: turbo.id, amountCents: 500_000, payDay: 5, fromMonth: "2026-10", months: 3, paidNextMonth: true });
    expect(g).toEqual({ created: 3, skipped: 0 });
    expect((await generateSalaries(user.id, { workspaceId: turbo.id, amountCents: 500_000, payDay: 5, fromMonth: "2026-10", months: 3, paidNextMonth: true })).created).toBe(0);

    const oct = await db.compensationRecord.findFirstOrThrow({ where: { workspaceId: turbo.id, referenceMonth: new Date("2026-10-01T00:00:00Z") } });
    expect(oct.expectedDate!.toISOString().slice(0, 10)).toBe("2026-11-05");

    const [nov] = await personalMonthly(user.id, pessoal, "2026-11", "2026-11");
    expect(nov!.compensationExpected).toBe(500_000);
    expect(nov!.incomeRealized).toBe(0);
    expect(nov!.resultRealized).toBe(0);
    expect(await balance(conta.id)).toBe(100_000);

    await receiveCompensation(user.id, oct.id, { receivedCents: 498_000, receivedDate: "2026-11-05", accountId: conta.id });
    await receiveCompensation(user.id, oct.id, { receivedCents: 499_000, receivedDate: "2026-11-05", accountId: conta.id });
    expect(await db.financialTransaction.count({ where: { compensationRecordId: oct.id } })).toBe(1);
    expect(await balance(conta.id)).toBe(599_000);
    const [novAfter] = await personalMonthly(user.id, pessoal, "2026-11", "2026-11");
    expect(novAfter!.incomeRealized).toBe(499_000);
    // O salário de outubro (pago em 05/11) saiu de "previsto" ao ser recebido
    expect(novAfter!.compensationExpected).toBe(0);
    const year = await compensationYear(user.id, turbo.id, 2026);
    expect(year.monthly[9]).toMatchObject({ salaryExpected: 500_000, salaryReceived: 499_000, pendingCents: 0 });
    expect(year.totals.received).toBe(499_000);

    await unreceiveCompensation(user.id, oct.id);
    expect(await db.financialTransaction.count({ where: { compensationRecordId: oct.id } })).toBe(0);
    expect(await balance(conta.id)).toBe(100_000);
    await expect(receiveCompensation(user.id, oct.id, { receivedCents: 1, receivedDate: "2026-11-05", accountId: (await db.financialAccount.findFirstOrThrow({ where: { workspace: { kind: "MENTORIA" }, name: "PJ" } })).id })).rejects.toThrow(/Pessoal/);
  });

  it("bonificação por faixas: muda com o atingimento até ser recebida", async () => {
    const { user, turbo, conta } = await setup();
    const rule = await createBonusRule(user.id, {
      workspaceId: turbo.id, referenceMonth: "2026-10", title: "Meta de leads", targetValue: 100, achievedValue: 85,
      tiers: [{ minPercent: 80, amountCents: 50_000 }, { minPercent: 100, amountCents: 100_000 }],
    });
    let rec = await db.compensationRecord.findFirstOrThrow({ where: { bonusRuleId: rule.id } });
    expect(rec).toMatchObject({ kind: "BONUS", expectedCents: 50_000, status: "EXPECTED" });

    await updateBonusRule(user.id, rule.id, { referenceMonth: "2026-10", title: "Meta de leads", targetValue: 100, achievedValue: 104, tiers: [{ minPercent: 80, amountCents: 50_000 }, { minPercent: 100, amountCents: 100_000 }] });
    rec = await db.compensationRecord.findFirstOrThrow({ where: { bonusRuleId: rule.id } });
    expect(rec.expectedCents).toBe(100_000);

    await receiveCompensation(user.id, rec.id, { receivedCents: 100_000, receivedDate: "2026-11-10", accountId: conta.id });
    await updateBonusRule(user.id, rule.id, { referenceMonth: "2026-10", title: "Meta de leads", targetValue: 100, achievedValue: 50, tiers: [{ minPercent: 80, amountCents: 50_000 }] });
    rec = await db.compensationRecord.findFirstOrThrow({ where: { bonusRuleId: rule.id } });
    expect(rec).toMatchObject({ expectedCents: 100_000, status: "RECEIVED" });
    await expect(deleteBonusRule(user.id, rule.id)).rejects.toThrow(/recebida/);

    const income = await db.financialTransaction.findFirstOrThrow({ where: { compensationRecordId: rec.id }, include: { category: true } });
    expect(income.category?.name).toBe("Bonificações TURBO");
  });

  it("remuneração manual de outro tipo e permissão", async () => {
    const { user, turbo } = await setup();
    const intruder = await createTestUser();
    await expect(createCompensation(intruder.id, { workspaceId: turbo.id, kind: "OTHER", referenceMonth: "2026-10", expectedCents: 1 })).rejects.toBeInstanceOf(ForbiddenError);
    const rec = await createCompensation(user.id, { workspaceId: turbo.id, kind: "OTHER", referenceMonth: "2026-10", description: "PLR", expectedCents: 200_000 });
    expect(rec.status).toBe("EXPECTED");
  });
});

describe("financeiro da Mentoria", () => {
  it("venda parcelada: faturamento na venda, recebimento por parcela, inadimplência e comissão", async () => {
    const { user, mentoria, contaMentoria } = await setup();
    const today = todayYmd(TZ);
    const sale = await createSale(user.id, {
      workspaceId: mentoria.id, customerName: "Bruna", description: "Mentoria em grupo", totalCents: 300_000, saleDate: "2026-09-15",
      paymentType: "INSTALLMENTS", installmentsCount: 3, firstDueDate: addDaysYmd(today, -40), commissionCents: 30_000,
    });
    const recs = await db.receivable.findMany({ where: { saleId: sale.id }, orderBy: { number: "asc" } });
    expect(recs.map((r) => r.amountCents)).toEqual([100_000, 100_000, 100_000]);

    const [sep] = await mentoriaMonthly(mentoria.id, "2026-09", "2026-09");
    expect(sep).toMatchObject({ salesCents: 300_000, revenueCents: 300_000, commissionCents: 30_000, profitCents: 270_000, receiptsCents: 0 });

    await receiveReceivable(user.id, recs[0]!.id, { accountId: contaMentoria.id, date: "2026-10-05" });
    const [oct] = await mentoriaMonthly(mentoria.id, "2026-10", "2026-10");
    expect(oct).toMatchObject({ revenueCents: 0, receiptsCents: 100_000, otherIncomeCents: 0, cashFlowCents: 100_000 });
    expect(await balance(contaMentoria.id)).toBe(100_000);

    const list = await listSales(user.id, mentoria.id, {}, TZ);
    expect(list[0]).toMatchObject({ receivedCents: 100_000, pendingCents: 200_000 });
    expect(list[0]!.overdueCount).toBe(1); // a 2ª parcela venceu há ~10 dias

    await expect(updateSale(user.id, sale.id, { customerName: "Bruna", description: "Mentoria em grupo", totalCents: 360_000, saleDate: "2026-09-15", paymentType: "INSTALLMENTS", installmentsCount: 3, firstDueDate: addDaysYmd(today, -40), commissionCents: 30_000 })).rejects.toThrow(/recebidas/);

    await unreceiveReceivable(user.id, recs[0]!.id);
    expect(await db.financialTransaction.count({ where: { receivableId: recs[0]!.id } })).toBe(0);
    await updateSale(user.id, sale.id, { customerName: "Bruna", description: "Mentoria em grupo", totalCents: 360_000, saleDate: "2026-09-15", paymentType: "INSTALLMENTS", installmentsCount: 4, firstDueDate: "2026-10-01", commissionCents: 36_000 });
    expect((await db.receivable.findMany({ where: { saleId: sale.id } })).map((r) => r.amountCents)).toEqual([90_000, 90_000, 90_000, 90_000]);
    const commission = await db.financialTransaction.findMany({ where: { saleId: sale.id, type: "EXPENSE", deletedAt: null } });
    expect(commission).toHaveLength(1);
    expect(commission[0]!.amountCents).toBe(36_000);
  });

  it("reembolso e cancelamento", async () => {
    const { user, mentoria, contaMentoria } = await setup();
    const sale = await createSale(user.id, {
      workspaceId: mentoria.id, customerName: "Carla", description: "Mentoria", totalCents: 200_000, saleDate: "2026-10-01",
      paymentType: "INSTALLMENTS", installmentsCount: 2, firstDueDate: "2026-10-01",
    });
    const [r1] = await db.receivable.findMany({ where: { saleId: sale.id }, orderBy: { number: "asc" } });
    await receiveReceivable(user.id, r1!.id, { accountId: contaMentoria.id, date: "2026-10-01" });
    await expect(refundSale(user.id, sale.id, { amountCents: 150_000, accountId: contaMentoria.id, date: "2026-10-20", cancelPending: true })).rejects.toThrow(/já recebido/);
    const after = await refundSale(user.id, sale.id, { amountCents: 100_000, accountId: contaMentoria.id, date: "2026-10-20", cancelPending: true });
    expect(after.status).toBe("REFUNDED");
    expect(await balance(contaMentoria.id)).toBe(0);
    const [oct] = await mentoriaMonthly(mentoria.id, "2026-10", "2026-10");
    expect(oct).toMatchObject({ revenueCents: 200_000, refundCents: 100_000, profitCents: 100_000 });

    const s2 = await createSale(user.id, { workspaceId: mentoria.id, customerName: "Dani", description: "Mentoria", totalCents: 100_000, saleDate: "2026-10-02", paymentType: "CASH", installmentsCount: 1, firstDueDate: "2026-10-02" });
    await cancelSale(user.id, s2.id);
    const [oct2] = await mentoriaMonthly(mentoria.id, "2026-10", "2026-10");
    expect(oct2!.salesCount).toBe(1);
    expect(await db.receivable.count({ where: { saleId: s2.id, status: "CANCELLED" } })).toBe(1);
  });
});

describe("a pagar, a receber e projeção", () => {
  it("lista vencimentos e projeta o caixa", async () => {
    const { user, pessoal, turbo, conta } = await setup();
    const today = todayYmd(TZ);
    await createTransaction(user.id, { workspaceId: pessoal.id, type: "EXPENSE", description: "Luz", amountCents: 20_000, competenceDate: today, dueDate: addDaysYmd(today, -2) }, TZ);
    await createTransaction(user.id, { workspaceId: pessoal.id, type: "EXPENSE", description: "Internet", amountCents: 10_000, competenceDate: today, dueDate: addDaysYmd(today, 5) }, TZ);
    await createCompensation(user.id, { workspaceId: turbo.id, kind: "SALARY", referenceMonth: today.slice(0, 7), expectedCents: 300_000, expectedDate: addDaysYmd(today, 3) });

    const pay = await payables(user.id, pessoal.id, TZ);
    expect(pay.map((p) => [p.label, p.overdue])).toEqual([["Luz", true], ["Internet", false]]);
    const rec = await receivablesList(user.id, pessoal, TZ);
    expect(rec).toHaveLength(1);
    expect(rec[0]!.kind).toBe("compensation");

    const proj = await cashProjection(user.id, pessoal, TZ, 3);
    expect(proj.startCents).toBe(100_000);
    const flows = proj.rows.reduce((s, r) => s + r.inflow - r.outflow, 0);
    expect(flows).toBe(300_000 - 30_000);
    expect(proj.rows[proj.rows.length - 1]!.balance).toBe(100_000 + 270_000);
    void conta;
  });
});
