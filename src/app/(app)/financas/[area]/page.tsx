import { notFound } from "next/navigation";
import { Wallet } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { EmptyState } from "@/components/ui/misc";
import { findFinanceWorkspace, monthRange } from "@/server/finance/common";
import { listAccounts, listTransfers, transferTargets } from "@/server/finance/accounts";
import { listCategories } from "@/server/finance/categories";
import { listTransactions, type TransactionFilters } from "@/server/finance/transactions";
import { getInvoice, listCards, listInvoices, listPurchases } from "@/server/finance/cards";
import { listPrograms, listSales, receivablesOverview } from "@/server/finance/sales";
import { cashProjection, expensesByCategory, mentoriaMonthly, netWorthSeries, payables, personalMonthly, receivablesList } from "@/server/finance/summary";
import { addMonthsYm, isValidYm, todayYmd } from "@/lib/dates";
import { FinanceShell, type FinanceTab } from "./finance-shell";
import { OverviewPersonal, OverviewMentoria } from "./overview";
import { TransactionsTab } from "./transactions-tab";
import { AccountsTab } from "./accounts-tab";
import { CardsTab } from "./cards-tab";
import { CategoriesTab } from "./categories-tab";
import { SalesTab } from "./sales-tab";

export const metadata = { title: "Financeiro" };

const AREAS = { pessoal: "PESSOAL", mentoria: "MENTORIA" } as const;

export default async function FinancePage({ params, searchParams }: { params: Promise<{ area: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { area } = await params;
  const kind = AREAS[area as keyof typeof AREAS];
  if (!kind) notFound();
  const user = await requireUser();
  const sp = await searchParams;
  const ws = await findFinanceWorkspace(user.id, kind);
  if (!ws) return <EmptyState icon={Wallet} title="Sem acesso ao financeiro" description="Você não tem permissão para o financeiro deste ambiente." />;

  const tz = user.timezone;
  const today = todayYmd(tz);
  const month = sp.mes && isValidYm(sp.mes) ? sp.mes : today.slice(0, 7);
  const tabs: FinanceTab[] = kind === "MENTORIA" ? ["visao", "vendas", "lancamentos", "contas", "cartoes", "categorias"] : ["visao", "lancamentos", "contas", "cartoes", "categorias"];
  const tab: FinanceTab = tabs.includes(sp.aba as FinanceTab) ? (sp.aba as FinanceTab) : "visao";

  const [accounts, categories, targets] = await Promise.all([
    listAccounts(user.id, ws.id, { includeArchived: tab === "contas" }),
    listCategories(user.id, ws.id, { includeArchived: tab === "categorias" }),
    transferTargets(user.id),
  ]);
  const base = { workspace: { id: ws.id, name: ws.name, kind: ws.kind, color: ws.color }, accounts, categories, month, today, tz };

  let content: React.ReactNode = null;

  if (tab === "visao") {
    const first = addMonthsYm(month, -11);
    const [series, cats, pay, rec, netWorth, projection, cards] = await Promise.all([
      kind === "PESSOAL" ? personalMonthly(user.id, ws, first, month) : Promise.resolve(null),
      expensesByCategory(ws.id, month),
      payables(user.id, ws.id, tz),
      receivablesList(user.id, ws, tz),
      netWorthSeries([ws.id], Array.from({ length: 12 }, (_, i) => addMonthsYm(first, i)), today),
      cashProjection(user.id, ws, tz, 6),
      listCards(user.id, ws.id, tz),
    ]);
    if (kind === "PESSOAL") {
      content = <OverviewPersonal {...base} series={series!} categoriesSpend={cats} payables={pay} receivables={rec} netWorth={netWorth} projection={projection} cards={cards} />;
    } else {
      const [mSeries, recOverview] = await Promise.all([mentoriaMonthly(ws.id, first, month), receivablesOverview([ws.id], today)]);
      content = (
        <OverviewMentoria
          {...base}
          series={mSeries}
          categoriesSpend={cats}
          payables={pay}
          receivables={rec}
          netWorth={netWorth}
          projection={projection}
          receivableTotals={{ pendingCents: recOverview.pendingCents, overdueCents: recOverview.overdueCents, overdueCount: recOverview.overdue.length }}
        />
      );
    }
  }

  if (tab === "lancamentos") {
    const filters: TransactionFilters = {
      month,
      type: sp.tipo === "INCOME" || sp.tipo === "EXPENSE" ? sp.tipo : undefined,
      status: sp.situacao === "PLANNED" || sp.situacao === "REALIZED" || sp.situacao === "OVERDUE" ? sp.situacao : undefined,
      categoryId: sp.categoria,
      accountId: sp.conta,
      search: sp.q,
    };
    const { from, to } = monthRange(month);
    const [rows, transfers, cards, totals] = await Promise.all([
      listTransactions(user.id, ws.id, filters, tz),
      listTransfers(user.id, ws.id, from, to),
      listCards(user.id, ws.id, tz),
      kind === "PESSOAL" ? personalMonthly(user.id, ws, month, month).then((r) => r[0]!) : mentoriaMonthly(ws.id, month, month).then((r) => r[0]!),
    ]);
    // Faturas que vencem no mês (despesa do cartão nesta competência)
    const monthInvoices = (await Promise.all(cards.map(async (c) => (await listInvoices(user.id, c.id, tz)).filter((i) => i.referenceMonth.startsWith(month)).map((i) => ({ ...i, cardId: c.id, cardName: c.name }))))).flat();
    content = <TransactionsTab {...base} rows={rows} transfers={transfers} invoices={monthInvoices} totals={totals} targets={targets} />;
  }

  if (tab === "contas") {
    const { from, to } = monthRange(month);
    const transfers = await listTransfers(user.id, ws.id, from, to);
    content = <AccountsTab {...base} transfers={transfers} targets={targets} />;
  }

  if (tab === "cartoes") {
    const cards = await listCards(user.id, ws.id, tz, { includeArchived: sp.arquivados === "1" });
    const selected = cards.find((c) => c.id === sp.cartao) ?? cards.find((c) => !c.archived) ?? null;
    let invoices: Awaited<ReturnType<typeof listInvoices>> = [];
    let invoice: Awaited<ReturnType<typeof getInvoice>> | null = null;
    let purchases: Awaited<ReturnType<typeof listPurchases>> = [];
    if (selected) {
      [invoices, purchases] = await Promise.all([listInvoices(user.id, selected.id, tz), listPurchases(user.id, selected.id, { take: 300 })]);
      const target = invoices.find((i) => i.id === sp.fatura) ?? selected.nextDueInvoice ?? selected.currentInvoice ?? invoices[invoices.length - 1];
      if (target) invoice = await getInvoice(user.id, target.id, tz);
    }
    content = <CardsTab {...base} cards={cards} selectedId={selected?.id ?? null} invoices={invoices} invoice={invoice} purchases={purchases} />;
  }

  if (tab === "categorias") content = <CategoriesTab {...base} />;

  if (tab === "vendas") {
    const from = sp.periodo === "todas" ? undefined : `${month}-01`;
    const to = sp.periodo === "todas" ? undefined : monthRange(month).to.toISOString().slice(0, 10);
    const [salesRows, programs, rec] = await Promise.all([
      listSales(user.id, ws.id, { from, to, status: sp.situacao, search: sp.q }, tz),
      listPrograms(user.id, ws.id),
      receivablesOverview([ws.id], today),
    ]);
    content = (
      <SalesTab
        {...base}
        sales={salesRows}
        programs={programs}
        allPeriods={sp.periodo === "todas"}
        overdue={rec.overdue.map((r) => ({ id: r.id, saleId: r.sale.id, customer: r.sale.customerName ?? r.sale.description, number: r.number, total: r.sale.installmentsCount, dueDate: r.dueDate.toISOString().slice(0, 10), amountCents: r.amountCents }))}
        pendingCents={rec.pendingCents}
        overdueCents={rec.overdueCents}
        openSaleId={sp.venda ?? null}
      />
    );
  }

  return (
    <FinanceShell area={area as "pessoal" | "mentoria"} title={kind === "PESSOAL" ? "Finanças pessoais" : "Financeiro da Mentoria"} workspace={base.workspace} tabs={tabs} tab={tab} month={month} today={today}>
      {content}
    </FinanceShell>
  );
}
