"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarPlus, Check, ExternalLink, FileText, Link2, ListChecks, Mail, NotebookPen, Pencil, Phone, Plus, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Checkbox } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm";
import { Money } from "@/components/finance/money-input";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { ConflictDialog } from "@/app/(app)/agenda/conflict-dialog";
import type { Conflict } from "@/app/(app)/agenda/shared";
import { formatDateTimeBR } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { MenteeDetail } from "@/server/mentees";
import { setTaskDoneAction } from "@/app/(app)/tarefas/actions";
import {
  addMaterialAction, addMenteeGoalAction, addMenteeTaskAction, addTimelineEntryAction, createLinkedNoteAction, deleteMaterialAction, deleteMenteeAction, deleteMenteeGoalAction,
  deleteSessionAction, deleteTimelineEntryAction, scheduleSessionAction, updateMenteeGoalAction, updateSessionAction,
} from "../../actions";
import { MENTEE_STATUS, MenteeDialog, type Program } from "../mentees-client";

const ymd = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const br = (s: string) => (s ? s.split("-").reverse().join("/") : "—");
const SESSION_STATUS = { SCHEDULED: "Agendado", DONE: "Realizado", CANCELLED: "Cancelado", NO_SHOW: "Faltou" } as const;
const SALE_STATUS = { ACTIVE: "Ativa", CANCELLED: "Cancelada", REFUNDED: "Reembolsada" } as const;

type Perms = { finance: boolean; notes: boolean; calendar: boolean; tasks: boolean };

export function MenteeDetailClient({
  mentee, notes, programs, perms, today, tz,
}: { mentee: MenteeDetail; notes: { id: string; title: string; updatedAt: Date }[]; programs: Program[]; perms: Perms; today: string; tz: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [editing, setEditing] = React.useState(false);
  const [scheduling, setScheduling] = React.useState(false);
  const st = MENTEE_STATUS[mentee.status];
  const totalSold = mentee.sales.filter((s) => s.status === "ACTIVE").reduce((a, s) => a + s.totalCents, 0);
  const received = mentee.sales.flatMap((s) => s.receivables).filter((r) => r.status === "RECEIVED").reduce((a, r) => a + (r.receivedCents ?? r.amountCents), 0);
  const overdue = mentee.sales.filter((s) => s.status === "ACTIVE").flatMap((s) => s.receivables).filter((r) => r.status === "PENDING" && ymd(r.dueDate) < today);

  return (
    <div className="grid gap-5">
      <div>
        <Link href="/mentoria/mentorados" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Mentorados</Link>
      </div>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{mentee.name}</h1>
            <Badge variant={st.variant}>{st.label}</Badge>
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {mentee.program && <span>{mentee.program.name}</span>}
            {mentee.email && <a className="inline-flex items-center gap-1 hover:text-foreground" href={`mailto:${mentee.email}`}><Mail className="size-3.5" />{mentee.email}</a>}
            {mentee.phone && <a className="inline-flex items-center gap-1 hover:text-foreground" href={`https://wa.me/${mentee.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"><Phone className="size-3.5" />{mentee.phone}</a>}
            {mentee.instagram && <a className="hover:text-foreground" href={`https://instagram.com/${mentee.instagram}`} target="_blank" rel="noreferrer">@{mentee.instagram}</a>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}><Pencil /> Editar ficha</Button>
          <Button onClick={() => setScheduling(true)}><CalendarPlus /> Agendar encontro</Button>
          <Button
            variant="ghost"
            aria-label="Excluir mentorado"
            onClick={async () => {
              if (!(await confirm({ title: "Excluir mentorado?", description: "A ficha sai da lista. Vendas e lançamentos continuam no financeiro.", danger: true, confirmLabel: "Excluir" }))) return;
              const r = await deleteMenteeAction(mentee.id);
              if (!r.ok) return toast.error(r.error);
              toast.success(r.message);
              router.push("/mentoria/mentorados");
            }}
          >
            <Trash2 />
          </Button>
        </div>
      </header>

      <section aria-label="Contrato" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Info label="Início" value={br(ymd(mentee.startDate))} />
        <Info label="Término previsto" value={br(ymd(mentee.expectedEndDate))} />
        <Info label="Valor contratado" value={mentee.contractedCents != null ? <Money cents={mentee.contractedCents} /> : "—"} hint={mentee.paymentTerms ?? undefined} />
        <Info
          label="Recebido"
          value={perms.finance && mentee.sales.length ? <Money cents={received} /> : "—"}
          hint={perms.finance && totalSold ? (overdue.length ? `${overdue.length} parcela(s) em atraso` : `de ${(totalSold / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`) : undefined}
          tone={overdue.length ? "danger" : undefined}
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="grid content-start gap-5">
          <Sessions mentee={mentee} tz={tz} onSchedule={() => setScheduling(true)} />
          <Goals mentee={mentee} />
          {perms.tasks && <Tasks mentee={mentee} today={today} />}
          {perms.finance && <Sales mentee={mentee} today={today} />}
        </div>
        <div className="grid content-start gap-5">
          {mentee.notes && (
            <Card><CardHeader><CardTitle>Observações</CardTitle></CardHeader><CardContent><p className="whitespace-pre-wrap text-sm">{mentee.notes}</p></CardContent></Card>
          )}
          <Timeline mentee={mentee} today={today} />
          <Materials mentee={mentee} />
          {perms.notes && <Notes mentee={mentee} notes={notes} />}
        </div>
      </div>

      {editing && (
        <MenteeDialog
          workspaceId={mentee.workspaceId}
          edit={mentee}
          programs={programs}
          today={today}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); router.refresh(); }}
        />
      )}
      {scheduling && <ScheduleDialog mentee={mentee} canCalendar={perms.calendar} today={today} tz={tz} onClose={() => setScheduling(false)} />}
    </div>
  );
}

function Info({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: "danger" }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold tabular">{value}</p>
      {hint && <p className={cn("text-xs text-muted-foreground", tone === "danger" && "text-danger")}>{hint}</p>}
    </Card>
  );
}

function Section({ title, icon: Icon, action, children, testId }: { title: string; icon: React.ComponentType<{ className?: string }>; action?: React.ReactNode; children: React.ReactNode; testId?: string }) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Icon className="size-4 text-muted-foreground" />{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className="grid gap-2">{children}</CardContent>
    </Card>
  );
}

// ─── Encontros ─────────────────────────────────────────────────

function Sessions({ mentee, tz, onSchedule }: { mentee: MenteeDetail; tz: string; onSchedule: () => void }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<MenteeDetail["sessions"][number] | null>(null);
  const now = Date.now();
  const upcoming = mentee.sessions.filter((s) => s.status === "SCHEDULED" && new Date(s.date).getTime() >= now - 3 * 3600_000).reverse();
  const past = mentee.sessions.filter((s) => !upcoming.includes(s));
  const row = (s: MenteeDetail["sessions"][number]) => (
    <li key={s.id} className="flex items-start gap-3 rounded-lg border border-border px-3 py-2 text-sm" data-session={s.status}>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{formatDateTimeBR(new Date(s.date), tz)} <span className="font-normal text-muted-foreground">· {s.durationMinutes ?? 60} min</span></p>
        {s.summary && <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{s.summary}</p>}
        {s.nextSteps && <p className="mt-0.5 text-xs"><span className="font-medium">Próximos passos:</span> {s.nextSteps}</p>}
        {s.eventId && <p className="text-xs text-muted-foreground">Na agenda</p>}
      </div>
      <Badge variant={s.status === "DONE" ? "success" : s.status === "SCHEDULED" ? "info" : "outline"}>{SESSION_STATUS[s.status as keyof typeof SESSION_STATUS]}</Badge>
      <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent" aria-label="Editar encontro" onClick={() => setEditing(s)}><Pencil className="size-3.5" /></button>
    </li>
  );
  return (
    <Section title="Encontros" icon={CalendarPlus} testId="sessions" action={<Button size="sm" variant="outline" onClick={onSchedule}><Plus /> Agendar</Button>}>
      {mentee.sessions.length === 0 && <p className="text-sm text-muted-foreground">Nenhum encontro registrado.</p>}
      {upcoming.length > 0 && <ul className="grid gap-2">{upcoming.map(row)}</ul>}
      {past.length > 0 && (
        <>
          {upcoming.length > 0 && <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Anteriores</p>}
          <ul className="grid gap-2">{past.map(row)}</ul>
        </>
      )}
      {editing && <SessionDialog session={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />}
    </Section>
  );
}

function SessionDialog({ session, onClose, onSaved }: { session: MenteeDetail["sessions"][number]; onClose: () => void; onSaved: () => void }) {
  const confirm = useConfirm();
  const [v, setV] = React.useState({ status: session.status, summary: session.summary ?? "", nextSteps: session.nextSteps ?? "" });
  const [saving, setSaving] = React.useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Encontro</DialogTitle>
          <DialogDescription>Registre o que foi trabalhado. Ao marcar como realizado, entra na linha do tempo.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            const r = await updateSessionAction(session.id, { status: v.status, summary: v.summary || null, nextSteps: v.nextSteps || null });
            setSaving(false);
            if (!r.ok) return toast.error(r.error);
            toast.success(r.message);
            onSaved();
          }}
        >
          <Field label="Status" htmlFor="ss-status">
            <Select id="ss-status" value={v.status} onChange={(e) => setV((p) => ({ ...p, status: e.target.value }))}>
              {Object.entries(SESSION_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Resumo" htmlFor="ss-summary"><Textarea id="ss-summary" value={v.summary} onChange={(e) => setV((p) => ({ ...p, summary: e.target.value }))} rows={4} maxLength={10000} /></Field>
          <Field label="Próximos passos" htmlFor="ss-next"><Textarea id="ss-next" value={v.nextSteps} onChange={(e) => setV((p) => ({ ...p, nextSteps: e.target.value }))} rows={2} maxLength={5000} /></Field>
          <DialogFooter className="justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={async () => {
                if (!(await confirm({ title: "Excluir encontro?", description: session.eventId ? "O compromisso na agenda também será removido." : undefined, danger: true, confirmLabel: "Excluir" }))) return;
                const r = await deleteSessionAction(session.id);
                if (!r.ok) return toast.error(r.error);
                onSaved();
              }}
            >
              <Trash2 /> Excluir
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={saving}>Salvar</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleDialog({ mentee, canCalendar, today, tz, onClose }: { mentee: MenteeDetail; canCalendar: boolean; today: string; tz: string; onClose: () => void }) {
  const router = useRouter();
  const [v, setV] = React.useState({ date: today, time: "10:00", durationMinutes: 60, addToCalendar: canCalendar, location: "", summary: "" });
  const [saving, setSaving] = React.useState(false);
  const [conflicts, setConflicts] = React.useState<Conflict[] | null>(null);

  const save = async (allowConflict: boolean) => {
    setSaving(true);
    const r = await scheduleSessionAction(mentee.id, { date: v.date, time: v.time, durationMinutes: v.durationMinutes, addToCalendar: v.addToCalendar, location: v.location || null, summary: v.summary || null }, allowConflict);
    setSaving(false);
    if (!r.ok) return toast.error(r.error);
    if (!r.value.saved) return setConflicts(r.value.conflicts);
    toast.success(v.addToCalendar ? "Encontro agendado e adicionado à agenda." : "Encontro agendado.");
    onClose();
    router.refresh();
  };

  return (
    <>
      <Dialog open={!conflicts} onOpenChange={(o) => !o && !conflicts && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agendar encontro — {mentee.name}</DialogTitle>
            <DialogDescription>Com “adicionar à agenda”, o horário é conferido com os compromissos de todos os ambientes.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); void save(false); }}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Data" htmlFor="sc-date"><Input id="sc-date" type="date" value={v.date} onChange={(e) => setV((p) => ({ ...p, date: e.target.value }))} required /></Field>
              <Field label="Horário" htmlFor="sc-time"><Input id="sc-time" type="time" value={v.time} onChange={(e) => setV((p) => ({ ...p, time: e.target.value }))} required /></Field>
              <Field label="Duração (min)" htmlFor="sc-dur"><Input id="sc-dur" type="number" min={5} max={600} step={5} value={v.durationMinutes} onChange={(e) => setV((p) => ({ ...p, durationMinutes: Number(e.target.value) || 60 }))} /></Field>
            </div>
            <Field label="Local ou link" htmlFor="sc-loc"><Input id="sc-loc" value={v.location} onChange={(e) => setV((p) => ({ ...p, location: e.target.value }))} placeholder="Ex.: Google Meet" maxLength={500} /></Field>
            <Field label="Pauta" htmlFor="sc-summary"><Textarea id="sc-summary" value={v.summary} onChange={(e) => setV((p) => ({ ...p, summary: e.target.value }))} rows={2} /></Field>
            <label className={cn("flex items-center gap-2 text-sm", !canCalendar && "opacity-50")}>
              <Checkbox checked={v.addToCalendar} disabled={!canCalendar} onChange={(e) => setV((p) => ({ ...p, addToCalendar: e.target.checked }))} /> Adicionar à agenda
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={saving}>Agendar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {conflicts && <ConflictDialog conflicts={conflicts} tz={tz} busy={saving} onChooseAnother={() => setConflicts(null)} onConfirm={() => { setConflicts(null); void save(true); }} />}
    </>
  );
}

// ─── Metas individuais ─────────────────────────────────────────

function Goals({ mentee }: { mentee: MenteeDetail }) {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  return (
    <Section title="Metas do mentorado" icon={Target} testId="mentee-goals">
      {mentee.goals.length === 0 && <p className="text-sm text-muted-foreground">Defina as metas combinadas com o mentorado.</p>}
      <ul className="grid gap-2">
        {mentee.goals.map((g) => (
          <li key={g.id} className="grid gap-1.5 rounded-lg border border-border px-3 py-2 text-sm" data-goal={g.title}>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={g.done}
                aria-label={`Concluir ${g.title}`}
                onChange={async (e) => {
                  const r = await updateMenteeGoalAction(g.id, { done: e.target.checked });
                  if (!r.ok) return toast.error(r.error);
                  router.refresh();
                }}
              />
              <span className={cn("flex-1", g.done && "text-muted-foreground line-through")}>{g.title}</span>
              {g.dueDate && <span className="text-xs text-muted-foreground">até {br(ymd(g.dueDate))}</span>}
              <button
                type="button"
                className="rounded p-1 text-muted-foreground hover:text-danger"
                aria-label={`Excluir ${g.title}`}
                onClick={async () => {
                  const r = await deleteMenteeGoalAction(g.id);
                  if (!r.ok) return toast.error(r.error);
                  router.refresh();
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                defaultValue={g.progress}
                aria-label={`Progresso de ${g.title}`}
                className="flex-1 accent-[var(--primary)]"
                onPointerUp={async (e) => {
                  const r = await updateMenteeGoalAction(g.id, { progress: Number((e.target as HTMLInputElement).value) });
                  if (!r.ok) return toast.error(r.error);
                  router.refresh();
                }}
                onKeyUp={async (e) => {
                  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
                  const r = await updateMenteeGoalAction(g.id, { progress: Number((e.target as HTMLInputElement).value) });
                  if (r.ok) router.refresh();
                }}
              />
              <span className="w-10 text-right text-xs tabular text-muted-foreground">{g.progress}%</span>
            </div>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await addMenteeGoalAction(mentee.id, { title, dueDate: dueDate || null });
          if (!r.ok) return toast.error(r.error);
          setTitle("");
          setDueDate("");
          router.refresh();
        }}
      >
        <Input aria-label="Nova meta do mentorado" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nova meta" className="min-w-48 flex-1" maxLength={300} />
        <Input aria-label="Prazo da meta" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-40" />
        <Button type="submit" variant="outline" disabled={!title.trim()}><Plus /> Adicionar</Button>
      </form>
    </Section>
  );
}

// ─── Tarefas ───────────────────────────────────────────────────

function Tasks({ mentee, today }: { mentee: MenteeDetail; today: string }) {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  return (
    <Section title="Tarefas" icon={ListChecks} testId="mentee-tasks">
      {mentee.tasks.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma tarefa vinculada.</p>}
      <ul className="grid gap-1">
        {mentee.tasks.map((t) => {
          const due = t.dueDate ? ymd(t.dueDate) : null;
          const late = due && due < today && !t.status.isDone;
          return (
            <li key={t.id} className="flex items-center gap-2 rounded-md px-1 py-1 text-sm">
              <Checkbox
                checked={t.status.isDone}
                aria-label={`Concluir ${t.title}`}
                onChange={async (e) => {
                  const r = await setTaskDoneAction(t.id, e.target.checked);
                  if (!r.ok) return toast.error(r.error);
                  router.refresh();
                }}
              />
              <Link href={`/tarefas?t=${t.id}`} className={cn("flex-1 hover:underline", t.status.isDone && "text-muted-foreground line-through")}>{t.title}</Link>
              <span className={cn("text-xs text-muted-foreground", late && "text-danger")}>{due ? br(due).slice(0, 5) : ""}</span>
              <Badge variant="outline">{t.status.name}</Badge>
            </li>
          );
        })}
      </ul>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await addMenteeTaskAction(mentee.id, { title, dueDate: dueDate || null });
          if (!r.ok) return toast.error(r.error);
          setTitle("");
          setDueDate("");
          router.refresh();
        }}
      >
        <Input aria-label="Nova tarefa do mentorado" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nova tarefa" className="min-w-48 flex-1" maxLength={300} />
        <Input aria-label="Prazo da tarefa" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-40" />
        <Button type="submit" variant="outline" disabled={!title.trim()}><Plus /> Adicionar</Button>
      </form>
    </Section>
  );
}

// ─── Vendas ────────────────────────────────────────────────────

function Sales({ mentee, today }: { mentee: MenteeDetail; today: string }) {
  return (
    <Section title="Vendas e pagamentos" icon={FileText} testId="mentee-sales">
      {mentee.sales.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma venda vinculada. Registre pelo CRM ou no financeiro da Mentoria.</p>}
      {mentee.sales.map((s) => (
        <div key={s.id} className="grid gap-2 rounded-lg border border-border p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{s.description} <span className="font-normal text-muted-foreground">· {br(ymd(s.saleDate))}</span></p>
            <div className="flex items-center gap-2">
              <Money cents={s.totalCents} />
              <Badge variant={s.status === "ACTIVE" ? "default" : "outline"}>{SALE_STATUS[s.status]}</Badge>
              <Link href={`/financas/mentoria?aba=vendas&venda=${s.id}`} className="text-muted-foreground hover:text-foreground" aria-label="Abrir no financeiro"><ExternalLink className="size-4" /></Link>
            </div>
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {s.receivables.map((r) => {
              const late = r.status === "PENDING" && ymd(r.dueDate) < today;
              return (
                <li key={r.id}>
                  <Badge variant={r.status === "RECEIVED" ? "success" : late ? "danger" : r.status === "CANCELLED" ? "outline" : "default"}>
                    {r.number}ª {br(ymd(r.dueDate)).slice(0, 5)} · {r.status === "RECEIVED" ? "recebida" : late ? "atrasada" : r.status === "CANCELLED" ? "cancelada" : "a receber"}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </Section>
  );
}

// ─── Linha do tempo ────────────────────────────────────────────

function Timeline({ mentee, today }: { mentee: MenteeDetail; today: string }) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const [v, setV] = React.useState({ date: today, title: "", content: "" });
  return (
    <Section title="Linha do tempo" icon={Check} testId="timeline" action={<Button size="sm" variant="ghost" onClick={() => setAdding((a) => !a)}><Plus /> Registro</Button>}>
      {adding && (
        <form
          className="grid gap-2 rounded-lg border border-border p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await addTimelineEntryAction(mentee.id, { date: v.date, title: v.title, content: v.content || null });
            if (!r.ok) return toast.error(r.error);
            setV({ date: today, title: "", content: "" });
            setAdding(false);
            router.refresh();
          }}
        >
          <div className="flex gap-2">
            <Input aria-label="Data do registro" type="date" value={v.date} onChange={(e) => setV((p) => ({ ...p, date: e.target.value }))} className="w-40" required />
            <Input aria-label="Título do registro" value={v.title} onChange={(e) => setV((p) => ({ ...p, title: e.target.value }))} placeholder="Ex.: primeira venda!" required maxLength={200} />
          </div>
          <Textarea aria-label="Detalhes" value={v.content} onChange={(e) => setV((p) => ({ ...p, content: e.target.value }))} rows={2} placeholder="Detalhes (opcional)" />
          <div className="flex justify-end"><Button size="sm" type="submit">Adicionar</Button></div>
        </form>
      )}
      {mentee.timeline.length === 0 && !adding && <p className="text-sm text-muted-foreground">Os marcos aparecem aqui: início, encontros realizados, metas atingidas.</p>}
      <ol className="relative grid gap-3 border-l border-border pl-4">
        {mentee.timeline.map((t) => (
          <li key={t.id} className="relative text-sm">
            <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-primary" aria-hidden />
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t.title}</p>
                <p className="text-xs text-muted-foreground">{br(ymd(t.date))}</p>
                {t.content && <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{t.content}</p>}
              </div>
              <button
                type="button"
                className="rounded p-1 text-muted-foreground hover:text-danger"
                aria-label={`Excluir registro ${t.title}`}
                onClick={async () => {
                  const r = await deleteTimelineEntryAction(t.id);
                  if (!r.ok) return toast.error(r.error);
                  router.refresh();
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

// ─── Materiais e anotações ─────────────────────────────────────

function Materials({ mentee }: { mentee: MenteeDetail }) {
  const router = useRouter();
  const [v, setV] = React.useState({ title: "", url: "" });
  return (
    <Section title="Materiais" icon={Link2} testId="materials">
      <ul className="grid gap-1">
        {mentee.materials.map((m) => (
          <li key={m.id} className="flex items-center gap-2 text-sm">
            {m.url ? <a href={m.url} target="_blank" rel="noreferrer" className="flex-1 truncate hover:underline">{m.title}</a> : <span className="flex-1 truncate">{m.title}</span>}
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:text-danger"
              aria-label={`Excluir ${m.title}`}
              onClick={async () => {
                const r = await deleteMaterialAction(m.id);
                if (!r.ok) return toast.error(r.error);
                router.refresh();
              }}
            >
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="grid gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await addMaterialAction(mentee.id, { title: v.title, url: v.url || null });
          if (!r.ok) return toast.error(r.error);
          setV({ title: "", url: "" });
          router.refresh();
        }}
      >
        <Input aria-label="Título do material" value={v.title} onChange={(e) => setV((p) => ({ ...p, title: e.target.value }))} placeholder="Título" maxLength={200} />
        <div className="flex gap-2">
          <Input aria-label="Link do material" type="url" value={v.url} onChange={(e) => setV((p) => ({ ...p, url: e.target.value }))} placeholder="https://…" />
          <Button type="submit" variant="outline" disabled={!v.title.trim()}><Plus /></Button>
        </div>
      </form>
      <div className="mt-2 border-t border-border pt-3">
        <AttachmentsPanel entityType="mentee" entityId={mentee.id} title="Arquivos" />
      </div>
    </Section>
  );
}

function Notes({ mentee, notes }: { mentee: MenteeDetail; notes: { id: string; title: string; updatedAt: Date }[] }) {
  const router = useRouter();
  return (
    <Section
      title="Anotações"
      icon={NotebookPen}
      action={
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            const r = await createLinkedNoteAction(mentee.workspaceId, "mentee", mentee.id, `Mentoria · ${mentee.name}`);
            if (!r.ok) return toast.error(r.error);
            router.push(`/anotacoes?n=${r.value}`);
          }}
        >
          <Plus /> Nova
        </Button>
      }
    >
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Anotações vinculadas a este mentorado aparecem aqui.</p>
      ) : (
        <ul className="grid gap-1">
          {notes.map((n) => (
            <li key={n.id}><Link href={`/anotacoes?n=${n.id}`} className="text-sm hover:underline">{n.title}</Link></li>
          ))}
        </ul>
      )}
    </Section>
  );
}
