import { useState } from "react";
import { ArrowUpRight, Check, Sparkles, Target, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useGoals } from "@/lib/queries";
import { useSaveGoal } from "@/lib/mutations";
import { formatDate } from "@/lib/format";
import { PageHeader, StatCard } from "@/components/common/page-parts";
import type { Goal } from "@/lib/types";

function progressOf(goal: Goal) {
  const start = Number(goal.start_value ?? 0);
  const target = Number(goal.target_value ?? 0);
  const current = Number(goal.current_value ?? start);
  if (!target || target === start) return 0;
  return Math.min(100, Math.max(0, Math.round(((current - start) / (target - start)) * 100)));
}

function formatValue(goal: Goal, value: number) {
  if (goal.unit === "BRL") {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  }
  return `${value.toLocaleString("pt-BR")}${goal.unit ? ` ${goal.unit}` : ""}`;
}

export default function Metas() {
  const { data: goals = [] } = useGoals();
  const saveGoal = useSaveGoal();
  const [dialogGoal, setDialogGoal] = useState<Goal | null>(null);
  const [value, setValue] = useState("");

  const active = goals.filter((goal) => goal.status === "ACTIVE");
  const objectives = active.filter((goal) => goal.is_objective);
  const quantitative = active.filter((goal) => !goal.is_objective);

  const openUpdate = (goal: Goal) => {
    setDialogGoal(goal);
    setValue(String(goal.current_value ?? ""));
  };

  const submitValue = () => {
    if (!dialogGoal) return;
    const numeric = Number(value.replace(",", "."));
    if (Number.isNaN(numeric)) return;
    const progress = [
      ...(dialogGoal.progress ?? []),
      {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        value: String(numeric),
        note: "Atualização manual",
      },
    ];
    saveGoal.mutate(
      { id: dialogGoal.id, values: { current_value: numeric, progress } },
      { onSuccess: () => setDialogGoal(null) },
    );
  };

  const toggleStep = (goal: Goal, stepId: string) => {
    const steps = (goal.steps ?? []).map((step) =>
      step.id === stepId ? { ...step, done: !step.done } : step,
    );
    saveGoal.mutate({ id: goal.id, values: { steps } });
  };

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Metas"
        title="O que você está construindo"
        description="Metas financeiras, de desenvolvimento e os objetivos que nasceram da sua roda da vida."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Metas ativas"
          value={active.length}
          hint={`${objectives.length} objetivos da roda da vida`}
          icon={<Target className="size-4" />}
          accent
        />
        <StatCard
          label="Concluídas"
          value={goals.filter((goal) => goal.status === "DONE").length}
          hint="histórico"
          icon={<Check className="size-4" />}
        />
        <StatCard
          label="Progresso médio"
          value={`${quantitative.length ? Math.round(quantitative.reduce((sum, goal) => sum + progressOf(goal), 0) / quantitative.length) : 0}%`}
          hint="das metas quantitativas"
          icon={<TrendingUp className="size-4" />}
        />
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-lg text-foreground">Metas com número</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {quantitative.map((goal) => {
            const pct = progressOf(goal);
            return (
              <Card key={goal.id} className="border-border/70 shadow-card">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="font-display text-lg">{goal.title}</CardTitle>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        {goal.type === "FINANCIAL" ? "Financeira" : "Desenvolvimento"}
                        {goal.category ? ` · ${goal.category}` : ""}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      {pct}%
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Progress value={pct} className="h-2" />
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium text-foreground">
                      {formatValue(goal, Number(goal.current_value ?? goal.start_value ?? 0))}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      meta {formatValue(goal, Number(goal.target_value ?? 0))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>
                      {goal.start_value ? `início ${formatValue(goal, Number(goal.start_value))}` : ""}
                      {goal.due_date ? ` · até ${formatDate(goal.due_date, "dd/MM/yyyy")}` : ""}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => openUpdate(goal)}>
                      Atualizar <ArrowUpRight className="size-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {quantitative.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma meta quantitativa ativa.</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-lg text-foreground">Objetivos da roda da vida</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {objectives.map((goal) => {
            const steps = goal.steps ?? [];
            const done = steps.filter((step) => step.done).length;
            return (
              <Card key={goal.id} className="border-border/70 bg-accent/20 shadow-card">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="font-display text-lg">{goal.title}</CardTitle>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        {goal.category ?? "Roda da vida"}
                      </p>
                    </div>
                    <Sparkles className="size-4 text-primary" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {goal.description ? (
                    <p className="text-xs leading-relaxed text-muted-foreground">{goal.description}</p>
                  ) : null}
                  <div className="space-y-2">
                    {steps.map((step) => (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => toggleStep(goal, step.id)}
                        className="flex w-full items-start gap-2 text-left"
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition",
                            step.done
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border text-transparent",
                          )}
                        >
                          <Check className="size-2.5" />
                        </span>
                        <span
                          className={cn(
                            "text-sm leading-snug",
                            step.done ? "text-muted-foreground line-through" : "text-foreground",
                          )}
                        >
                          {step.title}
                        </span>
                      </button>
                    ))}
                    {steps.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Sem passos definidos.</p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        {done} de {steps.length} passos concluídos
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {objectives.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum objetivo vindo da roda da vida.</p>
          ) : null}
        </div>
      </div>

      <Dialog open={Boolean(dialogGoal)} onOpenChange={(isOpen) => !isOpen && setDialogGoal(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Atualizar {dialogGoal?.title}</DialogTitle>
            <DialogDescription>
              Informe o valor de hoje para acompanhar o progresso.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="goal-value">Valor atual {dialogGoal?.unit ? `(${dialogGoal.unit})` : ""}</Label>
            <Input
              id="goal-value"
              type="number"
              step="0.1"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" onClick={submitValue}>
              Salvar progresso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
