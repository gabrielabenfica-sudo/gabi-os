import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { useDeleteMaasAssessment, useSaveMaasAssessment } from "@/lib/mutations";
import type { MaasArea, MaasAssessment, MaasScore } from "@/lib/types";

type Row = {
  area_id: string | null;
  area_name: string;
  score: number | null;
  comment: string;
  action_plan: string;
  goal: string;
  previous: number | null;
};

export function AssessmentDialog({
  open,
  onOpenChange,
  areas,
  assessment,
  scores,
  previousScores,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  areas: MaasArea[];
  /** The assessment being edited, or null to create a new one. */
  assessment: MaasAssessment | null;
  /** Scores of the assessment being edited. */
  scores: MaasScore[];
  /** Scores of the most recent earlier assessment, shown for comparison and to prefill plans. */
  previousScores: MaasScore[];
}) {
  const save = useSaveMaasAssessment();
  const remove = useDeleteMaasAssessment();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    const activeAreas = areas.filter((area) => area.active).sort((a, b) => a.position - b.position);
    const find = (list: MaasScore[], area: MaasArea) =>
      list.find((score) => score.area_id === area.id) ?? list.find((score) => score.area_name === area.name);

    setDate(assessment?.assessment_date ?? new Date().toISOString().slice(0, 10));
    setNotes(assessment?.notes ?? "");
    setRows(
      activeAreas.map((area) => {
        const current = assessment ? find(scores, area) : undefined;
        const previous = find(previousScores, area);
        return {
          area_id: area.id,
          area_name: area.name,
          score: current?.score ?? null,
          comment: current?.comment ?? "",
          // New assessments start from the last plan and goal, so only changes need typing.
          action_plan: current?.action_plan ?? (assessment ? "" : previous?.action_plan ?? ""),
          goal: current?.goal ?? (assessment ? "" : previous?.goal ?? ""),
          previous: previous?.score ?? null,
        };
      }),
    );
    setExpanded(null);
    setConfirmDelete(false);
  }, [open, areas, assessment, scores, previousScores]);

  const update = (index: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const filled = rows.filter((row) => row.score !== null).length;
  const busy = save.isPending || remove.isPending;

  const submit = () => {
    if (!date) {
      toast.error("Escolha a data da avaliação.");
      return;
    }
    if (filled === 0) {
      toast.error("Dê nota para pelo menos uma área.");
      return;
    }
    save.mutate(
      {
        id: assessment?.id,
        assessment_date: date,
        notes: notes.trim() || null,
        scores: rows
          .filter((row) => row.score !== null)
          .map((row) => ({
            area_id: row.area_id,
            area_name: row.area_name,
            score: row.score,
            comment: row.comment.trim() || null,
            action_plan: row.action_plan.trim() || null,
            goal: row.goal.trim() || null,
          })),
      },
      {
        onSuccess: () => {
          toast.success(assessment ? "Avaliação atualizada." : "Nova avaliação registrada.");
          onOpenChange(false);
        },
        onError: (error) =>
          toast.error(`Não foi possível salvar. ${error instanceof Error ? error.message : ""}`),
      },
    );
  };

  const destroy = () => {
    if (!assessment) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    remove.mutate(assessment.id, {
      onSuccess: () => {
        toast.success("Avaliação excluída.");
        onOpenChange(false);
      },
      onError: () => toast.error("Não foi possível excluir a avaliação."),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {assessment ? "Editar avaliação" : "Nova avaliação da roda"}
          </DialogTitle>
          <DialogDescription>
            Dê uma nota de 0 a 10 para cada área. A nota anterior aparece ao lado para você comparar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="maas-date">Data da avaliação</Label>
            <Input id="maas-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>

          <div className="space-y-2">
            {rows.map((row, index) => {
              const diff = row.score !== null && row.previous !== null ? row.score - row.previous : null;
              const isOpen = expanded === row.area_name;
              return (
                <div key={row.area_name} className="rounded-xl border border-border/70 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{row.area_name}</p>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      {row.previous !== null ? <span>antes {row.previous}</span> : null}
                      {diff !== null && diff !== 0 ? (
                        <span className={cn("font-medium", diff > 0 ? "text-emerald-600" : "text-destructive")}>
                          {diff > 0 ? `+${diff}` : diff}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {Array.from({ length: 11 }, (_, value) => (
                      <button
                        key={value}
                        type="button"
                        aria-label={`Nota ${value} para ${row.area_name}`}
                        onClick={() => update(index, { score: row.score === value ? null : value })}
                        className={cn(
                          "size-7 rounded-lg border text-xs tabular-nums transition",
                          row.score === value
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-muted-foreground hover:bg-secondary",
                        )}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="mt-2 flex items-center gap-1 text-[11px] text-primary"
                    onClick={() => setExpanded(isOpen ? null : row.area_name)}
                  >
                    {isOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                    Comentário, plano e meta
                  </button>
                  {isOpen ? (
                    <div className="mt-2 space-y-2">
                      <Textarea
                        rows={2}
                        placeholder="Como está essa área hoje?"
                        value={row.comment}
                        onChange={(event) => update(index, { comment: event.target.value })}
                      />
                      <Textarea
                        rows={2}
                        placeholder="Plano de ação"
                        value={row.action_plan}
                        onChange={(event) => update(index, { action_plan: event.target.value })}
                      />
                      <Input
                        placeholder="Meta (nota que quer alcançar)"
                        inputMode="numeric"
                        value={row.goal}
                        onChange={(event) => update(index, { goal: event.target.value })}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="maas-notes">Observações gerais (opcional)</Label>
            <Textarea id="maas-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {assessment ? (
            <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={destroy} disabled={busy}>
              <Trash2 className="size-4" /> {confirmDelete ? "Confirmar exclusão" : "Excluir"}
            </Button>
          ) : (
            <span className="text-[11px] text-muted-foreground">{filled} de {rows.length} áreas com nota</span>
          )}
          <Button type="button" onClick={submit} disabled={busy}>
            {assessment ? "Salvar alterações" : "Registrar avaliação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
