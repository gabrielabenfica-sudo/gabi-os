import { useMemo } from "react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { Compass, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useMaasAreas, useMaasAssessments, useMaasScores } from "@/lib/queries";
import { formatDate } from "@/lib/format";
import { PageHeader, StatCard } from "@/components/common/page-parts";

export default function RodaDaVida() {
  const { data: areas = [] } = useMaasAreas();
  const { data: assessments = [] } = useMaasAssessments();
  const { data: scores = [] } = useMaasScores();

  const latest = assessments[0];
  const latestScores = useMemo(
    () => scores.filter((score) => score.assessment_id === latest?.id),
    [scores, latest],
  );

  const chartData = latestScores.map((score) => ({
    area: score.area_name,
    nota: score.score ?? 0,
  }));

  const average = latestScores.length
    ? (latestScores.reduce((sum, score) => sum + (score.score ?? 0), 0) / latestScores.length).toFixed(1)
    : "—";

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Roda da vida"
        title="O retrato das suas áreas"
        description={
          latest
            ? `Avaliação de ${formatDate(latest.assessment_date, "dd 'de' MMMM 'de' yyyy")} — com notas, comentários e planos de ação.`
            : "Nenhuma avaliação registrada ainda."
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Média geral"
          value={`${average}/10`}
          hint={`${latestScores.length} áreas avaliadas`}
          icon={<Compass className="size-4" />}
          accent
        />
        <StatCard
          label="Melhor área"
          value={
            latestScores.length
              ? latestScores.reduce((best, score) => ((score.score ?? 0) > (best.score ?? 0) ? score : best)).area_name
              : "—"
          }
          hint="nota mais alta"
          icon={<Sparkles className="size-4" />}
        />
        <StatCard
          label="Precisa de atenção"
          value={
            latestScores.length
              ? latestScores.reduce((worst, score) => ((score.score ?? 10) < (worst.score ?? 10) ? score : worst)).area_name
              : "—"
          }
          hint="nota mais baixa"
          icon={<Compass className="size-4" />}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.35fr]">
        <Card className="border-border/70 shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-lg">Sua roda hoje</CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={chartData} outerRadius="72%">
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis
                  dataKey="area"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                />
                <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
                <Radar
                  dataKey="nota"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.28}
                />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-lg">Planos de ação</CardTitle>
            <p className="text-xs text-muted-foreground">
              O que você escreveu para cada área na última avaliação.
            </p>
          </CardHeader>
          <CardContent className="max-h-[320px] space-y-3 overflow-y-auto pr-2 scrollbar-thin">
            {latestScores.map((score) => (
              <div key={score.id} className="space-y-1 border-b border-border/50 pb-3 last:border-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{score.area_name}</p>
                  <Badge variant="secondary" className="text-[10px] tabular-nums">
                    {score.score}/10
                  </Badge>
                </div>
                <Progress value={(score.score ?? 0) * 10} className="h-1" />
                {score.action_plan ? (
                  <p className="text-xs leading-relaxed text-muted-foreground">{score.action_plan}</p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {latestScores.map((score) => (
          <Card key={score.id} className="border-border/70 shadow-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="font-display text-base">{score.area_name}</CardTitle>
                <span className="font-display text-xl text-primary">{score.score}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {score.comment ? (
                <p className="text-xs leading-relaxed text-foreground/90">{score.comment}</p>
              ) : null}
              {score.action_plan ? (
                <div className="rounded-lg bg-secondary/60 p-2">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Plano</p>
                  <p className="whitespace-pre-line text-xs text-foreground">{score.action_plan}</p>
                </div>
              ) : null}
              {score.goal ? (
                <p className="text-[11px] text-muted-foreground">meta: {score.goal}/10</p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {areas.filter((area) => area.active).length} áreas ativas de {areas.length} cadastradas.
      </p>
    </div>
  );
}
