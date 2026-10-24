"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive, ArchiveRestore, CheckCircle2, Copy, FileText, LayoutTemplate, Link2, Paperclip, Plus, RotateCcw, Trash2, Upload, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Checkbox, WsDot } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm";
import { RecurrencePicker } from "@/components/forms/recurrence-picker";
import { PRIORITY_LABEL } from "@/components/priority";
import { describeRRule } from "@/lib/recurrence";
import { cn } from "@/lib/utils";
import type { TaskDetail } from "@/server/tasks";
import type { TaskMeta } from "./types";
import * as actions from "./actions";

type DialogState = { mode: "edit"; taskId: string } | { mode: "new"; statusId?: string; dueDate?: string };

type FormValues = {
  workspaceId: string;
  title: string;
  description: string;
  statusId: string;
  projectId: string;
  assignee: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  startDate: string;
  dueDate: string;
  rrule: string | null;
  estimateMinutes: string;
  labelIds: string[];
  links: { title: string; url: string }[];
};

type Attachment = { id: string; name: string; mimeType: string | null; sizeBytes: number | null; url: string | null };
type LinkedNote = { id: string; title: string };

const HISTORY_LABEL: Record<string, string> = {
  created: "Criada",
  status: "Status",
  title: "Título",
  priority: "Prioridade",
  assignee: "Responsável",
  dueDate: "Prazo",
  startDate: "Início",
  projectId: "Projeto",
  archived: "Arquivada",
  unarchived: "Desarquivada",
};

const ymd = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");

function fromDetail(t: TaskDetail): FormValues {
  return {
    workspaceId: t.workspaceId,
    title: t.title,
    description: t.description ?? "",
    statusId: t.statusId,
    projectId: t.projectId ?? "",
    assignee: t.assignee ?? "",
    priority: t.priority,
    startDate: ymd(t.startDate),
    dueDate: ymd(t.dueDate),
    rrule: t.rrule,
    estimateMinutes: t.estimateMinutes?.toString() ?? "",
    labelIds: t.labels.map((l) => l.labelId),
    links: Array.isArray(t.links) ? (t.links as { title: string; url: string }[]) : [],
  };
}

function formatMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${m ? ` ${m}min` : ""}` : `${m}min`;
}

export function TaskDialog({
  state,
  meta,
  defaultWorkspaceId,
  onClose,
  onOpenTask,
}: {
  state: DialogState;
  meta: TaskMeta;
  defaultWorkspaceId: string;
  onClose: () => void;
  onOpenTask: (id: string) => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const isEdit = state.mode === "edit";
  const [detail, setDetail] = React.useState<TaskDetail | null>(null);
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [linkedNotes, setLinkedNotes] = React.useState<LinkedNote[]>([]);
  const [loading, setLoading] = React.useState(isEdit);
  const [saving, setSaving] = React.useState(false);

  const initialWs = state.mode === "new" && state.statusId ? meta.statuses.find((s) => s.id === state.statusId)?.workspaceId ?? defaultWorkspaceId : defaultWorkspaceId;
  const [values, setValues] = React.useState<FormValues>(() => ({
    workspaceId: initialWs,
    title: "",
    description: "",
    statusId: state.mode === "new" && state.statusId ? state.statusId : "",
    projectId: "",
    assignee: "",
    priority: "MEDIUM",
    startDate: "",
    dueDate: state.mode === "new" && state.dueDate ? state.dueDate : "",
    rrule: null,
    estimateMinutes: "",
    labelIds: [],
    links: [],
  }));

  const load = React.useCallback(async () => {
    if (state.mode !== "edit") return;
    const r = await actions.getTaskAction(state.taskId);
    if (!r.ok) {
      toast.error(r.error);
      onClose();
      return;
    }
    setDetail(r.data.task);
    setAttachments(r.data.attachments);
    setLinkedNotes(r.data.notes);
    setLoading(false);
    return r.data.task;
  }, [state, onClose]);

  React.useEffect(() => {
    if (state.mode === "edit") load().then((t) => t && setValues(fromDetail(t)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof FormValues>(k: K, v: FormValues[K]) => setValues((prev) => ({ ...prev, [k]: v }));
  const wsStatuses = meta.statuses.filter((s) => s.workspaceId === values.workspaceId);
  const wsProjects = meta.projects.filter((p) => p.workspaceId === values.workspaceId);
  const wsLabels = meta.labels.filter((l) => l.workspaceId === values.workspaceId);

  const payload = () => ({
    title: values.title,
    description: values.description || null,
    statusId: values.statusId || undefined,
    projectId: values.projectId || null,
    assignee: values.assignee || null,
    priority: values.priority,
    startDate: values.startDate || null,
    dueDate: values.dueDate || null,
    rrule: values.rrule,
    estimateMinutes: values.estimateMinutes ? Number(values.estimateMinutes) : null,
    labelIds: values.labelIds,
    links: values.links.filter((l) => l.url.trim()),
  });

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSaving(true);
    const r = isEdit
      ? await actions.updateTaskAction(state.taskId, payload())
      : await actions.createTaskAction({ ...payload(), workspaceId: values.workspaceId });
    setSaving(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(r.message);
    if (isEdit) {
      await load();
      router.refresh();
    } else onClose();
  };

  const runAndReload = async (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, close = false) => {
    const r = await fn();
    if (!r.ok) return toast.error(r.error ?? "Erro.");
    if (r.message) toast.success(r.message);
    router.refresh();
    if (close) onClose();
    else await load();
  };

  const title = isEdit ? (loading ? "Carregando…" : "Editar tarefa") : "Nova tarefa";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn("max-h-[92dvh] overflow-y-auto", isEdit ? "max-w-5xl" : "max-w-2xl")}>
        <div className="grid gap-1 pr-8">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {detail ? (
              <span className="inline-flex items-center gap-1.5">
                <WsDot color={meta.workspaces.find((w) => w.id === detail.workspaceId)?.color ?? "#999"} />
                {meta.workspaces.find((w) => w.id === detail.workspaceId)?.name}
                {detail.parent && (
                  <>
                    {" · subtarefa de "}
                    <button type="button" className="underline" onClick={() => onOpenTask(detail.parent!.id)}>{detail.parent.title}</button>
                  </>
                )}
              </span>
            ) : (
              "Preencha o essencial; o resto pode ficar para depois."
            )}
          </DialogDescription>
        </div>

        {loading ? (
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        ) : (
          <div className={cn("grid gap-6", isEdit && "lg:grid-cols-[1.2fr_1fr]")}>
            {/* ── Formulário principal ── */}
            <form onSubmit={save} className="grid content-start gap-4">
              <Field label="Título" htmlFor="task-title">
                <Input id="task-title" value={values.title} onChange={(e) => set("title", e.target.value)} required autoFocus={!isEdit} maxLength={300} />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                {!isEdit && (
                  <Field label="Ambiente" htmlFor="task-ws">
                    <Select
                      id="task-ws"
                      value={values.workspaceId}
                      onChange={(e) => setValues((v) => ({ ...v, workspaceId: e.target.value, statusId: "", projectId: "", labelIds: [] }))}
                    >
                      {meta.workspaces.map((w) => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </Select>
                  </Field>
                )}
                <Field label="Status" htmlFor="task-status">
                  <Select id="task-status" value={values.statusId} onChange={(e) => set("statusId", e.target.value)}>
                    {!isEdit && <option value="">Padrão (A fazer)</option>}
                    {wsStatuses.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Prioridade" htmlFor="task-priority">
                  <Select id="task-priority" value={values.priority} onChange={(e) => set("priority", e.target.value as FormValues["priority"])}>
                    {(Object.keys(PRIORITY_LABEL) as (keyof typeof PRIORITY_LABEL)[]).map((p) => (
                      <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Responsável" htmlFor="task-assignee">
                  <Input id="task-assignee" list="assignees" value={values.assignee} onChange={(e) => set("assignee", e.target.value)} maxLength={100} placeholder="Ex.: Gabriela" />
                  <datalist id="assignees">{meta.assignees.map((a) => <option key={a} value={a} />)}</datalist>
                </Field>
                <ProjectField workspaceId={values.workspaceId} projects={wsProjects} value={values.projectId} onChange={(v) => set("projectId", v)} />
                <Field label="Início" htmlFor="task-start">
                  <Input id="task-start" type="date" value={values.startDate} onChange={(e) => set("startDate", e.target.value)} />
                </Field>
                <Field label="Prazo" htmlFor="task-due">
                  <Input id="task-due" type="date" value={values.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
                </Field>
                <Field label="Repetição" htmlFor="task-rrule" hint={values.rrule && !values.dueDate ? "Defina um prazo para a repetição funcionar." : undefined}>
                  <RecurrencePicker id="task-rrule" value={values.rrule} onChange={(r) => set("rrule", r)} />
                </Field>
                <Field label="Tempo estimado (min)" htmlFor="task-estimate">
                  <Input id="task-estimate" type="number" min={0} value={values.estimateMinutes} onChange={(e) => set("estimateMinutes", e.target.value)} />
                </Field>
              </div>

              <LabelsField workspaceId={values.workspaceId} labels={wsLabels} value={values.labelIds} onChange={(v) => set("labelIds", v)} />

              <Field label="Descrição" htmlFor="task-desc">
                <Textarea id="task-desc" value={values.description} onChange={(e) => set("description", e.target.value)} rows={5} maxLength={20000} />
              </Field>

              <LinksField value={values.links} onChange={(v) => set("links", v)} />

              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                <Button type="submit" disabled={saving || !values.title.trim()}>
                  {saving ? "Salvando…" : isEdit ? "Salvar alterações" : "Criar tarefa"}
                </Button>
                {detail && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => runAndReload(() => actions.setTaskDoneAction(detail.id, !detail.status.isDone))}
                    >
                      {detail.status.isDone ? <RotateCcw /> : <CheckCircle2 />}
                      {detail.status.isDone ? "Reabrir" : "Concluir"}
                    </Button>
                    <div className="ml-auto flex gap-1">
                      <IconAction label="Duplicar" onClick={() => runAndReload(() => actions.duplicateTaskAction(detail.id), true)}><Copy /></IconAction>
                      {!detail.isTemplate && (
                        <IconAction label="Salvar como modelo" onClick={() => runAndReload(() => actions.duplicateTaskAction(detail.id, true))}><LayoutTemplate /></IconAction>
                      )}
                      <IconAction
                        label={detail.archivedAt ? "Desarquivar" : "Arquivar"}
                        onClick={() => runAndReload(() => actions.archiveTaskAction(detail.id, !detail.archivedAt), !detail.archivedAt)}
                      >
                        {detail.archivedAt ? <ArchiveRestore /> : <Archive />}
                      </IconAction>
                      <IconAction
                        label="Excluir"
                        danger
                        onClick={async () => {
                          const ok = await confirm({
                            title: "Excluir tarefa?",
                            description: detail._count.subtasks ? "As subtarefas também serão excluídas." : "Você poderá desfazer logo em seguida.",
                            confirmLabel: "Excluir",
                            danger: true,
                          });
                          if (!ok) return;
                          const r = await actions.deleteTaskAction(detail.id);
                          if (!r.ok) return toast.error(r.error);
                          toast.success("Tarefa excluída.", {
                            action: { label: "Desfazer", onClick: async () => { await actions.restoreTaskAction(detail.id); router.refresh(); } },
                          });
                          router.refresh();
                          onClose();
                        }}
                      >
                        <Trash2 />
                      </IconAction>
                    </div>
                  </>
                )}
              </div>
            </form>

            {/* ── Detalhes (somente edição) ── */}
            {detail && (
              <div className="grid content-start gap-5 lg:border-l lg:border-border lg:pl-6">
                <ChecklistSection task={detail} reload={load} />
                <SubtasksSection task={detail} reload={load} onOpenTask={onOpenTask} />
                <AttachmentsSection taskId={detail.id} items={attachments} reload={load} />
                <TimeSection task={detail} today={meta.today} reload={load} />
                <CommentsSection task={detail} reload={load} />
                {linkedNotes.length > 0 && (
                  <Section title="Anotações vinculadas">
                    <ul className="grid gap-1 text-sm">
                      {linkedNotes.map((n) => (
                        <li key={n.id}>
                          <Link href={`/anotacoes?n=${n.id}`} className="inline-flex items-center gap-1.5 hover:underline">
                            <FileText className="size-4 text-muted-foreground" /> {n.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}
                <Section title="Histórico">
                  <ul className="grid gap-1.5 text-xs text-muted-foreground">
                    {detail.startedAt && <li>Iniciada em {new Date(detail.startedAt).toLocaleString("pt-BR", { timeZone: meta.tz })}</li>}
                    {detail.completedAt && <li>Concluída em {new Date(detail.completedAt).toLocaleString("pt-BR", { timeZone: meta.tz })}</li>}
                    {detail.rrule && <li>Repetição: {describeRRule(detail.rrule)}</li>}
                    {detail.history.map((h) => (
                      <li key={h.id}>
                        <span className="tabular">{new Date(h.createdAt).toLocaleString("pt-BR", { timeZone: meta.tz, dateStyle: "short", timeStyle: "short" })}</span>
                        {" · "}
                        {HISTORY_LABEL[h.field] ?? h.field}
                        {h.fromValue || h.toValue ? `: ${h.fromValue ?? "—"} → ${h.toValue ?? "—"}` : ""}
                      </li>
                    ))}
                  </ul>
                </Section>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Partes do formulário ──────────────────────────────────────

function IconAction({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="icon" onClick={onClick} aria-label={label} title={label} className={danger ? "text-danger hover:text-danger" : undefined}>
      {children}
    </Button>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function ProjectField({ workspaceId, projects, value, onChange }: { workspaceId: string; projects: TaskMeta["projects"]; value: string; onChange: (v: string) => void }) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState("");
  if (creating) {
    return (
      <Field label="Novo projeto" htmlFor="task-new-project">
        <div className="flex gap-2">
          <Input id="task-new-project" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Nome do projeto" />
          <Button
            type="button"
            size="sm"
            className="h-9"
            onClick={async () => {
              const r = await actions.createProjectAction({ workspaceId, name });
              if (!r.ok) return toast.error(r.error);
              onChange(r.data.id);
              setCreating(false);
              router.refresh();
            }}
          >
            Criar
          </Button>
          <Button type="button" size="icon" variant="ghost" onClick={() => setCreating(false)} aria-label="Cancelar"><X /></Button>
        </div>
      </Field>
    );
  }
  return (
    <Field label="Projeto" htmlFor="task-project">
      <Select id="task-project" value={value} onChange={(e) => (e.target.value === "__new" ? setCreating(true) : onChange(e.target.value))}>
        <option value="">Sem projeto</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
        <option value="__new">+ Novo projeto…</option>
      </Select>
    </Field>
  );
}

const LABEL_COLORS = ["#A66F7C", "#373039", "#B8AAA4", "#4E6F8F", "#3F7D5C", "#B7822F", "#B4474F", "#7A5C99"];

function LabelsField({ workspaceId, labels, value, onChange }: { workspaceId: string; labels: TaskMeta["labels"]; value: string[]; onChange: (v: string[]) => void }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const add = async () => {
    if (!name.trim()) return;
    const color = LABEL_COLORS[(labels.length + 1) % LABEL_COLORS.length];
    const r = await actions.createLabelAction({ workspaceId, name, color });
    if (!r.ok) return toast.error(r.error);
    onChange([...new Set([...value, r.data.id])]);
    setName("");
    router.refresh();
  };
  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">Etiquetas</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {labels.map((l) => {
          const on = value.includes(l.id);
          return (
            <button
              key={l.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((x) => x !== l.id) : [...value, l.id])}
              className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs", on ? "border-transparent font-medium" : "border-border text-muted-foreground")}
              style={on ? { background: `${l.color}33` } : undefined}
            >
              <span className="size-2 rounded-full" style={{ background: l.color }} aria-hidden /> {l.name}
            </button>
          );
        })}
        <div className="flex items-center gap-1">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
            placeholder="Nova etiqueta"
            className="h-7 w-32 text-xs"
            aria-label="Nova etiqueta"
          />
          <Button type="button" size="sm" variant="ghost" className="h-7" onClick={add} disabled={!name.trim()}>
            <Plus />
          </Button>
        </div>
      </div>
    </div>
  );
}

function LinksField({ value, onChange }: { value: { title: string; url: string }[]; onChange: (v: { title: string; url: string }[]) => void }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Links</span>
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange([...value, { title: "", url: "" }])}>
          <Plus /> Adicionar link
        </Button>
      </div>
      {value.map((l, i) => (
        <div key={i} className="flex gap-2">
          <Input value={l.title} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="Título" className="w-40" aria-label="Título do link" />
          <Input value={l.url} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="https://…" type="url" aria-label="Endereço do link" />
          {l.url && /^https?:\/\//.test(l.url) && (
            <Button type="button" size="icon" variant="ghost" asChild>
              <a href={l.url} target="_blank" rel="noopener noreferrer" aria-label="Abrir link"><Link2 /></a>
            </Button>
          )}
          <Button type="button" size="icon" variant="ghost" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remover link"><X /></Button>
        </div>
      ))}
    </div>
  );
}

// ─── Seções de detalhe ─────────────────────────────────────────

function InlineAdd({ placeholder, onAdd, label }: { placeholder: string; onAdd: (text: string) => Promise<boolean>; label: string }) {
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    if (await onAdd(text.trim())) setText("");
    setBusy(false);
  };
  return (
    <div className="flex gap-2">
      <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submit())} placeholder={placeholder} aria-label={label} className="h-8" />
      <Button type="button" size="sm" variant="outline" onClick={submit} disabled={!text.trim() || busy}>Adicionar</Button>
    </div>
  );
}

function ChecklistSection({ task, reload }: { task: TaskDetail; reload: () => Promise<unknown> }) {
  const done = task.checklist.filter((c) => c.done).length;
  return (
    <Section title={`Checklist${task.checklist.length ? ` (${done}/${task.checklist.length})` : ""}`}>
      {task.checklist.length > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full bg-success transition-all" style={{ width: `${(done / task.checklist.length) * 100}%` }} />
        </div>
      )}
      <ul className="grid gap-1">
        {task.checklist.map((item) => (
          <li key={item.id} className="group flex items-center gap-2 text-sm">
            <Checkbox
              checked={item.done}
              aria-label={item.text}
              onChange={async (e) => {
                const r = await actions.updateChecklistItemAction(item.id, { done: e.target.checked });
                if (!r.ok) toast.error(r.error);
                await reload();
              }}
            />
            <span className={cn("flex-1", item.done && "text-muted-foreground line-through")}>{item.text}</span>
            <button
              type="button"
              className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
              aria-label={`Remover ${item.text}`}
              onClick={async () => {
                await actions.deleteChecklistItemAction(item.id);
                await reload();
              }}
            >
              <X className="size-4 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
      <InlineAdd
        placeholder="Novo item"
        label="Novo item da checklist"
        onAdd={async (text) => {
          const r = await actions.addChecklistItemAction(task.id, text);
          if (!r.ok) toast.error(r.error);
          await reload();
          return r.ok;
        }}
      />
    </Section>
  );
}

function SubtasksSection({ task, reload, onOpenTask }: { task: TaskDetail; reload: () => Promise<unknown>; onOpenTask: (id: string) => void }) {
  const router = useRouter();
  return (
    <Section title={`Subtarefas${task.subtasks.length ? ` (${task.subtasks.filter((s) => s.status.isDone).length}/${task.subtasks.length})` : ""}`}>
      <ul className="grid gap-1">
        {task.subtasks.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={s.status.isDone}
              aria-label={s.title}
              onChange={async (e) => {
                const r = await actions.setTaskDoneAction(s.id, e.target.checked);
                if (!r.ok) toast.error(r.error);
                await reload();
                router.refresh();
              }}
            />
            <button type="button" className={cn("flex-1 text-left hover:underline", s.status.isDone && "text-muted-foreground line-through")} onClick={() => onOpenTask(s.id)}>
              {s.title}
            </button>
            <span className="text-xs text-muted-foreground">{s.status.name}</span>
          </li>
        ))}
      </ul>
      {!task.parentId && (
        <InlineAdd
          placeholder="Nova subtarefa"
          label="Nova subtarefa"
          onAdd={async (title) => {
            const r = await actions.createTaskAction({ workspaceId: task.workspaceId, parentId: task.id, title });
            if (!r.ok) toast.error(r.error);
            await reload();
            router.refresh();
            return r.ok;
          }}
        />
      )}
    </Section>
  );
}

function AttachmentsSection({ taskId, items, reload }: { taskId: string; items: Attachment[]; reload: () => Promise<unknown> }) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [link, setLink] = React.useState({ name: "", url: "" });

  const upload = async (file: File) => {
    setUploading(true);
    const fd = new FormData();
    fd.set("entityType", "task");
    fd.set("entityId", taskId);
    fd.set("file", file);
    const res = await fetch("/api/attachments", { method: "POST", body: fd });
    const body = await res.json().catch(() => ({}));
    setUploading(false);
    if (!res.ok) return toast.error(body.error ?? "Falha no envio.");
    toast.success("Arquivo anexado.");
    await reload();
  };

  return (
    <Section
      title="Arquivos e links"
      action={
        <div className="flex gap-1">
          <input ref={fileRef} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} aria-label="Escolher arquivo" />
          <Button type="button" size="sm" variant="ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload /> {uploading ? "Enviando…" : "Arquivo"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setLinkOpen((o) => !o)}>
            <Link2 /> Link
          </Button>
        </div>
      }
    >
      {linkOpen && (
        <div className="flex gap-2">
          <Input value={link.name} onChange={(e) => setLink({ ...link, name: e.target.value })} placeholder="Nome" className="h-8 w-32" aria-label="Nome do link" />
          <Input value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} placeholder="https://…" className="h-8" aria-label="Endereço" />
          <Button
            type="button"
            size="sm"
            onClick={async () => {
              const r = await actions.addLinkAttachmentAction(taskId, link.name, link.url);
              if (!r.ok) return toast.error(r.error);
              setLink({ name: "", url: "" });
              setLinkOpen(false);
              await reload();
            }}
          >
            Salvar
          </Button>
        </div>
      )}
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum anexo. Arquivos de até 5 MB.</p>
      ) : (
        <ul className="grid gap-1 text-sm">
          {items.map((a) => (
            <li key={a.id} className="group flex items-center gap-2">
              {a.url ? <Link2 className="size-4 text-muted-foreground" /> : <Paperclip className="size-4 text-muted-foreground" />}
              <a href={a.url ?? `/api/attachments/${a.id}`} target="_blank" rel="noopener noreferrer" className="flex-1 truncate hover:underline">
                {a.name}
              </a>
              {a.sizeBytes ? <span className="text-xs text-muted-foreground">{Math.ceil(a.sizeBytes / 1024)} KB</span> : null}
              <button
                type="button"
                className="opacity-0 group-hover:opacity-100 focus:opacity-100"
                aria-label={`Remover ${a.name}`}
                onClick={async () => {
                  const r = await actions.deleteAttachmentAction(a.id);
                  if (!r.ok) toast.error(r.error);
                  await reload();
                }}
              >
                <X className="size-4 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function TimeSection({ task, today, reload }: { task: TaskDetail; today: string; reload: () => Promise<unknown> }) {
  const total = task.timeEntries.reduce((s, e) => s + e.minutes, 0);
  const [minutes, setMinutes] = React.useState("");
  const [date, setDate] = React.useState(today);
  return (
    <Section title="Tempo">
      <p className="text-sm">
        Registrado: <strong>{formatMinutes(total)}</strong>
        {task.estimateMinutes ? <span className="text-muted-foreground"> de {formatMinutes(task.estimateMinutes)} estimados</span> : null}
      </p>
      <div className="flex gap-2">
        <Input type="number" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="Minutos" className="h-8 w-24" aria-label="Minutos trabalhados" />
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 w-40" aria-label="Data" />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!Number(minutes)}
          onClick={async () => {
            const r = await actions.logTimeAction(task.id, { minutes: Number(minutes), date });
            if (!r.ok) return toast.error(r.error);
            setMinutes("");
            await reload();
          }}
        >
          Registrar
        </Button>
      </div>
      {task.timeEntries.length > 0 && (
        <ul className="grid gap-1 text-xs text-muted-foreground">
          {task.timeEntries.map((e) => (
            <li key={e.id} className="group flex items-center gap-2">
              <span className="tabular">{ymd(e.date).split("-").reverse().join("/")}</span>
              <span>{formatMinutes(e.minutes)}</span>
              <button
                type="button"
                className="ml-auto opacity-0 group-hover:opacity-100 focus:opacity-100"
                aria-label="Remover registro"
                onClick={async () => {
                  await actions.deleteTimeEntryAction(e.id);
                  await reload();
                }}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function CommentsSection({ task, reload }: { task: TaskDetail; reload: () => Promise<unknown> }) {
  const [text, setText] = React.useState("");
  return (
    <Section title={`Comentários${task.comments.length ? ` (${task.comments.length})` : ""}`}>
      <ul className="grid gap-2">
        {task.comments.map((c) => (
          <li key={c.id} className="group rounded-lg bg-muted/60 px-3 py-2 text-sm">
            <p className="whitespace-pre-wrap">{c.content}</p>
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>{new Date(c.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
              <button
                type="button"
                className="opacity-0 group-hover:opacity-100 focus:opacity-100"
                onClick={async () => {
                  const r = await actions.deleteCommentAction(c.id);
                  if (!r.ok) toast.error(r.error);
                  await reload();
                }}
              >
                Excluir
              </button>
            </div>
          </li>
        ))}
      </ul>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva um comentário…" rows={2} aria-label="Novo comentário" />
      <div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!text.trim()}
          onClick={async () => {
            const r = await actions.addCommentAction(task.id, text);
            if (!r.ok) return toast.error(r.error);
            setText("");
            await reload();
          }}
        >
          Comentar
        </Button>
      </div>
    </Section>
  );
}
