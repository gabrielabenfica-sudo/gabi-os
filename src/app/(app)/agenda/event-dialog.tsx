"use client";

import * as React from "react";
import Link from "next/link";
import { FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Checkbox } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm";
import { RecurrencePicker } from "@/components/forms/recurrence-picker";
import { EVENT_STATUS_LABEL, PRIORITY_LABEL } from "@/components/priority";
import { ConflictDialog } from "./conflict-dialog";
import { createEventAction, deleteEventAction, getEventAction, updateEventAction } from "./actions";
import { partsInTz, REMINDER_OPTIONS, type AgendaWs, type Conflict, type ProjectRef, type TaskRef } from "./shared";

export type EventDialogState =
  | { mode: "new"; start?: Date; end?: Date; allDay?: boolean }
  | { mode: "edit"; eventId: string };

type Values = {
  workspaceId: string;
  title: string;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  location: string;
  attendees: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  rrule: string | null;
  reminderMinutes: string;
  transparency: "BUSY" | "FREE";
  status: "NOT_STARTED" | "IN_PROGRESS" | "DONE" | "CANCELLED";
  description: string;
  notes: string;
  taskId: string;
  projectId: string;
};

function addHour(hm: string): string {
  const [h, m] = hm.split(":").map(Number) as [number, number];
  return `${String(Math.min(23, h + 1)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function initialValues(state: EventDialogState, tz: string, defaultWs: string): Values {
  const base: Values = {
    workspaceId: defaultWs, title: "", allDay: false, startDate: "", startTime: "09:00", endDate: "", endTime: "10:00",
    location: "", attendees: "", priority: "MEDIUM", rrule: null, reminderMinutes: "", transparency: "BUSY",
    status: "NOT_STARTED", description: "", notes: "", taskId: "", projectId: "",
  };
  if (state.mode === "new") {
    const now = new Date();
    const start = state.start ?? new Date(Math.ceil(now.getTime() / 1_800_000) * 1_800_000);
    const s = state.allDay ? { ymd: start.toISOString().slice(0, 10), hm: "09:00" } : partsInTz(start, tz);
    let e: { ymd: string; hm: string };
    if (state.allDay && state.end) {
      // Fim exclusivo da seleção → último dia inclusive
      e = { ymd: new Date(state.end.getTime() - 86_400_000).toISOString().slice(0, 10), hm: "10:00" };
    } else if (state.end) e = partsInTz(state.end, tz);
    else e = { ymd: s.ymd, hm: addHour(s.hm) };
    return { ...base, allDay: Boolean(state.allDay), startDate: s.ymd, startTime: s.hm, endDate: e.ymd, endTime: e.hm, transparency: state.allDay ? "FREE" : "BUSY" };
  }
  return base;
}

export function EventDialog({
  state,
  workspaces,
  defaultWorkspaceId,
  tz,
  tasks,
  projects,
  onClose,
  onSaved,
}: {
  state: EventDialogState;
  workspaces: AgendaWs[];
  defaultWorkspaceId: string;
  tz: string;
  tasks: TaskRef[];
  projects: ProjectRef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const confirm = useConfirm();
  const [values, setValues] = React.useState<Values>(() => initialValues(state, tz, defaultWorkspaceId));
  const [loading, setLoading] = React.useState(state.mode === "edit");
  const [saving, setSaving] = React.useState(false);
  const [conflicts, setConflicts] = React.useState<Conflict[] | null>(null);
  const [linkedNotes, setLinkedNotes] = React.useState<{ id: string; title: string }[]>([]);
  const isEdit = state.mode === "edit";

  React.useEffect(() => {
    if (state.mode !== "edit") return;
    getEventAction(state.eventId).then((r) => {
      if (!r.ok) {
        toast.error(r.error);
        return onClose();
      }
      const e = r.data.event;
      const start = new Date(e.start);
      const end = new Date(e.end);
      const s = e.allDay ? { ymd: start.toISOString().slice(0, 10), hm: "09:00" } : partsInTz(start, tz);
      const en = e.allDay ? { ymd: new Date(end.getTime() - 86_400_000).toISOString().slice(0, 10), hm: "10:00" } : partsInTz(end, tz);
      setValues({
        workspaceId: e.workspaceId, title: e.title, allDay: e.allDay, startDate: s.ymd, startTime: s.hm, endDate: en.ymd, endTime: en.hm,
        location: e.location ?? "", attendees: Array.isArray(e.attendees) ? (e.attendees as string[]).join(", ") : "",
        priority: e.priority, rrule: e.rrule, reminderMinutes: e.reminderMinutes?.toString() ?? "", transparency: e.transparency,
        status: e.status, description: e.description ?? "", notes: e.notes ?? "", taskId: e.taskId ?? "", projectId: e.projectId ?? "",
      });
      setLinkedNotes(r.data.notes);
      setLoading(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Values>(k: K, v: Values[K]) => setValues((prev) => ({ ...prev, [k]: v }));

  const submit = async (allowConflict = false) => {
    setSaving(true);
    const input = {
      workspaceId: values.workspaceId,
      title: values.title,
      allDay: values.allDay,
      startDate: values.startDate,
      startTime: values.allDay ? undefined : values.startTime,
      endDate: values.endDate,
      endTime: values.allDay ? undefined : values.endTime,
      location: values.location || null,
      attendees: values.attendees.split(/[,;\n]/).map((a) => a.trim()).filter(Boolean),
      priority: values.priority,
      rrule: values.rrule,
      reminderMinutes: values.reminderMinutes === "" ? null : Number(values.reminderMinutes),
      transparency: values.transparency,
      status: values.status,
      description: values.description || null,
      notes: values.notes || null,
      taskId: values.taskId || null,
      projectId: values.projectId || null,
    };
    const r = isEdit ? await updateEventAction(state.eventId, input, allowConflict) : await createEventAction(input, allowConflict);
    setSaving(false);
    if (!r.ok) return toast.error(r.error);
    if (!r.data.saved) return setConflicts(r.data.conflicts);
    setConflicts(null);
    toast.success(isEdit ? "Compromisso salvo." : "Compromisso criado.", {
      description: r.data.conflicts.length ? "Salvo com sobreposição de horário, conforme confirmado." : undefined,
    });
    onSaved();
    onClose();
  };

  const wsTasks = tasks.filter((t) => t.workspaceId === values.workspaceId);
  const wsProjects = projects.filter((p) => p.workspaceId === values.workspaceId);

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
          <div className="grid gap-1 pr-8">
            <DialogTitle>{isEdit ? "Editar compromisso" : "Novo compromisso"}</DialogTitle>
            <DialogDescription>Os três ambientes são verificados para evitar horários sobrepostos.</DialogDescription>
          </div>
          {loading ? (
            <div className="h-72 animate-pulse rounded-lg bg-muted" />
          ) : (
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void submit(false);
              }}
            >
              <Field label="Título" htmlFor="ev-title">
                <Input id="ev-title" value={values.title} onChange={(e) => set("title", e.target.value)} required autoFocus={!isEdit} maxLength={300} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Ambiente" htmlFor="ev-ws">
                  <Select id="ev-ws" value={values.workspaceId} onChange={(e) => setValues((v) => ({ ...v, workspaceId: e.target.value, taskId: "", projectId: "" }))}>
                    {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </Select>
                </Field>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <Checkbox
                    checked={values.allDay}
                    onChange={(e) => setValues((v) => ({ ...v, allDay: e.target.checked, transparency: e.target.checked ? "FREE" : "BUSY" }))}
                  />
                  Dia inteiro
                </label>
                <Field label="Início" htmlFor="ev-start">
                  <div className="flex gap-2">
                    <Input
                      id="ev-start"
                      type="date"
                      value={values.startDate}
                      onChange={(e) => setValues((v) => ({ ...v, startDate: e.target.value, endDate: v.endDate < e.target.value ? e.target.value : v.endDate }))}
                      required
                    />
                    {!values.allDay && <Input type="time" value={values.startTime} onChange={(e) => set("startTime", e.target.value)} aria-label="Hora de início" className="w-28" required />}
                  </div>
                </Field>
                <Field label="Fim" htmlFor="ev-end">
                  <div className="flex gap-2">
                    <Input id="ev-end" type="date" value={values.endDate} onChange={(e) => set("endDate", e.target.value)} required />
                    {!values.allDay && <Input type="time" value={values.endTime} onChange={(e) => set("endTime", e.target.value)} aria-label="Hora de fim" className="w-28" required />}
                  </div>
                </Field>
                <Field label="Local ou link" htmlFor="ev-location">
                  <Input id="ev-location" value={values.location} onChange={(e) => set("location", e.target.value)} placeholder="Endereço ou https://meet…" />
                </Field>
                <Field label="Participantes" htmlFor="ev-attendees" hint="Separe por vírgula.">
                  <Input id="ev-attendees" value={values.attendees} onChange={(e) => set("attendees", e.target.value)} />
                </Field>
                <Field label="Repetição" htmlFor="ev-rrule">
                  <RecurrencePicker id="ev-rrule" value={values.rrule} onChange={(r) => set("rrule", r)} baseWeekday={values.startDate ? new Date(`${values.startDate}T12:00:00Z`).getUTCDay() : undefined} />
                </Field>
                <Field label="Lembrete" htmlFor="ev-reminder">
                  <Select id="ev-reminder" value={values.reminderMinutes} onChange={(e) => set("reminderMinutes", e.target.value)}>
                    {REMINDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </Field>
                <Field label="Prioridade" htmlFor="ev-priority">
                  <Select id="ev-priority" value={values.priority} onChange={(e) => set("priority", e.target.value as Values["priority"])}>
                    {(Object.keys(PRIORITY_LABEL) as (keyof typeof PRIORITY_LABEL)[]).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                  </Select>
                </Field>
                <Field label="Disponibilidade" htmlFor="ev-transp" hint="Eventos livres não bloqueiam o horário.">
                  <Select id="ev-transp" value={values.transparency} onChange={(e) => set("transparency", e.target.value as Values["transparency"])}>
                    <option value="BUSY">Ocupado</option>
                    <option value="FREE">Livre</option>
                  </Select>
                </Field>
                <Field label="Status" htmlFor="ev-status">
                  <Select id="ev-status" value={values.status} onChange={(e) => set("status", e.target.value as Values["status"])}>
                    {(Object.keys(EVENT_STATUS_LABEL) as (keyof typeof EVENT_STATUS_LABEL)[]).map((s) => <option key={s} value={s}>{EVENT_STATUS_LABEL[s]}</option>)}
                  </Select>
                </Field>
                <Field label="Tarefa vinculada" htmlFor="ev-task">
                  <Select id="ev-task" value={values.taskId} onChange={(e) => set("taskId", e.target.value)}>
                    <option value="">Nenhuma</option>
                    {wsTasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </Select>
                </Field>
                <Field label="Projeto" htmlFor="ev-project">
                  <Select id="ev-project" value={values.projectId} onChange={(e) => set("projectId", e.target.value)}>
                    <option value="">Nenhum</option>
                    {wsProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </Field>
              </div>
              <Field label="Descrição" htmlFor="ev-desc">
                <Textarea id="ev-desc" value={values.description} onChange={(e) => set("description", e.target.value)} rows={3} />
              </Field>
              <Field label="Anotações" htmlFor="ev-notes">
                <Textarea id="ev-notes" value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
              </Field>
              {linkedNotes.length > 0 && (
                <div className="grid gap-1 text-sm">
                  <span className="font-medium">Anotações vinculadas</span>
                  {linkedNotes.map((n) => (
                    <Link key={n.id} href={`/anotacoes?n=${n.id}`} className="inline-flex items-center gap-1.5 hover:underline">
                      <FileText className="size-4 text-muted-foreground" /> {n.title}
                    </Link>
                  ))}
                </div>
              )}
              {values.rrule && isEdit && <p className="text-xs text-muted-foreground">Alterações em um compromisso recorrente valem para toda a série.</p>}
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                <Button type="submit" disabled={saving || !values.title.trim()}>{saving ? "Salvando…" : isEdit ? "Salvar" : "Criar compromisso"}</Button>
                <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
                {isEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="ml-auto text-danger hover:text-danger"
                    onClick={async () => {
                      const ok = await confirm({
                        title: "Excluir compromisso?",
                        description: values.rrule ? "Todas as ocorrências da série serão excluídas." : undefined,
                        confirmLabel: "Excluir",
                        danger: true,
                      });
                      if (!ok) return;
                      const r = await deleteEventAction(state.eventId);
                      if (!r.ok) return toast.error(r.error);
                      toast.success(r.message);
                      onSaved();
                      onClose();
                    }}
                  >
                    <Trash2 /> Excluir
                  </Button>
                )}
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      {conflicts && (
        <ConflictDialog conflicts={conflicts} tz={tz} busy={saving} onChooseAnother={() => setConflicts(null)} onConfirm={() => submit(true)} />
      )}
    </>
  );
}
