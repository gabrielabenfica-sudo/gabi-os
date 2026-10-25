"use client";

import { Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";

export function MaasRadar({ data, hasPrevious }: { data: { area: string; atual: number; anterior: number | null }[]; hasPrevious: boolean }) {
  return (
    <div className="h-80 w-full" role="img" aria-label={`Roda da vida: ${data.map((d) => `${d.area} ${d.atual}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis dataKey="area" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
          <PolarRadiusAxis domain={[0, 10]} tickCount={6} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} />
          {hasPrevious && <Radar name="Anterior" dataKey="anterior" stroke="var(--muted-foreground)" fill="var(--muted-foreground)" fillOpacity={0.08} strokeDasharray="4 4" />}
          <Radar name="Atual" dataKey="atual" stroke="var(--chart-in)" fill="var(--chart-in)" fillOpacity={0.25} strokeWidth={2} />
          <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--foreground)" }} />
          {hasPrevious && <Legend wrapperStyle={{ fontSize: 12 }} />}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
