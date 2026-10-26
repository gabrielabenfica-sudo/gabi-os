"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ListChecks, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, EmptyState, WsDot } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form-controls";
import { formatDateBR, formatDateTimeBR } from "@/lib/dates";
import { durationLabel } from "@/lib/routines";
import type { ProcessView } from "@/server/routines";
import { completeRunAction, deleteRunAction, setRunStepAction, startRunAction } from "./actions";
import { RoutineMenu } from "./day-view";
import type { EditableRoutine } from "./routine-dialog";

export function ProcessesView({ processes, showArchived, onEdit, onNew }: { processes: ProcessView[]; showArchived: boolean; onEdit: (r: EditableRoutine) => void; onNew: () => void }) {
  if (!processes.length) {
    return (
      <EmptyState
        icon={ListChecks}
        title={showArchived ? "Nenhum processo arquivado" : "Nenhum processo ainda"}
        description={showArchived ? undefined : "Ex.: rotina de gravação, fechamento do mês, boas-vindas a um mentorado."}
        action={!showArchived && <Button onClick={onNew}><Plus /> Criar processo</Button>}
      />
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {processes.map((p) => <ProcessCard key={p.id} process={p} onEdit={() => onEdit(p)} />)}
    </div>
  );
}

function ProcessCard({ process, onEdit }: { process: ProcessView; onEdit: () => void }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [finishing, setFinishing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);
  const open = process.openRun;
  const serverDone = React.useMemo(() => new Set(open?.steps.filter((st) => st.done).map((st) => st.id) ?? []), [open]);
  const [stepsDone, setStepsDone] = React.useState(serverDone);
  React.useEffect(() => setStepsDone(serverDone), [serverDone]);
  const lastDone = process.recentRuns[0];

  const act = async (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    if (r.message) toast.success(r.message);
    router.refresh();
  };

  const toggleStep = async (stepId: string, done: boolean) => {
    setStepsDone((prev) => {
      const next = new Set(prev);
      if (done) next.add(stepId);
      else next.delete(stepId);
      return next;
    });
    const r = await setRunStepAction(stepId, done);
    if (!r.ok) {
      toast.error(r.error);
      setStepsDone(serverDone);
    } else router.refresh();
  };

  const finish = async (note: string) => {
    if (!open) return;
    setFinishing(false);
    await act(() => completeRunAction(open.id, note.trim() || null));
  };

  return (
    <article className="flex flex-col rounded-xl border border-border bg-card p-4" data-process={process.name}>
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 font-medium">
            <span className="size-2.5 rounded-full" style={{ background: process.color ?? process.workspace.color }} aria-hidden />
            {process.name}
          </h3>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <WsDot color={process.workspace.color} className="size-2" /> {process.workspace.name} · {process.items.length} {process.items.length === 1 ? "passo" : "passos"} ·{" "}
            {process.completedRuns ? `executado ${process.completedRuns}x · último em ${formatDateBR(new Date(lastDone!.completedAt!))}` : "nunca executado"}
          </p>
          {process.description && <p className="mt-1 text-sm text-muted-foreground">{process.description}</p>}
        </div>
        <RoutineMenu routine={process} onEdit={onEdit} what="de execuções" />
      </header>

      {open ? (
        <div className="mt-3 grid gap-2 rounded-lg bg-muted/40 p-3" aria-label={`Execução em andamento de ${process.name}`}>
          <p className="text-xs text-muted-foreground">
            Em andamento desde {formatDateTimeBR(new Date(open.startedAt))} · {stepsDone.size}/{open.steps.length} passos
          </p>
          <ul className="grid gap-1">
            {open.steps.map((s) => (
              <li key={s.id}>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={stepsDone.has(s.id)} onChange={(e) => toggleStep(s.id, e.target.checked)} />
                  <span className={stepsDone.has(s.id) ? "text-muted-foreground line-through" : ""}>{s.title}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                if (!(await confirm({ title: "Descartar esta execução?", description: "Ela não vai entrar no histórico.", confirmLabel: "Descartar", danger: true }))) return;
                await act(() => deleteRunAction(open.id));
              }}
            >
              Descartar
            </Button>
            <Button size="sm" disabled={busy} onClick={() => setFinishing(true)}>Concluir</Button>
          </div>
        </div>
      ) : (
        process.active && (
          <div className="mt-3">
            <Button size="sm" disabled={busy} onClick={() => act(() => startRunAction(process.id))}>
              <Play /> Iniciar
            </Button>
          </div>
        )
      )}

      {process.recentRuns.length > 0 && (
        <div className="mt-3 border-t border-border pt-2">
          <button type="button" className="text-xs font-medium text-muted-foreground hover:text-foreground" aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? "Ocultar histórico" : `Ver histórico (${process.recentRuns.length === process.completedRuns ? process.completedRuns : `últimas ${process.recentRuns.length}`})`}
          </button>
          {showHistory && (
            <ul className="mt-2 grid gap-1.5 text-sm">
              {process.recentRuns.map((run) => {
                const done = run.steps.filter((s) => s.done).length;
                return (
                  <li key={run.id} className="flex items-start justify-between gap-2">
                    <div>
                      <span className="tabular">{formatDateTimeBR(new Date(run.completedAt!))}</span>
                      <span className="text-muted-foreground"> · {done}/{run.steps.length} passos · {durationLabel(new Date(run.startedAt), new Date(run.completedAt!))}</span>
                      {run.note && <p className="text-xs text-muted-foreground">{run.note}</p>}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Excluir execução"
                      onClick={async () => {
                        if (!(await confirm({ title: "Excluir esta execução do histórico?", confirmLabel: "Excluir", danger: true }))) return;
                        await act(() => deleteRunAction(run.id));
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      {finishing && open && <FinishDialog missing={open.steps.length - stepsDone.size} onCancel={() => setFinishing(false)} onConfirm={finish} />}
    </article>
  );
}

function FinishDialog({ missing, onCancel, onConfirm }: { missing: number; onCancel: () => void; onConfirm: (note: string) => void }) {
  const [note, setNote] = React.useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Concluir execução</DialogTitle>
          <DialogDescription>{missing ? `Faltam ${missing} ${missing === 1 ? "passo" : "passos"}. Você pode concluir assim mesmo.` : "Todos os passos foram feitos."}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onConfirm(note);
          }}
        >
          <Field label="Observação (opcional)" htmlFor="run-note">
            <Textarea id="run-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} autoFocus />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
            <Button type="submit">Concluir</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
