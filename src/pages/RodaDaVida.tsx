import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, Compass, Minus, Pencil, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useMaasAreas, useMaasAssessments, useMaasScores } from "@/lib/queries";
import { formatDate } from "@/lib/format";
import { PageHeader, StatCard } from "@/components/common/page-parts";
import { AssessmentDialog } from "@/components/maas/assessment-dialog";
import type { MaasAssessment, MaasScore } from "@/lib/types";

const NONE = "none";

const averageOf = (list: MaasScore[]) => {
  const valid = list.filter((score) => score.score !== null);
  return valid.length ? valid.reduce((sum, score) => sum + (score.score ?? 0), 0) / valid.length : null;
};

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[11px] text-muted-foreground">—</span>;
  if (value === 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
        <Minus className="size-3" /> 0
      </span>
    );
  const up = value > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-medium", up ? "text-emerald-600" : "text-destructive")}>
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {up ? `+${Number(value.toFixed(1))}` : Number(value.toFixed(1))}
    </span>
  );
}

export default function RodaDaVida() {
  const { data: areas = [] } = useMaasAreas();
  const { data: assessments = [] } = useMaasAssessments();
  const { data: scores = [] } = useMaasScores();

  // assessments come newest first
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MaasAssessment | null>(null);

  const current = assessments.find((item) => item.id === currentId) ?? assessments[0];
  const currentIndex = current ? assessments.findIndex((item) => item.id === current.id) : -1;
  const defaultCompare = currentIndex >= 0 ? assessments[currentIndex + 1] : undefined;
  const compare =
    compareId === NONE ? undefined : (assessments.find((item) => item.id === compareId) ?? defaultCompare);

  const scoresOf = (id?: string) => (id ? scores.filter((score) => score.assessment_id === id) : []);
  const currentScores = useMemo(() => scoresOf(current?.id), [scores, current]); // eslint-disable-line react-hooks/exhaustive-deps
  const compareScores = useMemo(() => scoresOf(compare?.id), [scores, compare]); // eslint-disable-line react-hooks/exhaustive-deps

  const previousOfFind = (score: MaasScore) =>
    compareScores.find((item) => (score.area_id && item.area_id === score.area_id) || item.area_name === score.area_name);

  const chartData = currentScores.map((score) => ({
    area: score.area_name,
    nota: score.score ?? 0,
    antes: previousOfFind(score)?.score ?? null,
  }));

  const avg = averageOf(currentScores);
  const avgBefore = averageOf(compareScores);

  // Evolution across every assessment, oldest first.
  const evolution = useMemo(() => {
    const ordered = [...assessments].reverse();
    return ordered.map((item) => {
      const list = scores.filter((score) => score.assessment_id === item.id);
      const row: Record<string, string | number | null> = {
        data: formatDate(item.assessment_date, "dd/MM/yy"),
        "Média": averageOf(list) === null ? null : Number((averageOf(list) ?? 0).toFixed(1)),
      };
      return row;
    });
  }, [assessments, scores]);

  const comparison = currentScores
    .map((score) => {
      const before = previousOfFind(score)?.score ?? null;
      return {
        id: score.id,
        area: score.area_name,
        now: score.score,
        before,
        diff: score.score !== null && before !== null ? score.score - before : null,
      };
    })
    .sort((a, b) => (b.diff ?? -99) - (a.diff ?? -99));

  const best = currentScores.length
    ? currentScores.reduce((top, score) => ((score.score ?? 0) > (top.score ?? 0) ? score : top))
    : null;
  const worst = currentScores.length
    ? currentScores.reduce((low, score) => ((score.score ?? 10) < (low.score ?? 10) ? score : low))
    : null;

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = () => {
    if (!current) return;
    setEditing(current);
    setDialogOpen(true);
  };

  // When editing, compare with the assessment just before it; when creating, with the latest one.
  const dialogPrevious = editing ? scoresOf(assessments[assessments.findIndex((a) => a.id === editing.id) + 1]?.id) : scoresOf(assessments[0]?.id);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Roda da vida"
        title="O retrato das suas áreas"
        description={
          current
            ? `Avaliação de ${formatDate(current.assessment_date, "dd 'de' MMMM 'de' yyyy")}${
                compare ? `, comparada com ${formatDate(compare.assessment_date, "dd/MM/yyyy")}` : ""
              }.`
            : "Nenhuma avaliação registrada ainda."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {current ? (
              <Button size="sm" variant="outline" onClick={openEdit}>
                <Pencil className="size-3.5" /> Editar esta
              </Button>
            ) : null}
            <Button size="sm" onClick={openNew}>
              <Plus className="size-4" /> Nova avaliação
            </Button>
          </div>
        }
      />

      {assessments.length > 0 ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Avaliação</p>
            <Select value={current?.id ?? ""} onValueChange={(value) => { setCurrentId(value); setCompareId(null); }}>
              <SelectTrigger className="h-9 w-[190px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {assessments.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{formatDate(item.assessment_date, "dd/MM/yyyy")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Comparar com</p>
            <Select value={compare?.id ?? NONE} onValueChange={(value) => setCompareId(value)}>
              <SelectTrigger className="h-9 w-[190px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sem comparação</SelectItem>
                {assessments
                  .filter((item) => item.id !== current?.id)
                  .map((item) => (
                    <SelectItem key={item.id} value={item.id}>{formatDate(item.assessment_date, "dd/MM/yyyy")}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {assessments.length === 1 ? (
            <p className="pb-2 text-xs text-muted-foreground">
              Registre uma nova avaliação para ver a evolução.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Média geral"
          value={avg === null ? "—" : `${avg.toFixed(1)}/10`}
          hint={
            avgBefore !== null && avg !== null
              ? `${avg - avgBefore >= 0 ? "+" : ""}${(avg - avgBefore).toFixed(1)} desde a anterior`
              : `${currentScores.length} áreas avaliadas`
          }
          icon={<Compass className="size-4" />}
          accent
        />
        <StatCard label="Melhor área" value={best?.area_name ?? "—"} hint="nota mais alta" icon={<Sparkles className="size-4" />} />
        <StatCard label="Precisa de atenção" value={worst?.area_name ?? "—"} hint="nota mais baixa" icon={<Compass className="size-4" />} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        <Card className="border-border/70 shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-lg">Sua roda</CardTitle>
          </CardHeader>
          <CardContent className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={chartData} outerRadius="70%">
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="area" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
                {compare ? (
                  <Radar
                    name={formatDate(compare.assessment_date, "dd/MM/yy")}
                    dataKey="antes"
                    stroke="hsl(var(--muted-foreground))"
                    fill="hsl(var(--muted-foreground))"
                    fillOpacity={0.08}
                    strokeDasharray="4 3"
                  />
                ) : null}
                <Radar
                  name={current ? formatDate(current.assessment_date, "dd/MM/yy") : "Atual"}
                  dataKey="nota"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.28}
                />
                {compare ? <Legend wrapperStyle={{ fontSize: 11 }} /> : null}
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-lg">{compare ? "O que mudou" : "Notas por área"}</CardTitle>
            {compare ? (
              <p className="text-xs text-muted-foreground">Ordenado do que mais subiu para o que mais caiu.</p>
            ) : null}
          </CardHeader>
          <CardContent className="max-h-[340px] space-y-2 overflow-y-auto pr-2 scrollbar-thin">
            {comparison.map((row) => (
              <div key={row.id} className="flex items-center gap-3 border-b border-border/50 pb-2 last:border-0">
                <p className="w-28 shrink-0 text-sm text-foreground">{row.area}</p>
                <Progress value={(row.now ?? 0) * 10} className="h-1.5 flex-1" />
                <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">
                  {compare ? `${row.before ?? "—"} → ` : ""}
                  <span className="font-medium text-foreground">{row.now ?? "—"}</span>
                </span>
                {compare ? (
                  <span className="w-10 text-right">
                    <Delta value={row.diff} />
                  </span>
                ) : null}
              </div>
            ))}
            {comparison.length === 0 ? <p className="text-sm text-muted-foreground">Sem notas nesta avaliação.</p> : null}
          </CardContent>
        </Card>
      </div>

      {evolution.length > 1 ? (
        <Card className="border-border/70 shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-lg">Evolução da média</CardTitle>
            <p className="text-xs text-muted-foreground">Uma linha por avaliação registrada, da mais antiga para a mais recente.</p>
          </CardHeader>
          <CardContent className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evolution} margin={{ left: -20, right: 12, top: 8 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="data" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <YAxis domain={[0, 10]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="Média" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {currentScores.map((score) => {
          const before = previousOfFind(score)?.score ?? null;
          return (
            <Card key={score.id} className="border-border/70 shadow-card">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="font-display text-base">{score.area_name}</CardTitle>
                  <div className="flex items-center gap-2">
                    {compare ? <Delta value={score.score !== null && before !== null ? score.score - before : null} /> : null}
                    <span className="font-display text-xl text-primary">{score.score}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {score.comment ? <p className="text-xs leading-relaxed text-foreground/90">{score.comment}</p> : null}
                {score.action_plan ? (
                  <div className="rounded-lg bg-secondary/60 p-2">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Plano</p>
                    <p className="whitespace-pre-line text-xs text-foreground">{score.action_plan}</p>
                  </div>
                ) : null}
                {score.goal ? <p className="text-[11px] text-muted-foreground">meta: {score.goal}/10</p> : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className="text-[10px]">{assessments.length}</Badge>
        avaliações registradas · {areas.filter((area) => area.active).length} áreas ativas
      </div>

      <AssessmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        areas={areas}
        assessment={editing}
        scores={editing ? scoresOf(editing.id) : []}
        previousScores={dialogPrevious}
      />
    </div>
  );
}
