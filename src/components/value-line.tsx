"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** Linha simples de uma série numérica (seguidores, histórico de metas). */
export function ValueLine({
  data,
  label,
  caption,
  format = (v) => v.toLocaleString("pt-BR"),
  target,
  height = 220,
}: {
  data: { label: string; value: number }[];
  label: string;
  caption: string;
  format?: (v: number) => string;
  target?: number | null;
  height?: number;
}) {
  if (data.length === 0) return <p className="text-sm text-muted-foreground">Sem registros ainda.</p>;
  return (
    <figure className="grid gap-1">
      <div style={{ height }} className="w-full" role="img" aria-label={`${caption}. Último valor: ${format(data[data.length - 1]!.value)}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
            <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => format(Number(v))} domain={["auto", "auto"]} />
            <Tooltip
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--foreground)" }}
              formatter={(v) => [format(Number(v)), label]}
            />
            {target != null && <ReferenceLine y={target} stroke="var(--muted-foreground)" strokeDasharray="4 4" label={{ value: "Meta", fontSize: 11, fill: "var(--muted-foreground)", position: "insideTopRight" }} />}
            <Line type="monotone" dataKey="value" stroke="var(--chart-in)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-xs text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}
