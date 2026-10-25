"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Pencil, Plus, Sparkles, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Checkbox, EmptyState, PageHeader, Segmented, WsDot } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm";
import { ValueLine } from "@/components/value-line";
import { AUTO_METRICS, autoMetric, formatGoalValue, GOAL_HORIZONS, GOAL_STATUS_LABEL, GOAL_TYPES, goalTypeLabel, horizonDates, SITUATION_LABEL } from "@/lib/goals";
import { cn } from "@/lib/utils";
import type { GoalDetail, GoalView } from "@/server/goals";
import {
  addGoalStepAction, createGoalAction, deleteGoalAction, deleteGoalProgressAction, deleteGoalStepAction, getGoalAction, recordGoalValueAction, setGoalStatusAction, updateGoalAction,
  updateGoalStepAction,
} from "./actions";

type Ws = { id: string; name: string; color: string; kind: string };
const br = (s: string | null) => (s ? s.split("-").reverse().join("/") : "—");
const SITUATION_VARIANT = { ACHIEVED: "success", ON_TRACK: "info", BEHIND: "warning", WITHIN_LIMIT: "info", OVER_LIMIT: "danger", NO_DATA: "outline", ENDED_MISSED: "danger" } as const;

export function GoalsClient({ goals, status, workspaces, defaultWorkspaceId, today, openId, openNew }: { goals: GoalView[]; status: string; workspaces: Ws[]; defaultWorkspaceId: string; today: string; openId: string | null; openNew: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [dialog, setDialog] = React.useState<{ kind: "form"; edit?: GoalView } | { kind: "detail"; id: string } | null>(openId ? { kind: "detail", id: openId } : openNew ? { kind: "form" } : null);
  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) v === null ? p.delete(k) : p.set(k, v);
    return `${pathname}${p.toString() ? `?${p}` : ""}`;
  };
  const close = () => {
    setDialog(null);
    if (params.get("meta") || params.get("nova")) window.history.replaceState(null, "", href({ meta: null, nova: null }));
  };
  const counts = {
    achieved: goals.filter((g) => g.situation === "ACHIEVED").length,
    behind: goals.filter((g) => g.situation === "BEHIND" || g.situation === "OVER_LIMIT").length,
  };

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Metas"
        description="Metas financeiras, profissionais, comerciais, de conteúdo e pessoais — com progresso calculado a partir dos seus dados."
        actions={<Button onClick={() => setDialog({ kind: "form" })}><Plus /> Nova meta</Button>}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          ariaLabel="Status"
          value={status}
          onChange={(s) => router.replace(href({ status: s === "ACTIVE" ? null : s }))}
          options={[{ value: "ACTIVE", label: "Ativas" }, { value: "ACHIEVED", label: "Atingidas" }, { value: "MISSED", label: "Não atingidas" }, { value: "PAUSED", label: "Pausadas" }, { value: "all", label: "Todas" }]}
        />
        <Select aria-label="Tipo" value={params.get("tipo") ?? ""} onChange={(e) => router.replace(href({ tipo: e.target.value || null }))} className="w-44">
          <option value="">Todos os tipos</option>
          {GOAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
        {goals.length > 0 && status === "ACTIVE" && (
          <p className="ml-auto text-sm text-muted-foreground">{goals.length} meta(s) · {counts.achieved} atingida(s) · {counts.behind} pedem atenção</p>
        )}
      </div>

      {goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title={status === "ACTIVE" ? "Nenhuma meta ativa" : "Nenhuma meta aqui"}
          description="Crie uma meta. Faturamento, lucro, reservas, conteúdos publicados, tarefas e hábitos podem ser calculados automaticamente."
          action={<Button onClick={() => setDialog({ kind: "form" })}><Plus /> Nova meta</Button>}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="goals">
          {goals.map((g) => <GoalCard key={g.id} goal={g} onOpen={() => setDialog({ kind: "detail", id: g.id })} />)}
        </div>
      )}

      {dialog?.kind === "form" && (
        <GoalDialog
          edit={dialog.edit}
          workspaces={workspaces}
          defaultWorkspaceId={defaultWorkspaceId}
          today={today}
          onClose={close}
          onSaved={(id) => {
            if (dialog.edit) setDialog({ kind: "detail", id: dialog.edit.id });
            else setDialog(id ? { kind: "detail", id } : null);
            router.refresh();
          }}
        />
      )}
      {dialog?.kind === "detail" && <GoalDetailDialog id={dialog.id} today={today} onClose={close} onEdit={(g) => setDialog({ kind: "form", edit: g })} />}
    </div>
  );
}

export function ProgressBar({ goal }: { goal: Pick<GoalView, "progress" | "elapsedPct" | "situation" | "usedPct"> }) {
  const limit = goal.usedPct !== null;
  const width = limit ? Math.min(100, goal.usedPct!) : goal.progress;
  return (
    <div className="relative h-2 rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(width)} aria-label={limit ? "Uso do limite" : "Progresso"}>
      <div
        className={cn("h-2 rounded-full", goal.situation === "ACHIEVED" ? "bg-success" : goal.situation === "OVER_LIMIT" || goal.situation === "ENDED_MISSED" ? "bg-danger" : goal.situation === "BEHIND" ? "bg-warning" : "bg-[var(--chart-in)]")}
        style={{ width: `${width}%` }}
      />
      {goal.elapsedPct !== null && !limit && goal.situation !== "ACHIEVED" && (
        <span className="absolute -top-1 h-4 w-0.5 rounded bg-foreground/40" style={{ left: `${goal.elapsedPct}%` }} title={`${goal.elapsedPct}% do prazo`} aria-hidden />
      )}
    </div>
  );
}

function GoalCard({ goal, onOpen }: { goal: GoalView; onOpen: () => void }) {
  const qualitative = goal.measure === "QUALITATIVE";
  return (
    <button type="button" onClick={onOpen} className="rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50" data-goal={goal.title}>
      <Card className="grid h-full gap-3 p-4 transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium leading-snug">{goal.title}</p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><WsDot color={goal.workspace.color} /> {goal.workspace.name} · {goalTypeLabel(goal.type)}</p>
          </div>
          {goal.status === "ACTIVE" ? <Badge variant={SITUATION_VARIANT[goal.situation]}>{SITUATION_LABEL[goal.situation]}</Badge> : <Badge variant="outline">{GOAL_STATUS_LABEL[goal.status]}</Badge>}
        </div>
        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold tabular">
              {qualitative ? `${goal.steps.filter((s) => s.done).length}/${goal.steps.length} etapas` : formatGoalValue(goal.currentValue, goal.unit)}
            </span>
            <span className="text-xs text-muted-foreground">
              {qualitative ? `${goal.progress}%` : `${goal.direction === "DOWN" && goal.startValue === null ? "limite" : "meta"} ${formatGoalValue(goal.targetValue, goal.unit)}`}
            </span>
          </div>
          <ProgressBar goal={goal} />
          <p className="flex flex-wrap justify-between gap-1 text-xs text-muted-foreground">
            <span>{goal.usedPct !== null ? `${goal.usedPct.toLocaleString("pt-BR")}% do limite` : `${goal.progress}% concluído`}</span>
            <span>{goal.dueDate ? `até ${br(goal.dueDate)}` : "sem prazo"}</span>
          </p>
        </div>
        {goal.autoMetric && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Sparkles className="size-3" /> Calculada automaticamente</p>}
        {goal.autoError && <p className="text-xs text-danger">{goal.autoError}</p>}
      </Card>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
// Formulário
// ═══════════════════════════════════════════════════════════════

function GoalDialog({ edit, workspaces, defaultWorkspaceId, today, onClose, onSaved }: { edit?: GoalView; workspaces: Ws[]; defaultWorkspaceId: string; today: string; onClose: () => void; onSaved: (id?: string) => void }) {
  const [v, setV] = React.useState({
    workspaceId: edit?.workspace.id ?? defaultWorkspaceId,
    type: edit?.type ?? "FINANCIAL",
    title: edit?.title ?? "",
    description: edit?.description ?? "",
    category: edit?.category ?? "",
    measure: (edit?.measure ?? "QUANTITATIVE") as "QUANTITATIVE" | "QUALITATIVE",
    direction: (edit?.direction ?? "UP") as "UP" | "DOWN",
    unit: edit?.unit ?? "",
    startValue: edit?.startValue?.toString() ?? "",
    targetValue: edit?.targetValue?.toString() ?? "",
    currentValue: edit && !edit.autoMetric ? edit.currentValue?.toString() ?? "" : "",
    autoMetric: edit?.autoMetric ?? "",
    horizon: edit?.horizon ?? "MONTHLY",
    startDate: edit?.startDate ?? horizonDates("MONTHLY", today)!.start,
    dueDate: edit?.dueDate ?? horizonDates("MONTHLY", today)!.end,
    owner: edit?.owner ?? "",
    notes: edit?.notes ?? "",
    steps: "",
  });
  const [saving, setSaving] = React.useState(false);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));
  const ws = workspaces.find((w) => w.id === v.workspaceId)!;
  const metrics = AUTO_METRICS.filter((m) => !m.kinds.length || (m.kinds as readonly string[]).includes(ws.kind));
  const metric = autoMetric(v.autoMetric);
  const unit = metric?.unit ?? v.unit;
  const parse = (s: string) => (s.trim() === "" ? null : Number(s.replace(/\./g, "").replace(",", ".")));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{edit ? "Editar meta" : "Nova meta"}</DialogTitle>
          <DialogDescription>Quantitativa (com valor-alvo) ou qualitativa (avança pelas etapas).</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const nums = { startValue: parse(v.startValue), targetValue: parse(v.targetValue), currentValue: parse(v.currentValue) };
            if (Object.values(nums).some((n) => n !== null && Number.isNaN(n))) return toast.error("Use apenas números nos valores.");
            setSaving(true);
            const input = {
              type: v.type,
              title: v.title,
              description: v.description || null,
              category: v.category || null,
              measure: v.measure,
              direction: v.direction,
              unit: v.unit || null,
              ...nums,
              autoMetric: v.measure === "QUANTITATIVE" ? v.autoMetric || null : null,
              horizon: v.horizon as "MONTHLY",
              startDate: v.startDate || null,
              dueDate: v.dueDate || null,
              owner: v.owner || null,
              notes: v.notes || null,
            };
            const r = edit
              ? await updateGoalAction(edit.id, input)
              : await createGoalAction({ ...input, workspaceId: v.workspaceId, steps: v.measure === "QUALITATIVE" ? v.steps.split("\n").map((s) => s.trim()).filter(Boolean) : undefined });
            setSaving(false);
            if (!r.ok) return toast.error(r.error);
            toast.success(r.message);
            onSaved(edit ? undefined : (r.data as string));
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Título" htmlFor="gl-title" className="sm:col-span-2"><Input id="gl-title" value={v.title} onChange={(e) => set("title", e.target.value)} required autoFocus maxLength={200} placeholder="Ex.: Faturar R$ 20 mil na Mentoria" /></Field>
            {!edit && (
              <Field label="Ambiente" htmlFor="gl-ws">
                <Select id="gl-ws" value={v.workspaceId} onChange={(e) => setV((p) => ({ ...p, workspaceId: e.target.value, autoMetric: "" }))}>
                  {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Tipo" htmlFor="gl-type">
              <Select id="gl-type" value={v.type} onChange={(e) => set("type", e.target.value)}>
                {GOAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </Field>
            <Field label="Medição" htmlFor="gl-measure">
              <Select id="gl-measure" value={v.measure} onChange={(e) => set("measure", e.target.value as typeof v.measure)}>
                <option value="QUANTITATIVE">Quantitativa (valor)</option>
                <option value="QUALITATIVE">Qualitativa (etapas)</option>
              </Select>
            </Field>
            <Field label="Horizonte" htmlFor="gl-horizon">
              <Select
                id="gl-horizon"
                value={v.horizon}
                onChange={(e) => {
                  const h = e.target.value;
                  const d = horizonDates(h, today);
                  setV((p) => ({ ...p, horizon: h, ...(d ? { startDate: d.start, dueDate: d.end } : {}) }));
                }}
              >
                {GOAL_HORIZONS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
              </Select>
            </Field>
            <Field label="Início" htmlFor="gl-start"><Input id="gl-start" type="date" value={v.startDate} onChange={(e) => setV((p) => ({ ...p, startDate: e.target.value, horizon: "CUSTOM" }))} /></Field>
            <Field label="Prazo" htmlFor="gl-due"><Input id="gl-due" type="date" value={v.dueDate} onChange={(e) => setV((p) => ({ ...p, dueDate: e.target.value, horizon: "CUSTOM" }))} /></Field>

            {v.measure === "QUANTITATIVE" && (
              <>
                <Field label="Cálculo" htmlFor="gl-metric" className="sm:col-span-2" hint={metric ? "O valor atual vem dos dados do app no período da meta." : "Você registra o valor atual manualmente."}>
                  <Select
                    id="gl-metric"
                    value={v.autoMetric}
                    onChange={(e) => {
                      const m = autoMetric(e.target.value);
                      setV((p) => ({ ...p, autoMetric: e.target.value, direction: m?.direction ?? p.direction }));
                    }}
                  >
                    <option value="">Manual</option>
                    {metrics.map((m) => <option key={m.value} value={m.value}>Automático: {m.label}</option>)}
                  </Select>
                </Field>
                <Field label="Direção" htmlFor="gl-direction">
                  <Select id="gl-direction" value={v.direction} onChange={(e) => set("direction", e.target.value as typeof v.direction)}>
                    <option value="UP">Aumentar / atingir pelo menos</option>
                    <option value="DOWN">Reduzir / ficar abaixo de</option>
                  </Select>
                </Field>
                {!metric && (
                  <Field label="Unidade" htmlFor="gl-unit" hint="BRL para reais; PERCENT para %; ou livre (livros, kg…).">
                    <Input id="gl-unit" list="gl-units" value={v.unit} onChange={(e) => set("unit", e.target.value)} maxLength={20} />
                    <datalist id="gl-units"><option value="BRL" /><option value="PERCENT" /><option value="COUNT" /></datalist>
                  </Field>
                )}
                <Field label={v.direction === "DOWN" ? "Valor-alvo / limite" : "Valor-alvo"} htmlFor="gl-target" hint={unit === "BRL" ? "Em reais." : undefined}>
                  <Input id="gl-target" inputMode="decimal" value={v.targetValue} onChange={(e) => set("targetValue", e.target.value)} required />
                </Field>
                <Field label="Valor inicial (opcional)" htmlFor="gl-startv" hint={v.direction === "DOWN" ? "Sem valor inicial, a meta funciona como limite." : "Ponto de partida; padrão 0."}>
                  <Input id="gl-startv" inputMode="decimal" value={v.startValue} onChange={(e) => set("startValue", e.target.value)} />
                </Field>
                {!metric && !edit && (
                  <Field label="Valor atual" htmlFor="gl-current"><Input id="gl-current" inputMode="decimal" value={v.currentValue} onChange={(e) => set("currentValue", e.target.value)} /></Field>
                )}
              </>
            )}
            {v.measure === "QUALITATIVE" && !edit && (
              <Field label="Etapas" htmlFor="gl-steps" className="sm:col-span-2" hint="Uma por linha. Você pode adicionar mais depois.">
                <Textarea id="gl-steps" value={v.steps} onChange={(e) => set("steps", e.target.value)} rows={4} />
              </Field>
            )}
            <Field label="Categoria" htmlFor="gl-cat"><Input id="gl-cat" value={v.category} onChange={(e) => set("category", e.target.value)} maxLength={60} /></Field>
            <Field label="Responsável" htmlFor="gl-owner"><Input id="gl-owner" value={v.owner} onChange={(e) => set("owner", e.target.value)} maxLength={100} /></Field>
            <Field label="Descrição" htmlFor="gl-desc" className="sm:col-span-2"><Textarea id="gl-desc" value={v.description} onChange={(e) => set("description", e.target.value)} rows={2} /></Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{edit ? "Salvar" : "Criar meta"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════
// Detalhe
// ═══════════════════════════════════════════════════════════════

function GoalDetailDialog({ id, today, onClose, onEdit }: { id: string; today: string; onClose: () => void; onEdit: (g: GoalView) => void }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [goal, setGoal] = React.useState<GoalDetail | null>(null);
  const [value, setValue] = React.useState("");
  const [date, setDate] = React.useState(today);
  const [note, setNote] = React.useState("");
  const [step, setStep] = React.useState("");

  const load = React.useCallback(async () => {
    const r = await getGoalAction(id);
    if (!r.ok) {
      toast.error(r.error);
      onClose();
      return;
    }
    setGoal(r.data);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => void load(), [load]);
  const changed = async () => {
    await load();
    router.refresh();
  };
  if (!goal) return null;
  const metric = autoMetric(goal.autoMetric);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{goal.title}</DialogTitle>
          <DialogDescription>
            {goal.workspace.name} · {goalTypeLabel(goal.type)} · {goal.startDate ? `${br(goal.startDate)} a ${br(goal.dueDate)}` : goal.dueDate ? `até ${br(goal.dueDate)}` : "sem prazo"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 rounded-lg border border-border p-4" data-testid="goal-progress">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-2xl font-semibold tabular">
              {goal.measure === "QUALITATIVE" ? `${goal.progress}%` : formatGoalValue(goal.currentValue, goal.unit)}
            </p>
            <Badge variant={SITUATION_VARIANT[goal.situation]}>{SITUATION_LABEL[goal.situation]}</Badge>
          </div>
          <ProgressBar goal={goal} />
          <p className="text-sm text-muted-foreground">
            {goal.measure === "QUALITATIVE"
              ? `${goal.steps.filter((s) => s.done).length} de ${goal.steps.length} etapas concluídas`
              : `${goal.direction === "DOWN" && goal.startValue === null ? "Limite" : "Meta"}: ${formatGoalValue(goal.targetValue, goal.unit)}${goal.startValue !== null ? ` · início ${formatGoalValue(goal.startValue, goal.unit)}` : ""} · ${goal.usedPct !== null ? `${goal.usedPct.toLocaleString("pt-BR")}% do limite usado` : `${goal.progress}% concluído`}`}
            {goal.elapsedPct !== null && ` · ${goal.elapsedPct}% do prazo decorrido`}
          </p>
          {metric && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Sparkles className="size-3" /> {metric.label}, calculado com os dados do app no período da meta{metric.unit === "BRL" ? " (meses completos, pelas regras do financeiro)" : ""}.</p>}
          {goal.autoError && <p className="text-xs text-danger">{goal.autoError}</p>}
        </div>

        {goal.measure === "QUANTITATIVE" && (
          <section className="grid gap-3">
            <h3 className="text-sm font-semibold">Histórico</h3>
            <ValueLine
              data={goal.history.map((h) => ({ label: br(h.date).slice(0, 5), value: h.value }))}
              label={goal.indicator ?? "Valor"}
              caption={metric ? "Uma leitura por dia em que a meta foi aberta." : "Valores registrados."}
              format={(n) => formatGoalValue(n, goal.unit)}
              target={goal.targetValue}
              height={180}
            />
            {!metric && goal.status === "ACTIVE" && (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const n = Number(value.replace(/\./g, "").replace(",", "."));
                  if (value.trim() === "" || Number.isNaN(n)) return toast.error("Informe um número.");
                  const r = await recordGoalValueAction(goal.id, { value: n, date, note: note || null });
                  if (!r.ok) return toast.error(r.error);
                  toast.success(r.message);
                  setValue("");
                  setNote("");
                  void changed();
                }}
              >
                <Field label="Novo valor" htmlFor="gv-value"><Input id="gv-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className="w-32" /></Field>
                <Field label="Data" htmlFor="gv-date"><Input id="gv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" /></Field>
                <Field label="Observação" htmlFor="gv-note" className="min-w-40 flex-1"><Input id="gv-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field>
                <Button type="submit">Registrar</Button>
              </form>
            )}
            {!metric && goal.history.length > 0 && (
              <ul className="grid max-h-40 gap-1 overflow-y-auto text-sm">
                {[...goal.history].reverse().map((h) => (
                  <li key={h.id} className="flex items-center gap-2">
                    <span className="w-20 tabular text-muted-foreground">{br(h.date)}</span>
                    <span className="tabular">{formatGoalValue(h.value, goal.unit)}</span>
                    {h.note && <span className="truncate text-muted-foreground">· {h.note}</span>}
                    <button
                      type="button"
                      className="ml-auto rounded p-1 text-muted-foreground hover:text-danger"
                      aria-label="Excluir registro"
                      onClick={async () => {
                        const r = await deleteGoalProgressAction(h.id);
                        if (!r.ok) return toast.error(r.error);
                        void changed();
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="grid gap-2">
          <h3 className="text-sm font-semibold">Etapas</h3>
          {goal.steps.length === 0 && <p className="text-sm text-muted-foreground">{goal.measure === "QUALITATIVE" ? "Adicione as etapas para medir o progresso." : "Opcional: divida a meta em ações."}</p>}
          <ul className="grid gap-1">
            {goal.steps.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  key={`${s.id}-${s.done}`}
                  defaultChecked={s.done}
                  aria-label={`Concluir etapa ${s.title}`}
                  onChange={async (e) => {
                    const r = await updateGoalStepAction(s.id, { done: e.target.checked });
                    if (!r.ok) return toast.error(r.error);
                    void changed();
                  }}
                />
                <span className={cn("flex-1", s.done && "text-muted-foreground line-through")}>{s.title}</span>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground hover:text-danger"
                  aria-label={`Excluir etapa ${s.title}`}
                  onClick={async () => {
                    const r = await deleteGoalStepAction(s.id);
                    if (!r.ok) return toast.error(r.error);
                    void changed();
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await addGoalStepAction(goal.id, { title: step });
              if (!r.ok) return toast.error(r.error);
              setStep("");
              void changed();
            }}
          >
            <Input aria-label="Nova etapa" value={step} onChange={(e) => setStep(e.target.value)} placeholder="Nova etapa" maxLength={300} />
            <Button type="submit" variant="outline" disabled={!step.trim()}><Plus /></Button>
          </form>
        </section>

        {goal.description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{goal.description}</p>}

        <DialogFooter className="flex-wrap justify-between">
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                if (!(await confirm({ title: "Excluir meta?", danger: true, confirmLabel: "Excluir" }))) return;
                const r = await deleteGoalAction(goal.id);
                if (!r.ok) return toast.error(r.error);
                toast.success(r.message);
                onClose();
                router.refresh();
              }}
            >
              <Trash2 /> Excluir
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onEdit(goal)}><Pencil /> Editar</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select
              aria-label="Status da meta"
              value={goal.status}
              className="h-8 w-40"
              onChange={async (e) => {
                const r = await setGoalStatusAction(goal.id, e.target.value);
                if (!r.ok) return toast.error(r.error);
                toast.success(r.message);
                void changed();
              }}
            >
              {Object.entries(GOAL_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
            {goal.status === "ACTIVE" && goal.situation === "ACHIEVED" && (
              <Button
                size="sm"
                onClick={async () => {
                  const r = await setGoalStatusAction(goal.id, "ACHIEVED");
                  if (!r.ok) return toast.error(r.error);
                  toast.success("Meta marcada como atingida.");
                  void changed();
                }}
              >
                <CheckCircle2 /> Marcar como atingida
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
