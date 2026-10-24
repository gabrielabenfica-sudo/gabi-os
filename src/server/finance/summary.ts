import type { Workspace } from "@prisma/client";
import { db } from "@/server/db";
import { addDaysYmd, addMonthsYm, dateToYmd, endOfMonthYmd, todayYmd, ymdToDate } from "@/lib/dates";
import { balancesFor, RESERVE_TYPES } from "./accounts";
import { listCards, listInvoices } from "./cards";
import { expectedCompensationBetween } from "./compensation";
import { receivablesOverview } from "./sales";
import { financeAccess } from "./common";

/**
 * Regras de cálculo (sem contagem dupla):
 * - Receitas/despesas por COMPETÊNCIA (mês a que pertencem).
 * - Cartão: a despesa é a parcela, no mês de vencimento da fatura. O pagamento da
 *   fatura é transferência e não entra como despesa.
 * - Pessoal: remuneração TURBO prevista entra como "prevista"; quando recebida, vira
 *   receita realizada (uma só). Retiradas da Mentoria entram como receita pessoal.
 * - Mentoria: faturamento = vendas na data da venda; recebimento = dinheiro que entrou.
 *   O recebimento de parcela nunca soma de novo no faturamento.
 */

const monthsBetween = (from: string, to: string) => {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonthsYm(m, 1)) out.push(m);
  return out;
};
const ymOfDate = (d: Date) => dateToYmd(d).slice(0, 7);

// ═══════════════════════════════════════════════════════════════
// Totais mensais (Pessoal)
// ═══════════════════════════════════════════════════════════════

export type PersonalMonth = {
  month: string;
  incomeRealized: number;
  incomePlanned: number;
  compensationExpected: number;
  distributions: number;
  expenseRealized: number;
  expensePlanned: number;
  cardExpense: number;
  incomeTotal: number;
  expenseTotal: number;
  result: number;
  resultRealized: number;
};

async function cardInstallmentsByMonth(workspaceIds: string[], fromMonth: string, toMonth: string) {
  const rows = await db.installment.findMany({
    where: {
      purchase: { deletedAt: null, card: { workspaceId: { in: workspaceIds } } },
      invoice: { referenceMonth: { gte: ymdToDate(`${fromMonth}-01`), lte: ymdToDate(`${toMonth}-01`) } },
    },
    select: { amountCents: true, invoice: { select: { referenceMonth: true } }, purchase: { select: { category: { select: { id: true, name: true, color: true, costType: true } } } } },
  });
  return rows.map((r) => ({ month: ymOfDate(r.invoice.referenceMonth), amountCents: r.amountCents, category: r.purchase.category }));
}

export async function personalMonthly(userId: string, workspace: Pick<Workspace, "id" | "kind">, fromMonth: string, toMonth: string): Promise<PersonalMonth[]> {
  const from = ymdToDate(`${fromMonth}-01`);
  const to = ymdToDate(endOfMonthYmd(`${toMonth}-01`));
  const [txs, cards, distributions, comp] = await Promise.all([
    db.financialTransaction.findMany({
      where: { workspaceId: workspace.id, deletedAt: null, status: { not: "CANCELLED" }, competenceDate: { gte: from, lte: to } },
      select: { type: true, status: true, amountCents: true, competenceDate: true },
    }),
    cardInstallmentsByMonth([workspace.id], fromMonth, toMonth),
    db.transfer.findMany({
      where: { toWorkspaceId: workspace.id, kind: "DISTRIBUTION", status: "REALIZED", deletedAt: null, date: { gte: from, lte: to } },
      select: { amountCents: true, date: true },
    }),
    workspace.kind === "PESSOAL" ? expectedCompensationBetween(userId, from, to) : Promise.resolve([]),
  ]);
  return monthsBetween(fromMonth, toMonth).map((m) => {
    const t = txs.filter((x) => ymOfDate(x.competenceDate) === m);
    const s = (type: string, status: string) => t.filter((x) => x.type === type && x.status === status).reduce((a, x) => a + x.amountCents, 0);
    const incomeRealized = s("INCOME", "REALIZED");
    const incomePlanned = s("INCOME", "PLANNED");
    const expenseRealized = s("EXPENSE", "REALIZED");
    const expensePlanned = s("EXPENSE", "PLANNED");
    const cardExpense = cards.filter((c) => c.month === m).reduce((a, c) => a + c.amountCents, 0);
    const dist = distributions.filter((d) => ymOfDate(d.date) === m).reduce((a, d) => a + d.amountCents, 0);
    const compensationExpected = comp.filter((c) => ymOfDate(c.expectedDate ?? c.referenceMonth) === m).reduce((a, c) => a + c.expectedCents, 0);
    const incomeTotal = incomeRealized + incomePlanned + compensationExpected + dist;
    const expenseTotal = expenseRealized + expensePlanned + cardExpense;
    return {
      month: m,
      incomeRealized,
      incomePlanned,
      compensationExpected,
      distributions: dist,
      expenseRealized,
      expensePlanned,
      cardExpense,
      incomeTotal,
      expenseTotal,
      result: incomeTotal - expenseTotal,
      resultRealized: incomeRealized + dist - expenseRealized - cardExpense,
    };
  });
}

/** Despesas do mês por categoria (lançamentos + cartões). */
export async function expensesByCategory(workspaceId: string, month: string) {
  const from = ymdToDate(`${month}-01`);
  const to = ymdToDate(endOfMonthYmd(`${month}-01`));
  const [txs, cards] = await Promise.all([
    db.financialTransaction.findMany({
      where: { workspaceId, type: "EXPENSE", deletedAt: null, status: { not: "CANCELLED" }, competenceDate: { gte: from, lte: to } },
      select: { amountCents: true, category: { select: { id: true, name: true, color: true } } },
    }),
    cardInstallmentsByMonth([workspaceId], month, month),
  ]);
  const map = new Map<string, { id: string | null; name: string; color: string | null; amountCents: number }>();
  for (const r of [...txs, ...cards]) {
    const key = r.category?.id ?? "none";
    const cur = map.get(key) ?? { id: r.category?.id ?? null, name: r.category?.name ?? "Sem categoria", color: r.category?.color ?? null, amountCents: 0 };
    cur.amountCents += r.amountCents;
    map.set(key, cur);
  }
  return [...map.values()].filter((c) => c.amountCents !== 0).sort((a, b) => b.amountCents - a.amountCents);
}

// ═══════════════════════════════════════════════════════════════
// Contas a pagar / a receber
// ═══════════════════════════════════════════════════════════════

export type DueItem = {
  key: string;
  kind: "transaction" | "invoice" | "compensation" | "receivable";
  id: string;
  label: string;
  dueDate: string;
  amountCents: number;
  overdue: boolean;
  href: string;
};

export async function payables(userId: string, workspaceId: string, tz: string, horizonDays = 30): Promise<DueItem[]> {
  await financeAccess(userId, workspaceId);
  const today = todayYmd(tz);
  const until = ymdToDate(addDaysYmd(today, horizonDays));
  const [txs, cards] = await Promise.all([
    db.financialTransaction.findMany({
      where: { workspaceId, type: "EXPENSE", status: "PLANNED", deletedAt: null, OR: [{ dueDate: { lte: until } }, { dueDate: null, competenceDate: { lte: until } }] },
      select: { id: true, description: true, seriesIndex: true, seriesTotal: true, nature: true, amountCents: true, dueDate: true, competenceDate: true },
    }),
    listCards(userId, workspaceId, tz),
  ]);
  const items: DueItem[] = txs.map((t) => {
    const due = dateToYmd(t.dueDate ?? t.competenceDate);
    const label = t.nature === "INSTALLMENT" && t.seriesIndex ? `${t.description} (${t.seriesIndex}/${t.seriesTotal})` : t.description;
    return { key: `tx:${t.id}`, kind: "transaction", id: t.id, label, dueDate: due, amountCents: t.amountCents, overdue: due < today, href: `?aba=lancamentos&mes=${due.slice(0, 7)}` };
  });
  for (const c of cards) {
    for (const inv of await listInvoices(userId, c.id, tz)) {
      if (inv.remainingCents <= 0 || inv.dueDate > dateToYmd(until) || inv.state === "OPEN") continue;
      items.push({ key: `inv:${inv.id}`, kind: "invoice", id: inv.id, label: `Fatura ${c.name}`, dueDate: inv.dueDate, amountCents: inv.remainingCents, overdue: inv.dueDate < today, href: `?aba=cartoes&cartao=${c.id}&fatura=${inv.id}` });
    }
  }
  return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export async function receivablesList(userId: string, workspace: Pick<Workspace, "id" | "kind">, tz: string, horizonDays = 45): Promise<DueItem[]> {
  await financeAccess(userId, workspace.id);
  const today = todayYmd(tz);
  const until = ymdToDate(addDaysYmd(today, horizonDays));
  const txs = await db.financialTransaction.findMany({
    where: { workspaceId: workspace.id, type: "INCOME", status: "PLANNED", deletedAt: null, OR: [{ dueDate: { lte: until } }, { dueDate: null, competenceDate: { lte: until } }] },
    select: { id: true, description: true, amountCents: true, dueDate: true, competenceDate: true },
  });
  const items: DueItem[] = txs.map((t) => {
    const due = dateToYmd(t.dueDate ?? t.competenceDate);
    return { key: `tx:${t.id}`, kind: "transaction", id: t.id, label: t.description, dueDate: due, amountCents: t.amountCents, overdue: due < today, href: `?aba=lancamentos&mes=${due.slice(0, 7)}` };
  });
  if (workspace.kind === "PESSOAL") {
    for (const c of await expectedCompensationBetween(userId, new Date(0), until)) {
      const due = dateToYmd(c.expectedDate ?? c.referenceMonth);
      const label = `${c.kind === "SALARY" ? "Salário" : c.kind === "BONUS" ? "Bonificação" : c.description ?? "Remuneração"} TURBO · ${dateToYmd(c.referenceMonth).slice(5, 7)}/${dateToYmd(c.referenceMonth).slice(0, 4)}`;
      items.push({ key: `comp:${c.id}`, kind: "compensation", id: c.id, label, dueDate: due, amountCents: c.expectedCents, overdue: due < today, href: "/turbo/remuneracao" });
    }
  }
  if (workspace.kind === "MENTORIA") {
    const r = await receivablesOverview([workspace.id], today);
    for (const p of r.pending.filter((x) => x.dueDate <= until)) {
      const due = dateToYmd(p.dueDate);
      items.push({ key: `rec:${p.id}`, kind: "receivable", id: p.id, label: `${p.sale.customerName ?? p.sale.description} · ${p.number}/${p.sale.installmentsCount}`, dueDate: due, amountCents: p.amountCents, overdue: due < today, href: `?aba=vendas&venda=${p.sale.id}` });
    }
  }
  return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

// ═══════════════════════════════════════════════════════════════
// Patrimônio e projeção
// ═══════════════════════════════════════════════════════════════

/** Saldo somado das contas no fim de cada mês (mês atual: hoje). */
export async function netWorthSeries(workspaceIds: string[], months: string[], today: string) {
  const accounts = await db.financialAccount.findMany({ where: { workspaceId: { in: workspaceIds } }, select: { id: true, type: true } });
  const ids = accounts.map((a) => a.id);
  const reserveIds = new Set(accounts.filter((a) => RESERVE_TYPES.includes(a.type)).map((a) => a.id));
  const out: { month: string; totalCents: number; reservesCents: number }[] = [];
  for (const m of months) {
    const end = endOfMonthYmd(`${m}-01`);
    if (`${m}-01` > today) break;
    const bal = await balancesFor(ids, end < today ? end : today);
    let total = 0;
    let reserves = 0;
    for (const [id, v] of bal) {
      total += v;
      if (reserveIds.has(id)) reserves += v;
    }
    out.push({ month: m, totalCents: total, reservesCents: reserves });
  }
  return out;
}

/**
 * Projeção de caixa: saldo atual + entradas previstas − saídas previstas, mês a mês.
 * Itens vencidos e não pagos entram no mês atual.
 */
export async function cashProjection(userId: string, workspace: Pick<Workspace, "id" | "kind">, tz: string, months = 6) {
  const today = todayYmd(tz);
  const current = today.slice(0, 7);
  const last = addMonthsYm(current, months - 1);
  const end = ymdToDate(endOfMonthYmd(`${last}-01`));
  const accounts = await db.financialAccount.findMany({ where: { workspaceId: workspace.id, archived: false }, select: { id: true } });
  const start = [...(await balancesFor(accounts.map((a) => a.id))).values()].reduce((a, b) => a + b, 0);

  const [txs, comp, receivables, cards] = await Promise.all([
    db.financialTransaction.findMany({
      where: { workspaceId: workspace.id, status: "PLANNED", deletedAt: null, OR: [{ dueDate: { lte: end } }, { dueDate: null, competenceDate: { lte: end } }] },
      select: { type: true, amountCents: true, dueDate: true, competenceDate: true },
    }),
    workspace.kind === "PESSOAL" ? expectedCompensationBetween(userId, new Date(0), end) : Promise.resolve([]),
    workspace.kind === "MENTORIA" ? receivablesOverview([workspace.id], today) : Promise.resolve(null),
    listCards(userId, workspace.id, tz),
  ]);
  const invoices = (await Promise.all(cards.map((c) => listInvoices(userId, c.id, tz)))).flat().filter((i) => i.remainingCents > 0);

  const bucket = (ymd: string) => (ymd.slice(0, 7) < current ? current : ymd.slice(0, 7));
  const rows = monthsBetween(current, last).map((m) => ({ month: m, inflow: 0, outflow: 0, balance: 0 }));
  const add = (ymd: string, inflow: number, outflow: number) => {
    const r = rows.find((x) => x.month === bucket(ymd));
    if (r) {
      r.inflow += inflow;
      r.outflow += outflow;
    }
  };
  for (const t of txs) {
    const d = dateToYmd(t.dueDate ?? t.competenceDate);
    if (t.type === "INCOME") add(d, t.amountCents, 0);
    else add(d, 0, t.amountCents);
  }
  for (const c of comp) add(dateToYmd(c.expectedDate ?? c.referenceMonth), c.expectedCents, 0);
  for (const r of receivables?.pending ?? []) add(dateToYmd(r.dueDate), r.amountCents, 0);
  for (const i of invoices) add(i.dueDate, 0, i.remainingCents);
  let balance = start;
  for (const r of rows) {
    balance += r.inflow - r.outflow;
    r.balance = balance;
  }
  return { startCents: start, rows };
}

// ═══════════════════════════════════════════════════════════════
// Mentoria
// ═══════════════════════════════════════════════════════════════

export type MentoriaMonth = {
  month: string;
  salesCount: number;
  salesCents: number;
  otherIncomeCents: number;
  revenueCents: number;
  receiptsCents: number;
  expensesCents: number;
  fixedCents: number;
  variableCents: number;
  commissionCents: number;
  refundCents: number;
  otherExpenseCents: number;
  profitCents: number;
  paidOutCents: number;
  distributionsCents: number;
  contributionsCents: number;
  cashFlowCents: number;
};

export async function mentoriaMonthly(workspaceId: string, fromMonth: string, toMonth: string): Promise<MentoriaMonth[]> {
  const from = ymdToDate(`${fromMonth}-01`);
  const to = ymdToDate(endOfMonthYmd(`${toMonth}-01`));
  const accountIds = (await db.financialAccount.findMany({ where: { workspaceId }, select: { id: true } })).map((a) => a.id);
  const [sales, compTxs, cashTxs, cards, transfersOut, transfersIn] = await Promise.all([
    db.sale.findMany({ where: { workspaceId, deletedAt: null, status: { not: "CANCELLED" }, saleDate: { gte: from, lte: to } }, select: { totalCents: true, saleDate: true } }),
    db.financialTransaction.findMany({
      where: { workspaceId, deletedAt: null, status: { not: "CANCELLED" }, competenceDate: { gte: from, lte: to } },
      select: { type: true, amountCents: true, competenceDate: true, receivableId: true, category: { select: { costType: true } } },
    }),
    db.financialTransaction.findMany({
      where: { workspaceId, deletedAt: null, status: "REALIZED", paidAt: { gte: from, lte: to } },
      select: { type: true, amountCents: true, paidAt: true },
    }),
    cardInstallmentsByMonth([workspaceId], fromMonth, toMonth),
    db.transfer.findMany({
      where: { fromAccountId: { in: accountIds }, deletedAt: null, status: "REALIZED", date: { gte: from, lte: to }, OR: [{ kind: "CARD_PAYMENT" }, { toWorkspaceId: { not: workspaceId } }] },
      select: { kind: true, amountCents: true, date: true },
    }),
    db.transfer.findMany({
      where: { toAccountId: { in: accountIds }, fromWorkspaceId: { not: workspaceId }, deletedAt: null, status: "REALIZED", date: { gte: from, lte: to } },
      select: { amountCents: true, date: true },
    }),
  ]);
  return monthsBetween(fromMonth, toMonth).map((m) => {
    const inM = <T extends { [k: string]: unknown }>(rows: T[], key: keyof T) => rows.filter((r) => ymOfDate(r[key] as Date) === m);
    const s = inM(sales, "saleDate");
    const ct = inM(compTxs, "competenceDate");
    const cash = inM(cashTxs, "paidAt");
    const cardRows = cards.filter((c) => c.month === m);
    const expenseRows = [
      ...ct.filter((t) => t.type === "EXPENSE").map((t) => ({ amount: t.amountCents, costType: t.category?.costType ?? null })),
      ...cardRows.map((c) => ({ amount: c.amountCents, costType: c.category?.costType ?? null })),
    ];
    const byCost = (type: string | null) => expenseRows.filter((e) => (type === "OTHER" ? !e.costType || e.costType === "OTHER" : e.costType === type)).reduce((a, e) => a + e.amount, 0);
    const salesCents = s.reduce((a, x) => a + x.totalCents, 0);
    // Outras receitas: entradas que não vêm de parcelas de vendas (essas já estão no faturamento)
    const otherIncomeCents = ct.filter((t) => t.type === "INCOME" && !t.receivableId).reduce((a, t) => a + t.amountCents, 0);
    const expensesCents = expenseRows.reduce((a, e) => a + e.amount, 0);
    const receiptsCents = cash.filter((t) => t.type === "INCOME").reduce((a, t) => a + t.amountCents, 0);
    const outs = inM(transfersOut, "date");
    const cardPayments = outs.filter((t) => t.kind === "CARD_PAYMENT").reduce((a, t) => a + t.amountCents, 0);
    const paidOutCents = cash.filter((t) => t.type === "EXPENSE").reduce((a, t) => a + t.amountCents, 0) + cardPayments;
    const distributionsCents = outs.filter((t) => t.kind !== "CARD_PAYMENT").reduce((a, t) => a + t.amountCents, 0);
    const contributionsCents = inM(transfersIn, "date").reduce((a, t) => a + t.amountCents, 0);
    const revenueCents = salesCents + otherIncomeCents;
    return {
      month: m,
      salesCount: s.length,
      salesCents,
      otherIncomeCents,
      revenueCents,
      receiptsCents,
      expensesCents,
      fixedCents: byCost("FIXED"),
      variableCents: byCost("VARIABLE"),
      commissionCents: byCost("COMMISSION"),
      refundCents: byCost("REFUND"),
      otherExpenseCents: byCost("OTHER"),
      profitCents: revenueCents - expensesCents,
      paidOutCents,
      distributionsCents,
      contributionsCents,
      cashFlowCents: receiptsCents + contributionsCents - paidOutCents - distributionsCents,
    };
  });
}
