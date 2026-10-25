"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AlertTriangle, CreditCard, Landmark, PiggyBank } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/finance/money-input";
import { CategoryBars } from "@/components/finance/charts";
import { formatBRL } from "@/lib/money";
import { formatYm } from "@/lib/dates";
import { INVOICE_STATE_LABEL } from "@/lib/finance/card-cycle";
import { cn } from "@/lib/utils";
import type { CardSummary } from "@/server/finance/cards";
import type { DueItem, MentoriaMonth, PersonalMonth } from "@/server/finance/summary";
import { useFinanceHref } from "./finance-shell";
import { ymdBR, type FinanceBase } from "./types";

const InOutBars = dynamic(() => import("@/components/finance/charts").then((m) => m.InOutBars), { ssr: false, loading: () => <div className="h-60 animate-pulse rounded-lg bg-muted" /> });
const MoneyLine = dynamic(() => import("@/components/finance/charts").then((m) => m.MoneyLine), { ssr: false, loading: () => <div className="h-56 animate-pulse rounded-lg bg-muted" /> });

type Common = FinanceBase & {
  categoriesSpend: { id: string | null; name: string; color: string | null; amountCents: number }[];
  payables: DueItem[];
  receivables: DueItem[];
  netWorth: { month: string; totalCents: number; reservesCents: number }[];
  projection: { startCents: number; rows: { month: string; inflow: number; outflow: number; balance: number }[] };
};

function Kpi({ label, children, hint, href }: { label: string; children: React.ReactNode; hint?: React.ReactNode; href?: string }) {
  const body = (
    <div className="grid gap-0.5 rounded-xl border border-border bg-card px-4 py-3 transition-shadow hover:shadow-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
  return href ? <Link href={href} scroll={false}>{body}</Link> : body;
}

function DueList({ title, items, empty, tone }: { title: string; items: DueItem[]; empty: string; tone: "in" | "out" }) {
  const href = useFinanceHref();
  const total = items.reduce((s, i) => s + i.amountCents, 0);
  const overdue = items.filter((i) => i.overdue);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>Vencidos e próximos dias · total {formatBRL(total)}</CardDescription>
        </div>
        {overdue.length > 0 && <Badge variant="danger"><AlertTriangle className="size-3" /> {overdue.length} vencido(s)</Badge>}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="grid gap-1.5">
            {items.slice(0, 10).map((i) => {
              const link = i.href.startsWith("?") ? href(Object.fromEntries(new URLSearchParams(i.href.slice(1)))) : i.href;
              return (
                <li key={i.key} className="flex items-center gap-3 text-sm">
                  <span className={cn("w-12 shrink-0 tabular text-xs", i.overdue ? "font-medium text-danger" : "text-muted-foreground")}>{ymdBR(i.dueDate).slice(0, 5)}</span>
                  <Link href={link} scroll={false} className="min-w-0 flex-1 truncate hover:underline">{i.label}</Link>
                  <Money cents={i.amountCents} tone={tone} />
                </li>
              );
            })}
            {items.length > 10 && <li className="text-xs text-muted-foreground">+ {items.length - 10} itens</li>}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Accounts({ accounts }: { accounts: FinanceBase["accounts"] }) {
  const href = useFinanceHref();
  const active = accounts.filter((a) => !a.archived);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Saldo por conta</CardTitle>
        <Link href={href({ aba: "contas" })} scroll={false} className="text-xs text-primary hover:underline">Gerenciar</Link>
      </CardHeader>
      <CardContent>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma conta cadastrada. <Link href={href({ aba: "contas" })} className="text-primary hover:underline">Cadastrar</Link></p>
        ) : (
          <ul className="grid gap-2">
            {active.map((a) => (
              <li key={a.id} className="flex items-center gap-3 text-sm">
                {a.isReserve ? <PiggyBank className="size-4 text-muted-foreground" /> : <Landmark className="size-4 text-muted-foreground" />}
                <span className="flex-1 truncate">{a.name}</span>
                <Money cents={a.balanceCents} tone="auto" className="font-medium" />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Projection({ projection, netWorth }: { projection: Common["projection"]; netWorth: Common["netWorth"] }) {
  const series = [...netWorth.slice(0, -1).map((n) => ({ month: n.month, cents: n.totalCents })), ...projection.rows.map((r) => ({ month: r.month, cents: r.balance }))];
  const dashedFrom = Math.max(0, netWorth.length - 1);
  const negative = projection.rows.find((r) => r.balance < 0);
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Evolução e projeção do saldo</CardTitle>
        <CardDescription>
          Linha contínua: saldo real no fim de cada mês. Tracejada: projeção com o que está previsto a receber e a pagar.
          {negative && <span className="ml-1 font-medium text-danger">Atenção: saldo projetado negativo em {formatYm(negative.month)}.</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {series.length < 2 ? <p className="text-sm text-muted-foreground">Cadastre contas para acompanhar a evolução.</p> : <MoneyLine data={series} label="Saldo" caption="Saldo real e projetado por mês" dashedFrom={dashedFrom} />}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr><th className="py-1 text-left font-medium">Mês</th><th className="py-1 text-right font-medium">Entradas previstas</th><th className="py-1 text-right font-medium">Saídas previstas</th><th className="py-1 text-right font-medium">Saldo projetado</th></tr>
            </thead>
            <tbody>
              {projection.rows.map((r) => (
                <tr key={r.month} className="border-t border-border">
                  <td className="py-1 capitalize">{formatYm(r.month, true)}</td>
                  <td className="py-1 text-right tabular">{formatBRL(r.inflow)}</td>
                  <td className="py-1 text-right tabular">{formatBRL(r.outflow)}</td>
                  <td className={cn("py-1 text-right tabular font-medium", r.balance < 0 && "text-danger")}>{formatBRL(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════

export function OverviewPersonal({ series, cards, ...p }: Common & { series: PersonalMonth[]; cards: CardSummary[] }) {
  const href = useFinanceHref();
  const m = series[series.length - 1]!;
  const total = p.accounts.filter((a) => !a.archived).reduce((s, a) => s + a.balanceCents, 0);
  const reserves = p.accounts.filter((a) => !a.archived && a.isReserve).reduce((s, a) => s + a.balanceCents, 0);
  const openCards = cards.filter((c) => !c.archived);
  return (
    <div className="grid gap-5">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Indicadores do mês">
        <Kpi label="Receitas do mês" hint={<>recebido {formatBRL(m.incomeRealized + m.distributions)} · previsto {formatBRL(m.incomePlanned + m.compensationExpected)}</>} href={href({ aba: "lancamentos", tipo: "INCOME" })}>
          <Money cents={m.incomeTotal} tone="in" className="text-xl font-semibold" />
        </Kpi>
        <Kpi label="Despesas do mês" hint={<>pago {formatBRL(m.expenseRealized)} · previsto {formatBRL(m.expensePlanned)} · cartões {formatBRL(m.cardExpense)}</>} href={href({ aba: "lancamentos", tipo: "EXPENSE" })}>
          <Money cents={m.expenseTotal} tone="out" className="text-xl font-semibold" />
        </Kpi>
        <Kpi label="Resultado do mês" hint={<>realizado até agora: {formatBRL(m.resultRealized)}</>}>
          <Money cents={m.result} tone="auto" className="text-xl font-semibold" />
        </Kpi>
        <Kpi label="Saldo nas contas" href={href({ aba: "contas" })}><Money cents={total} tone="auto" className="text-xl font-semibold" /></Kpi>
        <Kpi label="Reservas" hint="poupança e investimentos" href={href({ aba: "contas" })}><Money cents={reserves} className="text-xl font-semibold" /></Kpi>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Receitas × despesas (12 meses)</CardTitle>
            <CardDescription>Por competência. Inclui previstos, faturas de cartão e retiradas da Mentoria.</CardDescription>
          </CardHeader>
          <CardContent>
            <InOutBars data={series.map((s) => ({ month: s.month, inCents: s.incomeTotal, outCents: s.expenseTotal }))} caption="Receitas e despesas por mês" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gastos por categoria</CardTitle>
            <CardDescription className="capitalize">{formatYm(p.month)}</CardDescription>
          </CardHeader>
          <CardContent><CategoryBars items={p.categoriesSpend} /></CardContent>
        </Card>

        <Accounts accounts={p.accounts} />
        <DueList title="Contas a pagar" items={p.payables} empty="Nada a pagar nos próximos 30 dias." tone="out" />
        <DueList title="Contas a receber" items={p.receivables} empty="Nada previsto para receber." tone="in" />

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Faturas</CardTitle>
            <Link href={href({ aba: "cartoes" })} scroll={false} className="text-xs text-primary hover:underline">Cartões</Link>
          </CardHeader>
          <CardContent>
            {openCards.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum cartão cadastrado.</p>
            ) : (
              <ul className="grid gap-2">
                {openCards.map((c) => {
                  const inv = c.nextDueInvoice ?? c.currentInvoice;
                  return (
                    <li key={c.id} className="flex items-center gap-3 text-sm">
                      <CreditCard className="size-4 text-muted-foreground" />
                      <Link href={href({ aba: "cartoes", cartao: c.id })} scroll={false} className="flex-1 truncate hover:underline">{c.name}</Link>
                      {inv ? (
                        <span className="text-right">
                          <Money cents={inv.remainingCents || inv.totalCents} className="font-medium" />
                          <span className="block text-[11px] text-muted-foreground">{INVOICE_STATE_LABEL[inv.state]} · vence {ymdBR(inv.dueDate).slice(0, 5)}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">sem fatura</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Evolução patrimonial</CardTitle>
            <CardDescription>Soma dos saldos no fim de cada mês</CardDescription>
          </CardHeader>
          <CardContent>
            {p.netWorth.length < 2 ? (
              <p className="text-sm text-muted-foreground">O histórico aparece a partir do segundo mês com contas.</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {p.netWorth.slice(-6).map((n) => (
                  <li key={n.month} className="flex justify-between">
                    <span className="capitalize text-muted-foreground">{formatYm(n.month, true)}</span>
                    <span><Money cents={n.totalCents} tone="auto" /> <span className="text-xs text-muted-foreground">· reservas {formatBRL(n.reservesCents)}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Projection projection={p.projection} netWorth={p.netWorth} />
      </div>
      <p className="text-xs text-muted-foreground">
        Metas de economia ficam no módulo de Metas (próxima fase), calculadas a partir destes mesmos dados.
      </p>
    </div>
  );
}

export function OverviewMentoria({ series, receivableTotals, ...p }: Common & { series: MentoriaMonth[]; receivableTotals: { pendingCents: number; overdueCents: number; overdueCount: number } }) {
  const href = useFinanceHref();
  const m = series[series.length - 1]!;
  const total = p.accounts.filter((a) => !a.archived).reduce((s, a) => s + a.balanceCents, 0);
  const year = series.filter((s) => s.month.startsWith(p.month.slice(0, 4)));
  const ytd = year.reduce((t, s) => ({ revenue: t.revenue + s.revenueCents, profit: t.profit + s.profitCents, receipts: t.receipts + s.receiptsCents }), { revenue: 0, profit: 0, receipts: 0 });
  const ticket = m.salesCount ? Math.round(m.salesCents / m.salesCount) : null;
  return (
    <div className="grid gap-5">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-6" aria-label="Indicadores do mês">
        <Kpi label="Faturamento" hint={`${m.salesCount} venda(s)${ticket ? ` · ticket médio ${formatBRL(ticket)}` : ""}`} href={href({ aba: "vendas" })}><Money cents={m.revenueCents} tone="in" className="text-xl font-semibold" /></Kpi>
        <Kpi label="Recebimentos" hint="dinheiro que entrou"><Money cents={m.receiptsCents} tone="in" className="text-xl font-semibold" /></Kpi>
        <Kpi label="Despesas" hint={`fixas ${formatBRL(m.fixedCents)} · variáveis ${formatBRL(m.variableCents)}`}><Money cents={m.expensesCents} tone="out" className="text-xl font-semibold" /></Kpi>
        <Kpi label="Lucro" hint="faturamento − despesas"><Money cents={m.profitCents} tone="auto" className="text-xl font-semibold" /></Kpi>
        <Kpi label="Fluxo de caixa" hint={m.distributionsCents ? `retiradas ${formatBRL(m.distributionsCents)}` : "entradas − saídas"}><Money cents={m.cashFlowCents} tone="auto" className="text-xl font-semibold" /></Kpi>
        <Kpi label="A receber" hint={receivableTotals.overdueCount ? <span className="text-danger">{receivableTotals.overdueCount} vencida(s): {formatBRL(receivableTotals.overdueCents)}</span> : "sem inadimplência"} href={href({ aba: "vendas", periodo: "todas" })}>
          <Money cents={receivableTotals.pendingCents} className="text-xl font-semibold" />
        </Kpi>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Faturamento × despesas (12 meses)</CardTitle>
            <CardDescription>
              No ano: faturamento {formatBRL(ytd.revenue)} · recebido {formatBRL(ytd.receipts)} · lucro {formatBRL(ytd.profit)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InOutBars data={series.map((s) => ({ month: s.month, inCents: s.revenueCents, outCents: s.expensesCents }))} inLabel="Faturamento" outLabel="Despesas" caption="Faturamento e despesas por mês" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Composição das despesas</CardTitle>
            <CardDescription className="capitalize">{formatYm(p.month)}</CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryBars
              items={[
                { name: "Custos fixos", amountCents: m.fixedCents },
                { name: "Custos variáveis", amountCents: m.variableCents },
                { name: "Comissões", amountCents: m.commissionCents },
                { name: "Reembolsos", amountCents: m.refundCents },
                { name: "Outras despesas", amountCents: m.otherExpenseCents },
              ].filter((i) => i.amountCents !== 0)}
            />
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-muted-foreground">Por categoria</summary>
              <div className="mt-2"><CategoryBars items={p.categoriesSpend} /></div>
            </details>
          </CardContent>
        </Card>

        <Accounts accounts={p.accounts} />
        <DueList title="Parcelas a receber" items={p.receivables} empty="Nenhuma parcela a receber." tone="in" />
        <DueList title="Contas a pagar" items={p.payables} empty="Nada a pagar nos próximos 30 dias." tone="out" />

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Relatório mensal</CardTitle>
            <CardDescription>Faturamento por competência, recebimentos por caixa. Retiradas não reduzem o lucro.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  {["Mês", "Vendas", "Faturamento", "Recebido", "Despesas", "Lucro", "Retiradas", "Fluxo de caixa"].map((h, i) => (
                    <th key={h} className={cn("py-1 font-medium", i === 0 ? "text-left" : "text-right")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...series].reverse().map((s) => (
                  <tr key={s.month} className="border-t border-border">
                    <td className="py-1 capitalize">{formatYm(s.month, true)}</td>
                    <td className="py-1 text-right tabular">{s.salesCount}</td>
                    <td className="py-1 text-right tabular">{formatBRL(s.revenueCents)}</td>
                    <td className="py-1 text-right tabular">{formatBRL(s.receiptsCents)}</td>
                    <td className="py-1 text-right tabular">{formatBRL(s.expensesCents)}</td>
                    <td className={cn("py-1 text-right tabular font-medium", s.profitCents < 0 && "text-danger")}>{formatBRL(s.profitCents)}</td>
                    <td className="py-1 text-right tabular">{formatBRL(s.distributionsCents)}</td>
                    <td className={cn("py-1 text-right tabular", s.cashFlowCents < 0 && "text-danger")}>{formatBRL(s.cashFlowCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Projection projection={p.projection} netWorth={p.netWorth} />
        <Card className="lg:col-span-2">
          <CardContent className="pt-5 text-sm text-muted-foreground">
            Saldo atual nas contas da Mentoria: <Money cents={total} tone="auto" className="font-medium text-foreground" />. Metas de faturamento chegam com o módulo de Metas, usando estes números.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
