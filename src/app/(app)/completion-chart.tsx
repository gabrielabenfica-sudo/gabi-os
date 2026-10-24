"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function CompletionChart({ series }: { series: { day: string; count: number }[] }) {
  const data = series.map((d) => ({ label: `${d.day.slice(8, 10)}/${d.day.slice(5, 7)}`, count: d.count }));
  return (
    <div className="h-52 w-full" role="img" aria-label={`Tarefas concluídas por dia: ${series.reduce((s, d) => s + d.count, 0)} no total`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={12} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: "var(--accent)" }}
            contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--foreground)" }}
            formatter={(v) => [v as number, "Concluídas"]}
          />
          <Bar dataKey="count" fill="var(--brand)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
