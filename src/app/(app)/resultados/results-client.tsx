"use client";

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WsDot } from "@/components/ui/misc";
import { Money } from "@/components/finance/money-input";
import { formatBRL } from "@/lib/money";
import { addMonthsYm, formatYm } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { MentoriaMonth, PersonalMonth } from "@/server/finance/summary";

const InOutBars = dynamic(() => import("@/components/finance/charts").then((m) => m.InOutBars), { ssr: false, loading: () => <div className="h-56 animate-pulse rounded-lg bg-muted" /> });
const MoneyLine = dynamic(() => import("@/components/finance/charts").then((m) => m.MoneyLine), { ssr: false, loading: () => <div className="h-52 animate-pulse rounded-lg bg-muted" /> });

type CompMonthly = { month: string; totalExpected: number; totalReceived: number; salaryReceived: number; bonusReceived: number; pendingCents: number };

function Delta({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) {
  if (!previous && !current) return <span className="text-xs text-muted-foreground">—</span>;
  const diff = current - previous;
  const pct = previous ? Math.round((diff / Math.abs(previous)) * 100) : null;
  const good = invert ? diff < 0 : diff > 0;
  const Icon = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : ArrowRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs", diff === 0 ? "text-muted-foreground" : good ? "text-success" : "text-danger")}>
      <Icon className="size-3" /> {pct === null ? formatBRL(diff) : `${pct > 0 ? "+" : ""}${pct}%`} vs mês anterior
    </span>
  );
}

function Row({ label, value, prev, invert, tone, strong }: { label: string; value: number; prev?: number; invert?: boolean; tone?: "in" | "out" | "auto"; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right">
        <Money cents={value} tone={tone} className={cn(strong && "font-semibold")} />
        {prev !== undefined && <span className="block"><Delta current={value} previous={prev} invert={invert} /></span>}
      </span>
    </div>
  );
}

export function ResultsClient({
  year,
  focusMonth,
  turbo,
  pessoal,
  mentoria,
  netWorth,
}: {
  year: number;
  focusMonth: string;
  turbo: { name: string; color: string; monthly: CompMonthly[]; totals: { expected: number; received: number; pending: number } } | null;
  pessoal: { name: string; color: string; series: PersonalMonth[]; balanceCents: number; reservesCents: number } | null;
  mentoria: { name: string; color: string; series: MentoriaMonth[]; balanceCents: number; pendingCents: number; overdueCents: number } | null;
  netWorth: { month: string; totalCents: number; reservesCents: number }[];
}) {
  const prevMonth = addMonthsYm(focusMonth, -1);
  const pick = <T extends { month: string }>(rows: T[] | undefined, m: string) => rows?.find((r) => r.month === m);

  const t = pick(turbo?.monthly, focusMonth);
  const tp = pick(turbo?.monthly, prevMonth);
  const p = pick(pessoal?.series, focusMonth);
  const pp = pick(pessoal?.series, prevMonth);
  const m = pick(mentoria?.series, focusMonth);
  const mp = pick(mentoria?.series, prevMonth);

  const pYear = pessoal?.series.reduce((a, s) => ({ income: a.income + s.incomeTotal, expense: a.expense + s.expenseTotal, distributions: a.distributions + s.distributions }), { income: 0, expense: 0, distributions: 0 });
  const mYear = mentoria?.series.reduce((a, s) => ({ revenue: a.revenue + s.revenueCents, receipts: a.receipts + s.receiptsCents, expenses: a.expenses + s.expensesCents, profit: a.profit + s.profitCents, distributions: a.distributions + s.distributionsCents, cash: a.cash + s.cashFlowCents }), { revenue: 0, receipts: 0, expenses: 0, profit: 0, distributions: 0, cash: 0 });

  return (
    <div className="grid gap-6">
      <p className="flex items-start gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>
          Mês em foco: <strong className="capitalize text-foreground">{formatYm(focusMonth)}</strong>. A retirada da Mentoria aparece como saída no caixa da Mentoria e como receita no Pessoal: os números de cada ambiente não devem ser somados entre si.
          O patrimônio total soma apenas os saldos das contas, onde as transferências se anulam.
        </span>
      </p>

      <div className="grid gap-4 lg:grid-cols-3">
        {turbo && (
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><WsDot color={turbo.color} /> TURBO</CardTitle>
                <CardDescription>Somente sua remuneração</CardDescription>
              </div>
              <Link href="/turbo/remuneracao" className="text-xs text-primary hover:underline">Abrir</Link>
            </CardHeader>
            <CardContent>
              <Row label="Recebido no mês" value={t?.totalReceived ?? 0} prev={tp?.totalReceived ?? 0} tone="in" strong />
              <Row label="Previsto no mês" value={t?.totalExpected ?? 0} />
              <Row label="Bonificação recebida" value={t?.bonusReceived ?? 0} />
              <Row label={`Recebido em ${year}`} value={turbo.totals.received} strong />
              <Row label="A receber" value={turbo.totals.pending} />
            </CardContent>
          </Card>
        )}
        {mentoria && m && (
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><WsDot color={mentoria.color} /> Mentoria</CardTitle>
                <CardDescription>Resultado do negócio</CardDescription>
              </div>
              <Link href="/financas/mentoria" className="text-xs text-primary hover:underline">Abrir</Link>
            </CardHeader>
            <CardContent>
              <Row label="Faturamento" value={m.revenueCents} prev={mp?.revenueCents ?? 0} tone="in" />
              <Row label="Recebimentos" value={m.receiptsCents} prev={mp?.receiptsCents ?? 0} />
              <Row label="Despesas" value={m.expensesCents} prev={mp?.expensesCents ?? 0} invert tone="out" />
              <Row label="Lucro" value={m.profitCents} prev={mp?.profitCents ?? 0} tone="auto" strong />
              <Row label="Fluxo de caixa" value={m.cashFlowCents} tone="auto" />
              <Row label="A receber" value={mentoria.pendingCents} />
              {mentoria.overdueCents > 0 && <p className="mt-1 text-xs text-danger">Vencido: {formatBRL(mentoria.overdueCents)}</p>}
            </CardContent>
          </Card>
        )}
        {pessoal && p && (
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><WsDot color={pessoal.color} /> Pessoal</CardTitle>
                <CardDescription>Renda, despesas e patrimônio</CardDescription>
              </div>
              <Link href="/financas/pessoal" className="text-xs text-primary hover:underline">Abrir</Link>
            </CardHeader>
            <CardContent>
              <Row label="Receitas" value={p.incomeTotal} prev={pp?.incomeTotal ?? 0} tone="in" />
              <Row label="… das quais retiradas da Mentoria" value={p.distributions} />
              <Row label="Despesas" value={p.expenseTotal} prev={pp?.expenseTotal ?? 0} invert tone="out" />
              <Row label="Resultado" value={p.result} prev={pp?.result ?? 0} tone="auto" strong />
              <Row label="Saldo nas contas" value={pessoal.balanceCents} tone="auto" />
              <Row label="Reservas" value={pessoal.reservesCents} />
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {mentoria && (
          <Card>
            <CardHeader>
              <CardTitle>Mentoria · faturamento × despesas</CardTitle>
              <CardDescription>
                {year}: faturamento {formatBRL(mYear!.revenue)} · lucro {formatBRL(mYear!.profit)} · retiradas {formatBRL(mYear!.distributions)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InOutBars data={mentoria.series.map((s) => ({ month: s.month, inCents: s.revenueCents, outCents: s.expensesCents }))} inLabel="Faturamento" outLabel="Despesas" caption="Mentoria: faturamento e despesas por mês" />
            </CardContent>
          </Card>
        )}
        {pessoal && (
          <Card>
            <CardHeader>
              <CardTitle>Pessoal · receitas × despesas</CardTitle>
              <CardDescription>
                {year}: receitas {formatBRL(pYear!.income)} · despesas {formatBRL(pYear!.expense)} · resultado {formatBRL(pYear!.income - pYear!.expense)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InOutBars data={pessoal.series.map((s) => ({ month: s.month, inCents: s.incomeTotal, outCents: s.expenseTotal }))} caption="Pessoal: receitas e despesas por mês" />
            </CardContent>
          </Card>
        )}
        {turbo && (
          <Card>
            <CardHeader>
              <CardTitle>TURBO · remuneração</CardTitle>
              <CardDescription>Previsto × recebido por mês de referência</CardDescription>
            </CardHeader>
            <CardContent>
              <InOutBars data={turbo.monthly.map((s) => ({ month: s.month, inCents: s.totalReceived, outCents: s.totalExpected }))} inLabel="Recebido" outLabel="Previsto" showResult={false} caption="TURBO: remuneração prevista e recebida" />
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Patrimônio total</CardTitle>
            <CardDescription>Saldo das contas do Pessoal e da Mentoria no fim de cada mês</CardDescription>
          </CardHeader>
          <CardContent>
            {netWorth.length < 2 ? (
              <p className="text-sm text-muted-foreground">O histórico aparece a partir do segundo mês com contas cadastradas.</p>
            ) : (
              <MoneyLine data={netWorth.map((n) => ({ month: n.month, cents: n.totalCents }))} label="Patrimônio" caption="Patrimônio total por mês" />
            )}
            {netWorth.length > 0 && (
              <p className="mt-2 text-sm">
                Atual: <Money cents={netWorth[netWorth.length - 1]!.totalCents} tone="auto" className="font-semibold" /> · reservas {formatBRL(netWorth[netWorth.length - 1]!.reservesCents)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Histórico anual por ambiente</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 text-left font-medium">Mês</th>
                {turbo && <th className="py-1 text-right font-medium">TURBO recebido</th>}
                {mentoria && <><th className="py-1 text-right font-medium">Mentoria faturamento</th><th className="py-1 text-right font-medium">Mentoria lucro</th></>}
                {pessoal && <><th className="py-1 text-right font-medium">Pessoal receitas</th><th className="py-1 text-right font-medium">Pessoal despesas</th><th className="py-1 text-right font-medium">Pessoal resultado</th></>}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`).map((mo) => {
                const tt = pick(turbo?.monthly, mo);
                const mm = pick(mentoria?.series, mo);
                const pe = pick(pessoal?.series, mo);
                return (
                  <tr key={mo} className={cn("border-t border-border", mo === focusMonth && "bg-accent/40")}>
                    <td className="py-1 capitalize">{formatYm(mo, true)}</td>
                    {turbo && <td className="py-1 text-right tabular">{formatBRL(tt?.totalReceived ?? 0)}</td>}
                    {mentoria && <><td className="py-1 text-right tabular">{formatBRL(mm?.revenueCents ?? 0)}</td><td className={cn("py-1 text-right tabular", (mm?.profitCents ?? 0) < 0 && "text-danger")}>{formatBRL(mm?.profitCents ?? 0)}</td></>}
                    {pessoal && <><td className="py-1 text-right tabular">{formatBRL(pe?.incomeTotal ?? 0)}</td><td className="py-1 text-right tabular">{formatBRL(pe?.expenseTotal ?? 0)}</td><td className={cn("py-1 text-right tabular", (pe?.result ?? 0) < 0 && "text-danger")}>{formatBRL(pe?.result ?? 0)}</td></>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {mYear && mYear.cash !== 0 && <p className="text-xs text-muted-foreground">Fluxo de caixa da Mentoria no ano: {formatBRL(mYear.cash)}.</p>}
    </div>
  );
}
