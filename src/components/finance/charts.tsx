"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL } from "@/lib/money";
import { formatYm } from "@/lib/dates";

/**
 * Gráficos financeiros. Paleta validada (claro/escuro) para daltonismo:
 * --chart-in (entradas) e --chart-out (saídas). Legenda sempre visível com
 * 2 séries, tooltip ao passar o mouse e tabela alternativa para leitura.
 */

const axisTick = { fontSize: 11, fill: "var(--muted-foreground)" };
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const reais = (cents: number) => `R$ ${compact.format(cents / 100)}`;

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: number; color?: string }[] }) {
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium capitalize text-foreground">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center justify-between gap-4 text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            {r.color && <span className="size-2 rounded-sm" style={{ background: r.color }} aria-hidden />}
            {r.label}
          </span>
          <span className="tabular font-medium text-foreground">{formatBRL(r.value)}</span>
        </p>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-4 text-xs text-muted-foreground">
      {items.map((i) => (
        <li key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-3 rounded-sm" style={{ background: i.dashed ? "transparent" : i.color, border: i.dashed ? `2px dashed ${i.color}` : undefined }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

function TableToggle({ children, caption }: { children: React.ReactNode; caption: string }) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver tabela</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-xs">
          <caption className="sr-only">{caption}</caption>
          {children}
        </table>
      </div>
    </details>
  );
}

/** Duas séries por mês (ex.: receitas × despesas). */
export function InOutBars({
  data,
  inLabel = "Receitas",
  outLabel = "Despesas",
  caption,
  height = 240,
  showResult = true,
}: {
  data: { month: string; inCents: number; outCents: number }[];
  inLabel?: string;
  outLabel?: string;
  caption: string;
  height?: number;
  /** Mostra "resultado" (entrada − saída) no tooltip e na tabela */
  showResult?: boolean;
}) {
  const rows = data.map((d) => ({ ...d, label: formatYm(d.month, true) }));
  return (
    <div className="grid gap-3">
      <Legend items={[{ label: inLabel, color: "var(--chart-in)" }, { label: outLabel, color: "var(--chart-out)" }]} />
      <div style={{ height }} role="img" aria-label={caption}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 4, bottom: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={8} />
            <YAxis tickFormatter={reais} tick={axisTick} tickLine={false} axisLine={false} width={64} />
            <Tooltip
              cursor={{ fill: "var(--accent)" }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipBox
                    title={formatYm((payload[0]!.payload as { month: string }).month)}
                    rows={[
                      { label: inLabel, value: (payload[0]!.payload as { inCents: number }).inCents, color: "var(--chart-in)" },
                      { label: outLabel, value: (payload[0]!.payload as { outCents: number }).outCents, color: "var(--chart-out)" },
                      ...(showResult ? [{ label: "Resultado", value: (payload[0]!.payload as { inCents: number }).inCents - (payload[0]!.payload as { outCents: number }).outCents }] : []),
                    ]}
                  />
                ) : null
              }
            />
            <ReferenceLine y={0} stroke="var(--border)" />
            <Bar dataKey="inCents" name={inLabel} fill="var(--chart-in)" radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="outCents" name={outLabel} fill="var(--chart-out)" radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TableToggle caption={caption}>
        <thead className="text-muted-foreground">
          <tr><th className="py-1 text-left font-medium">Mês</th><th className="py-1 text-right font-medium">{inLabel}</th><th className="py-1 text-right font-medium">{outLabel}</th>{showResult && <th className="py-1 text-right font-medium">Resultado</th>}</tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.month} className="border-t border-border">
              <td className="py-1 capitalize">{formatYm(d.month, true)}</td>
              <td className="py-1 text-right tabular">{formatBRL(d.inCents)}</td>
              <td className="py-1 text-right tabular">{formatBRL(d.outCents)}</td>
              {showResult && <td className="py-1 text-right tabular">{formatBRL(d.inCents - d.outCents)}</td>}
            </tr>
          ))}
        </tbody>
      </TableToggle>
    </div>
  );
}

/** Uma série ao longo do tempo (saldo, patrimônio, projeção). */
export function MoneyLine({
  data,
  label,
  caption,
  height = 220,
  dashedFrom,
}: {
  data: { month: string; cents: number }[];
  label: string;
  caption: string;
  height?: number;
  /** Índice a partir do qual a linha é projeção (tracejada) */
  dashedFrom?: number;
}) {
  const rows = data.map((d, i) => ({
    ...d,
    label: formatYm(d.month, true),
    real: dashedFrom === undefined || i <= dashedFrom ? d.cents : null,
    proj: dashedFrom !== undefined && i >= dashedFrom ? d.cents : null,
  }));
  return (
    <div className="grid gap-2">
      <div style={{ height }} role="img" aria-label={caption}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={8} />
            <YAxis tickFormatter={reais} tick={axisTick} tickLine={false} axisLine={false} width={64} />
            <ReferenceLine y={0} stroke="var(--danger)" strokeOpacity={0.4} />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
              content={({ active, payload }) =>
                active && payload?.length ? <TooltipBox title={formatYm((payload[0]!.payload as { month: string }).month)} rows={[{ label, value: (payload[0]!.payload as { cents: number }).cents, color: "var(--chart-in)" }]} /> : null
              }
            />
            <Line type="monotone" dataKey="real" stroke="var(--chart-in)" strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: "var(--chart-in)" }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
            {dashedFrom !== undefined && (
              <Line type="monotone" dataKey="proj" stroke="var(--chart-in)" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3, strokeWidth: 0, fill: "var(--chart-in)" }} activeDot={{ r: 5 }} isAnimationActive={false} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <TableToggle caption={caption}>
        <tbody>
          {data.map((d, i) => (
            <tr key={d.month} className="border-t border-border">
              <td className="py-1 capitalize">{formatYm(d.month, true)}{dashedFrom !== undefined && i > dashedFrom ? " (projeção)" : ""}</td>
              <td className="py-1 text-right tabular">{formatBRL(d.cents)}</td>
            </tr>
          ))}
        </tbody>
      </TableToggle>
    </div>
  );
}

/** Barras horizontais com rótulo direto (gastos por categoria). */
export function CategoryBars({ items, total, emptyText = "Nenhuma despesa no mês." }: { items: { name: string; amountCents: number }[]; total?: number; emptyText?: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  const max = Math.max(...items.map((i) => Math.abs(i.amountCents)));
  const sum = total ?? items.reduce((s, i) => s + i.amountCents, 0);
  return (
    <ul className="grid gap-2.5" aria-label="Gastos por categoria">
      {items.map((i) => (
        <li key={i.name} className="grid gap-1" title={`${i.name}: ${formatBRL(i.amountCents)}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{i.name}</span>
            <span className="shrink-0 tabular">
              {formatBRL(i.amountCents)} <span className="text-xs text-muted-foreground">{sum ? `${Math.round((i.amountCents / sum) * 100)}%` : ""}</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, (Math.abs(i.amountCents) / max) * 100)}%`, background: "var(--chart-out)" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
