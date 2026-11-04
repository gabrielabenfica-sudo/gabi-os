import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateGoal, useDeleteGoal, useSaveGoal } from "@/lib/mutations";
import { useWorkspace } from "@/lib/workspace";
import type { Goal } from "@/lib/types";

type Kind = "NUMBER" | "OBJECTIVE";

type FormState = {
  kind: Kind;
  title: string;
  type: string;
  category: string;
  description: string;
  unit: string;
  start_value: string;
  target_value: string;
  current_value: string;
  start_date: string;
  due_date: string;
  status: string;
  steps: Array<{ id: string; title: string; done: boolean }>;
};

const UNITS: Array<{ value: string; label: string }> = [
  { value: "BRL", label: "Reais (R$)" },
  { value: "kg", label: "Quilos (kg)" },
  { value: "%", label: "Porcentagem (%)" },
  { value: "seguidores", label: "Seguidores" },
  { value: "vezes", label: "Vezes" },
  { value: "horas", label: "Horas" },
  { value: "livros", label: "Livros" },
  { value: "none", label: "Sem unidade" },
];

const toText = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value));
const toNumber = (value: string) => {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
};

function initialState(goal: Goal | null, kind: Kind): FormState {
  if (!goal) {
    return {
      kind,
      title: "",
      type: kind === "OBJECTIVE" ? "DEVELOPMENT" : "FINANCIAL",
      category: "",
      description: "",
      unit: "BRL",
      start_value: "",
      target_value: "",
      current_value: "",
      start_date: new Date().toISOString().slice(0, 10),
      due_date: "",
      status: "ACTIVE",
      steps: [],
    };
  }
  return {
    kind: goal.is_objective ? "OBJECTIVE" : "NUMBER",
    title: goal.title ?? "",
    type: goal.type ?? "DEVELOPMENT",
    category: goal.category ?? "",
    description: goal.description ?? "",
    unit: goal.unit ?? "none",
    start_value: toText(goal.start_value),
    target_value: toText(goal.target_value),
    current_value: toText(goal.current_value),
    start_date: goal.start_date ?? "",
    due_date: goal.due_date ?? "",
    status: goal.status ?? "ACTIVE",
    steps: goal.steps ?? [],
  };
}

export function GoalFormDialog({
  open,
  onOpenChange,
  goal,
  defaultKind = "NUMBER",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: Goal | null;
  defaultKind?: Kind;
}) {
  const { activeId } = useWorkspace();
  const createGoal = useCreateGoal();
  const saveGoal = useSaveGoal();
  const deleteGoal = useDeleteGoal();
  const [form, setForm] = useState<FormState>(() => initialState(goal, defaultKind));
  const [newStep, setNewStep] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initialState(goal, defaultKind));
      setNewStep("");
      setConfirmDelete(false);
    }
  }, [open, goal, defaultKind]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  const isNumber = form.kind === "NUMBER";
  const busy = createGoal.isPending || saveGoal.isPending || deleteGoal.isPending;

  const addStep = () => {
    const title = newStep.trim();
    if (!title) return;
    set("steps", [...form.steps, { id: crypto.randomUUID(), title, done: false }]);
    setNewStep("");
  };

  const submit = () => {
    if (!form.title.trim()) {
      toast.error("Dê um nome para a meta.");
      return;
    }
    const start = toNumber(form.start_value);
    const target = toNumber(form.target_value);
    const current = toNumber(form.current_value) ?? start;
    if (isNumber && target === null) {
      toast.error("Informe o valor que você quer alcançar.");
      return;
    }

    const values: Record<string, unknown> = {
      title: form.title.trim(),
      type: form.type,
      category: form.category.trim() || null,
      description: form.description.trim() || null,
      is_objective: !isNumber,
      measure: isNumber ? "QUANTITATIVE" : "QUALITATIVE",
      direction: isNumber && start !== null && target !== null && target < start ? "DOWN" : "UP",
      unit: isNumber && form.unit !== "none" ? form.unit : null,
      start_value: isNumber ? start : null,
      target_value: isNumber ? target : null,
      current_value: isNumber ? current : null,
      start_date: form.start_date || null,
      due_date: form.due_date || null,
      status: form.status,
      steps: form.steps,
      updated_at: new Date().toISOString(),
    };

    const onSuccess = () => {
      toast.success(goal ? "Meta atualizada." : "Meta criada.");
      onOpenChange(false);
    };
    const onError = (error: unknown) =>
      toast.error(`Não foi possível salvar a meta. ${error instanceof Error ? error.message : ""}`);

    if (goal) {
      // Record the change of the current value in the progress history.
      const progress = [...(goal.progress ?? [])];
      if (isNumber && current !== null && current !== Number(goal.current_value ?? NaN)) {
        progress.push({ id: crypto.randomUUID(), date: new Date().toISOString(), value: String(current), note: "Edição da meta" });
      }
      saveGoal.mutate({ id: goal.id, values: { ...values, progress } }, { onSuccess, onError });
    } else {
      if (!activeId) {
        toast.error("Escolha uma área no menu antes de criar a meta.");
        return;
      }
      const progress =
        isNumber && current !== null
          ? [{ id: crypto.randomUUID(), date: new Date().toISOString(), value: String(current), note: "Início" }]
          : [];
      createGoal.mutate({ ...values, workspace_id: activeId, progress }, { onSuccess, onError });
    }
  };

  const remove = () => {
    if (!goal) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    deleteGoal.mutate(goal.id, {
      onSuccess: () => {
        toast.success("Meta excluída.");
        onOpenChange(false);
      },
      onError: () => toast.error("Não foi possível excluir a meta."),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{goal ? "Editar meta" : "Nova meta"}</DialogTitle>
          <DialogDescription>
            {isNumber ? "Meta com número: você acompanha o valor até chegar no alvo." : "Objetivo com passos: você marca cada passo concluído."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(["NUMBER", "OBJECTIVE"] as Kind[]).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => set("kind", kind)}
                className={`rounded-xl border px-3 py-2 text-sm transition ${
                  form.kind === kind ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                {kind === "NUMBER" ? "Meta com número" : "Objetivo com passos"}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="goal-title">Nome da meta</Label>
            <Input
              id="goal-title"
              value={form.title}
              placeholder={isNumber ? "Ex.: Reserva de emergência" : "Ex.: Retomar a leitura diária"}
              onChange={(event) => set("title", event.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={(value) => set("type", value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FINANCIAL">Financeira</SelectItem>
                  <SelectItem value="DEVELOPMENT">Desenvolvimento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-category">Área da vida</Label>
              <Input
                id="goal-category"
                value={form.category}
                placeholder="Ex.: Saúde, Carreira"
                onChange={(event) => set("category", event.target.value)}
              />
            </div>
          </div>

          {isNumber ? (
            <>
              <div className="space-y-1.5">
                <Label>Unidade</Label>
                <Select value={form.unit} onValueChange={(value) => set("unit", value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map((unit) => (
                      <SelectItem key={unit.value} value={unit.value}>{unit.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="goal-start">Início</Label>
                  <Input id="goal-start" inputMode="decimal" value={form.start_value} onChange={(event) => set("start_value", event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="goal-current">Atual</Label>
                  <Input id="goal-current" inputMode="decimal" value={form.current_value} onChange={(event) => set("current_value", event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="goal-target">Alvo</Label>
                  <Input id="goal-target" inputMode="decimal" value={form.target_value} onChange={(event) => set("target_value", event.target.value)} />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Para metas de diminuir (ex.: peso), coloque o alvo menor que o início.
              </p>
            </>
          ) : (
            <div className="space-y-2">
              <Label>Passos</Label>
              {form.steps.map((step, index) => (
                <div key={step.id} className="flex items-center gap-2">
                  <Input
                    value={step.title}
                    onChange={(event) =>
                      set("steps", form.steps.map((item, i) => (i === index ? { ...item, title: event.target.value } : item)))
                    }
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Remover passo"
                    onClick={() => set("steps", form.steps.filter((_, i) => i !== index))}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Input
                  value={newStep}
                  placeholder="Novo passo"
                  onChange={(event) => setNewStep(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addStep();
                    }
                  }}
                />
                <Button type="button" size="icon" variant="outline" aria-label="Adicionar passo" onClick={addStep}>
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="goal-description">Descrição (opcional)</Label>
            <Textarea id="goal-description" rows={2} value={form.description} onChange={(event) => set("description", event.target.value)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="goal-start-date">Começo</Label>
              <Input id="goal-start-date" type="date" value={form.start_date} onChange={(event) => set("start_date", event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-due">Prazo</Label>
              <Input id="goal-due" type="date" value={form.due_date} onChange={(event) => set("due_date", event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Situação</Label>
              <Select value={form.status} onValueChange={(value) => set("status", value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Ativa</SelectItem>
                  <SelectItem value="DONE">Concluída</SelectItem>
                  <SelectItem value="PAUSED">Pausada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {goal ? (
            <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={remove} disabled={busy}>
              <Trash2 className="size-4" /> {confirmDelete ? "Confirmar exclusão" : "Excluir"}
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" onClick={submit} disabled={busy}>
            {goal ? "Salvar alterações" : "Criar meta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
