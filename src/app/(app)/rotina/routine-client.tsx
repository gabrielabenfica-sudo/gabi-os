"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Clapperboard, Copy, FileDown, ListChecks, MoreHorizontal, Pencil, Plus, Repeat, Save, Sun, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Checkbox, EmptyState, PageHeader, WsDot } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm";
import { addDaysYmd, weekdayOfYmd } from "@/lib/dates";
import { durationLabel, findOverlaps, longDate, routineKey, routineProgress, WEEKDAY_NAME, WEEKDAY_SHORT, weekdaysLabel } from "@/lib/routine";
import { cn } from "@/lib/utils";
import type { DayContextEntry, RoutineItemView, TemplateItemView } from "@/server/routine";
import {
  applyRoutineTemplateAction, clearRoutineDayAction, copyRoutineDayAction, createRoutineItemAction, createTemplateItemAction, deleteRoutineItemAction,
  deleteTemplateItemAction, saveDayAsTemplateAction, setRoutineItemDoneAction, updateRoutineItemAction, updateTemplateItemAction,
} from "./actions";

type Ws = { id: string; name: string; color: string };
type Result<T = unknown> = { ok: true; data: T; message?: string } | { ok: false; error: string };

export function RoutineClient({
  date, today, items, template, context, workspaces,
}: { date: string; today: string; items: RoutineItemView[]; template: TemplateItemView[]; context: DayContextEntry[]; workspaces: Ws[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [editing, setEditing] = React.useState<RoutineItemView | null>(null);
  const [dialog, setDialog] = React.useState<"template" | "copy" | "save" | null>(null);
  const [pending, setPending] = React.useState<Set<string>>(new Set());

  const go = (d: string) => router.push(d === today ? "/rotina" : `/rotina?dia=${d}`);
  const handle = async <T,>(p: Promise<Result<T>>) => {
    const r = await p;
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
    if (r.message) toast.success(r.message);
    router.refresh();
    return true;
  };

  const overlaps = findOverlaps(items);
  const progress = routineProgress(items);
  const weekday = weekdayOfYmd(date);
  const templateForDay = template.filter((t) => t.weekdays.includes(weekday));
  const keys = new Set(items.map(routineKey));
  const relative = date === today ? "Hoje" : date === addDaysYmd(today, 1) ? "Amanhã" : date === addDaysYmd(today, -1) ? "Ontem" : null;

  const toggle = async (item: RoutineItemView) => {
    setPending((s) => new Set(s).add(item.id));
    await handle(setRoutineItemDoneAction(item.id, !item.done));
    setPending((s) => {
      const n = new Set(s);
      n.delete(item.id);
      return n;
    });
  };

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Rotina do dia"
        description="Monte os blocos do seu dia, marque o que foi feito e exporte em PDF."
        actions={
          <>
            <Button variant="outline" onClick={() => setDialog("template")}><Repeat /> Rotina padrão</Button>
            <Button variant="outline" asChild>
              <a href={`/imprimir/rotina?dia=${date}`} target="_blank" rel="noreferrer" data-testid="routine-pdf"><FileDown /> Exportar PDF</a>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Mais ações da rotina"><MoreHorizontal /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void handle(applyRoutineTemplateAction(date))}><Repeat /> Aplicar rotina padrão</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDialog("copy")}><Copy /> Copiar de outro dia</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDialog("save")} disabled={!items.length}><Save /> Salvar como rotina padrão</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={!items.length}
                  className="text-danger"
                  onSelect={async () => {
                    if (!(await confirm({ title: "Apagar a rotina deste dia?", description: "Todos os blocos do dia serão removidos.", danger: true, confirmLabel: "Apagar" }))) return;
                    await handle(clearRoutineDayAction(date));
                  }}
                >
                  <Trash2 /> Apagar rotina do dia
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Dia anterior" onClick={() => go(addDaysYmd(date, -1))}><ChevronLeft /></Button>
        <Input type="date" aria-label="Dia da rotina" value={date} onChange={(e) => e.target.value && go(e.target.value)} className="w-40" />
        <Button variant="outline" size="icon" aria-label="Próximo dia" onClick={() => go(addDaysYmd(date, 1))}><ChevronRight /></Button>
        {date !== today && <Button variant="ghost" size="sm" onClick={() => go(today)}>Hoje</Button>}
        <h2 className="ml-1 font-semibold first-letter:uppercase" data-testid="routine-date">
          {relative && <span className="text-primary">{relative} · </span>}
          {longDate(date)}
        </h2>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid content-start gap-4">
          <Card className="grid gap-2 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Progresso do dia</span>
              <span className="tabular text-muted-foreground" data-testid="routine-progress">{progress.done} de {progress.total} · {progress.percent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso da rotina">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress.percent}%` }} />
            </div>
          </Card>

          <QuickAdd date={date} workspaces={workspaces} onSaved={() => router.refresh()} />

          {items.length === 0 ? (
            <EmptyState
              icon={Sun}
              title="Nenhum bloco neste dia"
              description="Adicione atividades com horário acima, ou comece pela sua rotina padrão."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {templateForDay.length > 0 && <Button size="sm" onClick={() => void handle(applyRoutineTemplateAction(date))}><Repeat /> Aplicar rotina padrão ({templateForDay.length})</Button>}
                  <Button size="sm" variant="outline" onClick={() => setDialog("copy")}><Copy /> Copiar de outro dia</Button>
                </div>
              }
            />
          ) : (
            <ol className="grid gap-2" data-testid="routine-list">
              {items.map((item) => {
                const dur = durationLabel(item.startTime, item.endTime);
                return (
                  <li
                    key={item.id}
                    data-item={item.title}
                    data-done={item.done ? "1" : "0"}
                    className={cn("group flex items-start gap-3 rounded-xl border border-border bg-card p-3", item.done && "opacity-70")}
                  >
                    <Checkbox
                      className="mt-1 size-5"
                      checked={item.done}
                      disabled={pending.has(item.id)}
                      onChange={() => void toggle(item)}
                      aria-label={`${item.title}: ${item.done ? "feito" : "a fazer"}`}
                    />
                    <div className="w-24 shrink-0 pt-0.5 text-sm tabular">
                      {item.startTime ? (
                        <>
                          <span className="font-semibold">{item.startTime}</span>
                          {item.endTime && <span className="text-muted-foreground">–{item.endTime}</span>}
                          {dur && <span className="block text-xs text-muted-foreground">{dur}</span>}
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sem horário</span>
                      )}
                    </div>
                    <div className="grid min-w-0 flex-1 gap-1">
                      <p className={cn("font-medium leading-snug", item.done && "line-through")}>{item.title}</p>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {item.workspace && <span className="flex items-center gap-1"><WsDot color={item.workspace.color} /> {item.workspace.name}</span>}
                        {overlaps.has(item.id) && <Badge variant="warning"><AlertTriangle className="size-3" /> Conflito de horário</Badge>}
                      </div>
                      {item.notes && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{item.notes}</p>}
                    </div>
                    <div className="flex shrink-0 gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                      <Button size="icon" variant="ghost" className="size-8" aria-label={`Editar ${item.title}`} onClick={() => setEditing(item)}><Pencil /></Button>
                      <Button size="icon" variant="ghost" className="size-8" aria-label={`Remover ${item.title}`} onClick={() => void handle(deleteRoutineItemAction(item.id))}><Trash2 /></Button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <aside className="grid content-start gap-3">
          <Card className="grid gap-3 p-4" data-testid="routine-context">
            <div>
              <h3 className="font-semibold">Também neste dia</h3>
              <p className="text-xs text-muted-foreground">Compromissos, prazos e gravações. Use + para colocar na rotina.</p>
            </div>
            {context.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada na agenda, nas tarefas ou no conteúdo para este dia.</p>
            ) : (
              <ul className="grid gap-1.5">
                {context.map((c) => {
                  const Icon = c.kind === "event" ? CalendarDays : c.kind === "task" ? ListChecks : Clapperboard;
                  const inRoutine = keys.has(routineKey(c));
                  return (
                    <li key={`${c.kind}-${c.id}`} className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-accent/50" data-context={c.title}>
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <Link href={c.href} className="grid min-w-0 flex-1 text-sm hover:underline">
                        <span className="truncate">{c.title}</span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <WsDot color={c.workspace.color} className="size-2" />
                          {c.startTime ? `${c.startTime}${c.endTime ? `–${c.endTime}` : ""}` : c.kind === "task" ? "Prazo hoje" : "Dia todo"}
                        </span>
                      </Link>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        disabled={inRoutine}
                        aria-label={inRoutine ? `${c.title} já está na rotina` : `Adicionar ${c.title} à rotina`}
                        onClick={() =>
                          void handle(createRoutineItemAction({ date, title: c.title, startTime: c.startTime, endTime: c.startTime ? c.endTime : null, workspaceId: c.workspace.id }))
                        }
                      >
                        <Plus />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            <Button variant="ghost" size="sm" asChild className="justify-self-start">
              <Link href="/agenda?novo=1"><CalendarPlus /> Novo compromisso</Link>
            </Button>
          </Card>
          <Card className="grid gap-2 p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Rotina padrão de {WEEKDAY_NAME[weekday]}</h3>
              <Button size="sm" variant="ghost" onClick={() => setDialog("template")}>Editar</Button>
            </div>
            {templateForDay.length ? (
              <ul className="grid gap-1 text-sm">
                {templateForDay.map((t) => (
                  <li key={t.id} className="flex gap-2">
                    <span className="w-12 shrink-0 tabular text-muted-foreground">{t.startTime ?? "—"}</span>
                    <span className="truncate">{t.title}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Sem rotina padrão para este dia da semana.</p>
            )}
          </Card>
        </aside>
      </div>

      {editing && (
        <BlockDialog
          title="Editar bloco"
          workspaces={workspaces}
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={({ weekdays: _w, ...v }) => updateRoutineItemAction(editing.id, { date, ...v })}
          onDone={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
      {dialog === "template" && <TemplateDialog template={template} workspaces={workspaces} weekday={weekday} onClose={() => setDialog(null)} />}
      {dialog === "copy" && <CopyDialog date={date} onClose={() => setDialog(null)} onSubmit={(from) => handle(copyRoutineDayAction(from, date))} />}
      {dialog === "save" && <SaveTemplateDialog weekday={weekday} onClose={() => setDialog(null)} onSubmit={(days) => handle(saveDayAsTemplateAction(date, days))} />}
    </div>
  );
}

// ─── Adicionar rápido ──────────────────────────────────────────

function QuickAdd({ date, workspaces, onSaved }: { date: string; workspaces: Ws[]; onSaved: () => void }) {
  const [v, setV] = React.useState({ startTime: "", endTime: "", title: "", workspaceId: "" });
  const [busy, setBusy] = React.useState(false);
  const titleRef = React.useRef<HTMLInputElement>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await createRoutineItemAction({ date, title: v.title, startTime: v.startTime || null, endTime: v.endTime || null, workspaceId: v.workspaceId || null });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(r.message);
    // O próximo bloco costuma começar quando este termina
    setV((s) => ({ startTime: s.endTime, endTime: "", title: "", workspaceId: s.workspaceId }));
    titleRef.current?.focus();
    onSaved();
  };
  return (
    <form onSubmit={submit} className="grid gap-2 rounded-xl border border-dashed border-border p-3 sm:grid-cols-[110px_110px_minmax(0,1fr)_170px_auto] sm:items-end" aria-label="Adicionar bloco">
      <Field label="Início" htmlFor="rt-start"><Input id="rt-start" type="time" value={v.startTime} onChange={(e) => setV({ ...v, startTime: e.target.value })} /></Field>
      <Field label="Fim" htmlFor="rt-end"><Input id="rt-end" type="time" value={v.endTime} onChange={(e) => setV({ ...v, endTime: e.target.value })} /></Field>
      <Field label="Atividade" htmlFor="rt-title">
        <Input id="rt-title" ref={titleRef} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="Ex.: Gravar Reels, academia, reunião…" maxLength={200} required />
      </Field>
      <Field label="Ambiente" htmlFor="rt-ws">
        <Select id="rt-ws" value={v.workspaceId} onChange={(e) => setV({ ...v, workspaceId: e.target.value })}>
          <option value="">Nenhum</option>
          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </Select>
      </Field>
      <Button type="submit" disabled={busy || !v.title.trim()}><Plus /> Adicionar</Button>
    </form>
  );
}

// ─── Formulário de bloco (dia ou rotina padrão) ────────────────

type BlockValues = { title: string; startTime: string | null; endTime: string | null; notes: string | null; workspaceId: string | null };

function BlockDialog({
  title, workspaces, initial, weekdays, onClose, onSubmit, onDone,
}: {
  title: string;
  workspaces: Ws[];
  initial?: Partial<BlockValues> & { weekdays?: number[] };
  weekdays?: boolean;
  onClose: () => void;
  onSubmit: (v: BlockValues & { weekdays: number[] }) => Promise<Result>;
  onDone: () => void;
}) {
  const [v, setV] = React.useState({
    title: initial?.title ?? "",
    startTime: initial?.startTime ?? "",
    endTime: initial?.endTime ?? "",
    notes: initial?.notes ?? "",
    workspaceId: initial?.workspaceId ?? "",
    weekdays: initial?.weekdays ?? [0, 1, 2, 3, 4, 5, 6],
  });
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const r = await onSubmit({ title: v.title, startTime: v.startTime || null, endTime: v.endTime || null, notes: v.notes || null, workspaceId: v.workspaceId || null, weekdays: v.weekdays });
            setBusy(false);
            if (!r.ok) return toast.error(r.error);
            if (r.message) toast.success(r.message);
            onDone();
          }}
        >
          <Field label="Atividade" htmlFor="bk-title"><Input id="bk-title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} maxLength={200} required autoFocus /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Início" htmlFor="bk-start"><Input id="bk-start" type="time" value={v.startTime} onChange={(e) => setV({ ...v, startTime: e.target.value })} /></Field>
            <Field label="Fim" htmlFor="bk-end"><Input id="bk-end" type="time" value={v.endTime} onChange={(e) => setV({ ...v, endTime: e.target.value })} /></Field>
          </div>
          <Field label="Ambiente" htmlFor="bk-ws">
            <Select id="bk-ws" value={v.workspaceId} onChange={(e) => setV({ ...v, workspaceId: e.target.value })}>
              <option value="">Nenhum</option>
              {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          </Field>
          {weekdays && <WeekdayPicker value={v.weekdays} onChange={(d) => setV({ ...v, weekdays: d })} />}
          <Field label="Observação" htmlFor="bk-notes"><Textarea id="bk-notes" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} rows={2} maxLength={2000} /></Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={busy}>Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (d: number[]) => void }) {
  // Segunda primeiro, domingo no fim
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">Dias da semana</span>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Dias da semana">
        {order.map((d) => {
          const on = value.includes(d);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              aria-label={WEEKDAY_NAME[d]}
              onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d])}
              className={cn("h-8 min-w-11 rounded-md border px-2 text-xs font-medium", on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-accent")}
            >
              {WEEKDAY_SHORT[d]}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2 text-xs">
        <button type="button" className="text-primary hover:underline" onClick={() => onChange([1, 2, 3, 4, 5])}>Seg a Sex</button>
        <button type="button" className="text-primary hover:underline" onClick={() => onChange([0, 1, 2, 3, 4, 5, 6])}>Todos</button>
      </div>
    </div>
  );
}

// ─── Rotina padrão ─────────────────────────────────────────────

function TemplateDialog({ template, workspaces, weekday, onClose }: { template: TemplateItemView[]; workspaces: Ws[]; weekday: number; onClose: () => void }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [form, setForm] = React.useState<TemplateItemView | "new" | null>(null);
  const [day, setDay] = React.useState<number | "all">("all");
  const shown = day === "all" ? template : template.filter((t) => t.weekdays.includes(day));

  if (form) {
    return (
      <BlockDialog
        title={form === "new" ? "Novo bloco da rotina padrão" : "Editar bloco da rotina padrão"}
        workspaces={workspaces}
        weekdays
        initial={form === "new" ? { weekdays: day === "all" ? [0, 1, 2, 3, 4, 5, 6] : [day] } : form}
        onClose={() => setForm(null)}
        onSubmit={(v) => (form === "new" ? createTemplateItemAction(v) : updateTemplateItemAction(form.id, v))}
        onDone={() => {
          setForm(null);
          router.refresh();
        }}
      />
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rotina padrão</DialogTitle>
          <DialogDescription>Blocos que se repetem. Em qualquer dia, use “Aplicar rotina padrão” para trazê-los.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Filtrar por dia da semana" value={String(day)} onChange={(e) => setDay(e.target.value === "all" ? "all" : Number(e.target.value))} className="w-44">
            <option value="all">Todos os dias</option>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{WEEKDAY_NAME[d]}{d === weekday ? " (este dia)" : ""}</option>)}
          </Select>
          <Button size="sm" className="ml-auto" onClick={() => setForm("new")}><Plus /> Novo bloco</Button>
        </div>
        {shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum bloco na rotina padrão{day === "all" ? "" : ` de ${WEEKDAY_NAME[day]}`}.</p>
        ) : (
          <ul className="grid gap-1.5" data-testid="template-list">
            {shown.map((t) => (
              <li key={t.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5" data-template={t.title}>
                <span className="w-24 shrink-0 text-sm tabular">{t.startTime ? `${t.startTime}${t.endTime ? `–${t.endTime}` : ""}` : <span className="text-xs text-muted-foreground">Sem horário</span>}</span>
                <div className="grid min-w-0 flex-1">
                  <span className="truncate text-sm font-medium">{t.title}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    {t.workspace && <WsDot color={t.workspace.color} className="size-2" />}
                    {weekdaysLabel(t.weekdays)}
                  </span>
                </div>
                <Button size="icon" variant="ghost" className="size-8" aria-label={`Editar ${t.title}`} onClick={() => setForm(t)}><Pencil /></Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label={`Remover ${t.title} da rotina padrão`}
                  onClick={async () => {
                    if (!(await confirm({ title: "Remover da rotina padrão?", description: "Os dias que já receberam este bloco não mudam.", danger: true, confirmLabel: "Remover" }))) return;
                    const r = await deleteTemplateItemAction(t.id);
                    if (!r.ok) return toast.error(r.error);
                    toast.success(r.message);
                    router.refresh();
                  }}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CopyDialog({ date, onClose, onSubmit }: { date: string; onClose: () => void; onSubmit: (from: string) => Promise<boolean> }) {
  const [from, setFrom] = React.useState(addDaysYmd(date, -1));
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Copiar de outro dia</DialogTitle>
          <DialogDescription>Os blocos entram neste dia como “a fazer”. O que já existir não é duplicado.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const ok = await onSubmit(from);
            setBusy(false);
            if (ok) onClose();
          }}
        >
          <Field label="Copiar do dia" htmlFor="cp-from"><Input id="cp-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required /></Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={busy || !from}><Copy /> Copiar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SaveTemplateDialog({ weekday, onClose, onSubmit }: { weekday: number; onClose: () => void; onSubmit: (days: number[]) => Promise<boolean> }) {
  const [days, setDays] = React.useState<number[]>([weekday]);
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Salvar como rotina padrão</DialogTitle>
          <DialogDescription>Os blocos deste dia passam a fazer parte da rotina padrão nos dias escolhidos.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const ok = await onSubmit(days);
            setBusy(false);
            if (ok) onClose();
          }}
        >
          <WeekdayPicker value={days} onChange={setDays} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={busy || !days.length}><Save /> Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
