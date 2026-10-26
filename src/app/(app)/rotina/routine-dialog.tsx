"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { cn } from "@/lib/utils";
import { createRoutineAction, updateRoutineAction } from "./actions";

export type Ws = { id: string; name: string; color: string; kind: string };

export type EditableRoutine = {
  id: string;
  kind: "SCHEDULE" | "CHECKLIST";
  name: string;
  description: string | null;
  daysOfWeek: number[];
  color: string | null;
  workspace: { id: string };
  items: { id: string; title: string; time: string | null }[];
};

export const WEEKDAY_SHORT = ["D", "S", "T", "Q", "Q", "S", "S"];
export const WEEKDAY_NAME = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "Dias úteis", "Fim de semana", "Todos os dias" ou a lista abreviada. */
export function daysLabel(days: number[]) {
  const set = [...days].sort().join(",");
  if (set === "0,1,2,3,4,5,6") return "Todos os dias";
  if (set === "1,2,3,4,5") return "Dias úteis";
  if (set === "0,6") return "Fim de semana";
  return [...days].sort().map((d) => WEEKDAY_NAME[d]!.slice(0, 3)).join(", ");
}

type Row = { key: string; id?: string; title: string; time: string };

let rowSeq = 0;
const newRow = (time = ""): Row => ({ key: `n${++rowSeq}`, title: "", time });

export function RoutineDialog({ kind, routine, workspaces, onClose }: { kind: "SCHEDULE" | "CHECKLIST"; routine: EditableRoutine | null; workspaces: Ws[]; onClose: () => void }) {
  const schedule = kind === "SCHEDULE";
  const defaultWs = workspaces.find((w) => w.kind === "PESSOAL")?.id ?? workspaces[0]?.id ?? "";
  const [values, setValues] = React.useState({
    workspaceId: routine?.workspace.id ?? defaultWs,
    name: routine?.name ?? "",
    description: routine?.description ?? "",
    daysOfWeek: routine?.daysOfWeek ?? [1, 2, 3, 4, 5],
    color: routine?.color ?? "#A66F7C",
  });
  const [rows, setRows] = React.useState<Row[]>(() =>
    routine?.items.length ? routine.items.map((i) => ({ key: i.id, id: i.id, title: i.title, time: i.time ?? "" })) : [newRow(schedule ? "06:00" : "")],
  );
  const [saving, setSaving] = React.useState(false);
  const set = <K extends keyof typeof values>(k: K, v: (typeof values)[K]) => setValues((p) => ({ ...p, [k]: v }));
  const setRow = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (idx: number, delta: number) =>
    setRows((rs) => {
      const next = [...rs];
      const [r] = next.splice(idx, 1);
      next.splice(idx + delta, 0, r!);
      return next;
    });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = rows.filter((r) => r.title.trim());
    setSaving(true);
    const input = {
      kind,
      workspaceId: values.workspaceId,
      name: values.name,
      description: values.description || null,
      daysOfWeek: schedule ? values.daysOfWeek : [],
      color: values.color,
      items: items.map((r) => ({ id: r.id, title: r.title, time: schedule ? r.time || null : null })),
    };
    const r = routine ? await updateRoutineAction(routine.id, input) : await createRoutineAction(input);
    setSaving(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(r.message);
    onClose();
  };

  const label = schedule ? "rotina do dia" : "processo";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{routine ? `Editar ${label}` : schedule ? "Nova rotina do dia" : "Novo processo"}</DialogTitle>
          <DialogDescription>
            {schedule ? "Monte o roteiro com os horários e escolha em que dias ele vale." : "Liste os passos na ordem em que você costuma fazer."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-4">
          <Field label="Nome" htmlFor="rt-name">
            <Input id="rt-name" value={values.name} onChange={(e) => set("name", e.target.value)} placeholder={schedule ? "Ex.: Dias úteis" : "Ex.: Rotina de gravação"} required autoFocus maxLength={80} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <Field label="Ambiente" htmlFor="rt-ws">
              <Select id="rt-ws" value={values.workspaceId} onChange={(e) => set("workspaceId", e.target.value)}>
                {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </Field>
            <Field label="Cor" htmlFor="rt-color">
              <input id="rt-color" type="color" value={values.color} onChange={(e) => set("color", e.target.value)} className="h-9 w-16 cursor-pointer rounded-md border border-input bg-card p-1" />
            </Field>
          </div>
          {!schedule && (
            <Field label="Descrição" htmlFor="rt-desc">
              <Textarea id="rt-desc" value={values.description} onChange={(e) => set("description", e.target.value)} rows={2} maxLength={500} placeholder="Quando usar este processo (opcional)" />
            </Field>
          )}
          {schedule && (
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">Dias da semana</span>
              <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Dias da semana">
                {WEEKDAY_SHORT.map((d, i) => {
                  const on = values.daysOfWeek.includes(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      aria-pressed={on}
                      aria-label={WEEKDAY_NAME[i]}
                      onClick={() => set("daysOfWeek", on ? values.daysOfWeek.filter((x) => x !== i) : [...values.daysOfWeek, i])}
                      className={cn("size-9 rounded-full text-xs font-medium", on ? "bg-primary text-primary-foreground" : "bg-card ring-1 ring-border hover:bg-accent")}
                    >
                      {d}
                    </button>
                  );
                })}
                <span className="ml-2 flex gap-1">
                  <Button type="button" size="sm" variant="ghost" onClick={() => set("daysOfWeek", [1, 2, 3, 4, 5])}>Dias úteis</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => set("daysOfWeek", [0, 6])}>Fim de semana</Button>
                </span>
              </div>
            </div>
          )}

          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-medium">{schedule ? "Itens do dia" : "Passos"}</legend>
            {rows.map((r, idx) => (
              <div key={r.key} className="flex items-center gap-2" data-row={idx}>
                {schedule ? (
                  <Input type="time" aria-label={`Horário do item ${idx + 1}`} value={r.time} onChange={(e) => setRow(r.key, { time: e.target.value })} className="w-28 shrink-0" required={!!r.title.trim()} />
                ) : (
                  <span className="w-6 shrink-0 text-right text-xs tabular text-muted-foreground">{idx + 1}.</span>
                )}
                <Input aria-label={`${schedule ? "Item" : "Passo"} ${idx + 1}`} value={r.title} onChange={(e) => setRow(r.key, { title: e.target.value })} placeholder={schedule ? "Ex.: Devocional" : "Ex.: Revisar roteiro"} maxLength={120} />
                {!schedule && (
                  <>
                    <Button type="button" size="icon" variant="ghost" aria-label="Subir" disabled={idx === 0} onClick={() => move(idx, -1)}><ArrowUp /></Button>
                    <Button type="button" size="icon" variant="ghost" aria-label="Descer" disabled={idx === rows.length - 1} onClick={() => move(idx, 1)}><ArrowDown /></Button>
                  </>
                )}
                <Button type="button" size="icon" variant="ghost" aria-label="Remover" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><X /></Button>
              </div>
            ))}
            <div>
              <Button type="button" size="sm" variant="outline" onClick={() => setRows((rs) => [...rs, newRow()])}>
                <Plus /> {schedule ? "Adicionar item" : "Adicionar passo"}
              </Button>
            </div>
            {schedule && <p className="text-xs text-muted-foreground">Os itens aparecem no dia em ordem de horário. Tirar um item não apaga o que já foi marcado nos dias anteriores.</p>}
            {!schedule && routine && <p className="text-xs text-muted-foreground">Mudar os passos não altera as execuções que já foram feitas.</p>}
          </fieldset>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving || !values.name.trim() || !rows.some((r) => r.title.trim())}>{saving ? "Salvando…" : "Salvar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
