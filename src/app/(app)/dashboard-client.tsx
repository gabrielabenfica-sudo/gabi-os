"use client";

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, CalendarClock, Check, Clock, LayoutGrid, MapPin, Repeat } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/form-controls";
import { Checkbox, Segmented, WsDot } from "@/components/ui/misc";
import { PriorityBadge } from "@/components/priority";
import { cn } from "@/lib/utils";
import type { DashboardData } from "@/server/dashboard";
import { WIDGETS, type DashboardPeriod, type DashboardPrefs, type WidgetId } from "@/lib/dashboard-widgets";
import { completeTaskFromDashboardAction, saveDashboardPrefsAction, toggleHabitTodayAction } from "./dashboard-actions";
import { QuickCreateMenu } from "@/components/shell/quick-create";

const CompletionChart = dynamic(() => import("./completion-chart").then((m) => m.CompletionChart), {
  ssr: false,
  loading: () => <div className="h-48 animate-pulse rounded-lg bg-muted" />,
});

const PERIOD_LABEL: Record<DashboardPeriod, string> = { today: "Hoje", week: "Semana", month: "Mês", custom: "Personalizado" };

function ymdBR(ymd: string) {
  return ymd.split("-").reverse().join("/");
}

function timeLabel(d: Date | string, tz: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(d));
}

function dayLabel(d: Date | string, tz: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: tz, weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(d));
}

export function DashboardClient({
  greeting,
  dateLabel,
  period,
  data,
  prefs,
  tz,
  workspaceLabel,
}: {
  greeting: string;
  dateLabel: string;
  period: DashboardPeriod;
  data: DashboardData;
  prefs: DashboardPrefs;
  tz: string;
  workspaceLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [customizing, setCustomizing] = React.useState(false);
  const [custom, setCustom] = React.useState({ from: params.get("de") ?? data.range.from, to: params.get("ate") ?? data.range.to });

  const setPeriod = (p: DashboardPeriod) => {
    const next = new URLSearchParams(params.toString());
    if (p === "today") next.delete("periodo");
    else next.set("periodo", p);
    if (p !== "custom") {
      next.delete("de");
      next.delete("ate");
    } else {
      next.set("de", custom.from);
      next.set("ate", custom.to);
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const order = [...prefs.order.filter((id) => WIDGETS.some((w) => w.id === id)), ...WIDGETS.map((w) => w.id).filter((id) => !prefs.order.includes(id))] as WidgetId[];
  const visible = order.filter((id) => !prefs.hidden.includes(id));
  const periodText = data.range.from === data.range.to ? ymdBR(data.range.from) : `${ymdBR(data.range.from)} a ${ymdBR(data.range.to)}`;

  const widgets: Record<WidgetId, React.ReactNode> = {
    "tasks-summary": <Indicators data={data} period={period} />,
    "next-event": <NextEvent data={data} tz={tz} />,
    agenda: <PeriodAgenda data={data} tz={tz} period={period} />,
    priorities: <TaskListCard title="Prioridades" empty="Nenhuma prioridade alta ou prazo no período." tasks={data.priorities} today={data.today} />,
    overdue: <TaskListCard title="Tarefas atrasadas" empty="Nada atrasado. 👏" tasks={data.overdue} today={data.today} tone="danger" />,
    habits: <HabitsCard data={data} />,
    "completion-chart": (
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Tarefas concluídas por dia</CardTitle></CardHeader>
        <CardContent>
          {data.completionSeries.length < 2 ? (
            <p className="text-sm text-muted-foreground">Escolha semana, mês ou um período personalizado para ver a evolução.</p>
          ) : data.completionSeries.every((d) => d.count === 0) ? (
            <p className="text-sm text-muted-foreground">Nenhuma tarefa concluída neste período.</p>
          ) : (
            <CompletionChart series={data.completionSeries} />
          )}
        </CardContent>
      </Card>
    ),
  };

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm capitalize text-muted-foreground">{dateLabel}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{greeting}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{workspaceLabel} · {periodText}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented ariaLabel="Período" value={period} options={(Object.keys(PERIOD_LABEL) as DashboardPeriod[]).map((p) => ({ value: p, label: PERIOD_LABEL[p] }))} onChange={setPeriod} size="sm" />
          <Button variant="outline" size="sm" onClick={() => setCustomizing(true)}><LayoutGrid /> Personalizar</Button>
          <QuickCreateMenu />
        </div>
      </header>

      {period === "custom" && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPeriod("custom");
          }}
        >
          <label className="grid gap-1 text-xs text-muted-foreground">De<Input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="w-40" /></label>
          <label className="grid gap-1 text-xs text-muted-foreground">Até<Input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="w-40" /></label>
          <Button type="submit" size="sm">Aplicar</Button>
        </form>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {visible.map((id) => (
          <div key={id} className={cn("contents")} data-widget={id}>
            {widgets[id]}
          </div>
        ))}
      </div>
      {visible.length === 0 && <p className="text-sm text-muted-foreground">Todos os cartões estão ocultos. Use “Personalizar” para exibi-los.</p>}

      {customizing && <CustomizeDialog prefs={prefs} order={order} onClose={() => setCustomizing(false)} />}
    </div>
  );
}

function Kpi({ label, value, hint, tone, href }: { label: string; value: React.ReactNode; hint?: string; tone?: "danger" | "success"; href?: string }) {
  const content = (
    <div className="grid gap-1 rounded-xl border border-border bg-card px-4 py-3 transition-shadow hover:shadow-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-2xl font-semibold tabular", tone === "danger" && "text-danger", tone === "success" && "text-success")}>{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
  return href ? <Link href={href} className="block">{content}</Link> : content;
}

function Indicators({ data, period }: { data: DashboardData; period: DashboardPeriod }) {
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-2 xl:grid-cols-7" aria-label="Indicadores">
      <Kpi label="Compromissos hoje" value={data.eventsTodayCount} href="/agenda?v=timeGridDay" />
      <Kpi label="Compromissos na semana" value={data.eventsWeekCount} href="/agenda?v=timeGridWeek" />
      <Kpi label="Tarefas pendentes" value={data.stats.pending} href="/tarefas?view=lista" />
      <Kpi label="Em andamento" value={data.stats.inProgress} href="/tarefas" />
      <Kpi label={period === "today" ? "Concluídas hoje" : "Concluídas no período"} value={data.stats.doneInRange} tone={data.stats.doneInRange ? "success" : undefined} />
      <Kpi label="Atrasadas" value={data.stats.overdue} tone={data.stats.overdue ? "danger" : undefined} href="/tarefas?view=lista&atrasadas=1" />
      <Kpi label="Hábitos hoje" value={data.habits.expectedToday ? `${data.habits.doneToday}/${data.habits.expectedToday}` : "—"} href="/habitos" />
    </section>
  );
}

function NextEvent({ data, tz }: { data: DashboardData; tz: string }) {
  const e = data.nextEvent;
  return (
    <Card>
      <CardHeader><CardTitle>Próximo compromisso</CardTitle></CardHeader>
      <CardContent>
        {!e ? (
          <p className="text-sm text-muted-foreground">Nada agendado para os próximos 60 dias.</p>
        ) : (
          <Link href={`/agenda?v=timeline&e=${e.eventId}`} className="grid gap-1 rounded-lg border border-border p-3 hover:bg-accent/40">
            <span className="flex items-center gap-2 text-base font-semibold">
              {e.title} {e.isRecurring && <Repeat className="size-4 text-muted-foreground" />}
            </span>
            <span className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1 capitalize"><CalendarClock className="size-4" /> {dayLabel(e.start, tz)}</span>
              <span className="inline-flex items-center gap-1"><Clock className="size-4" /> {e.allDay ? "Dia inteiro" : `${timeLabel(e.start, tz)}–${timeLabel(e.end, tz)}`}</span>
              <span className="inline-flex items-center gap-1.5"><WsDot color={e.workspace.color} /> {e.workspace.name}</span>
              {e.location && <span className="inline-flex items-center gap-1"><MapPin className="size-4" /> {e.location}</span>}
            </span>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

function PeriodAgenda({ data, tz, period }: { data: DashboardData; tz: string; period: DashboardPeriod }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{period === "today" ? "Compromissos de hoje" : "Compromissos do período"}</CardTitle>
        <Link href="/agenda" className="text-xs text-primary hover:underline">Abrir agenda</Link>
      </CardHeader>
      <CardContent>
        {data.periodEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum compromisso.</p>
        ) : (
          <ul className="grid gap-2">
            {data.periodEvents.map((o) => (
              <li key={o.key} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 tabular text-muted-foreground">
                  {period !== "today" && <span className="block text-[11px] capitalize">{dayLabel(o.start, tz)}</span>}
                  {o.allDay ? "Dia inteiro" : `${timeLabel(o.start, tz)}–${timeLabel(o.end, tz)}`}
                </span>
                <WsDot color={o.workspace.color} />
                <Link href={`/agenda?v=timeline&e=${o.eventId}`} className={cn("truncate hover:underline", o.status === "DONE" && "text-muted-foreground line-through")}>{o.title}</Link>
              </li>
            ))}
            {data.periodEventsCount > data.periodEvents.length && (
              <li className="text-xs text-muted-foreground">+ {data.periodEventsCount - data.periodEvents.length} outros</li>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TaskListCard({ title, empty, tasks, today, tone }: { title: string; empty: string; tasks: DashboardData["priorities"]; today: string; tone?: "danger" }) {
  const router = useRouter();
  const [doneIds, setDoneIds] = React.useState<string[]>([]);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className={cn(tone === "danger" && tasks.length > 0 && "flex items-center gap-2")}>
          {tone === "danger" && tasks.length > 0 && <AlertTriangle className="size-4 text-danger" />} {title}
        </CardTitle>
        <Link href={tone === "danger" ? "/tarefas?view=lista&atrasadas=1" : "/tarefas?view=lista"} className="text-xs text-primary hover:underline">Ver todas</Link>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="grid gap-2">
            {tasks.map((t) => {
              const due = t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : null;
              const done = doneIds.includes(t.id);
              return (
                <li key={t.id} className="flex items-center gap-3 text-sm">
                  <Checkbox
                    checked={done}
                    aria-label={`Concluir ${t.title}`}
                    onChange={async () => {
                      setDoneIds((d) => [...d, t.id]);
                      const r = await completeTaskFromDashboardAction(t.id);
                      if (!r.ok) {
                        setDoneIds((d) => d.filter((x) => x !== t.id));
                        return toast.error(r.error);
                      }
                      toast.success(r.message);
                      router.refresh();
                    }}
                  />
                  <WsDot color={t.workspace.color} />
                  <Link href={`/tarefas?view=lista&t=${t.id}`} className={cn("flex-1 truncate hover:underline", done && "text-muted-foreground line-through")}>{t.title}</Link>
                  <PriorityBadge priority={t.priority} hideMedium />
                  {due && (
                    <span className={cn("shrink-0 tabular text-xs", due < today ? "font-medium text-danger" : due === today ? "font-medium text-warning" : "text-muted-foreground")}>
                      {due === today ? "Hoje" : ymdBR(due).slice(0, 5)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function HabitsCard({ data }: { data: DashboardData }) {
  const router = useRouter();
  const [state, setState] = React.useState(() => Object.fromEntries(data.habits.items.map((h) => [h.id, h.doneToday])));
  React.useEffect(() => setState(Object.fromEntries(data.habits.items.map((h) => [h.id, h.doneToday]))), [data.habits.items]);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Hábitos de hoje</CardTitle>
        <span className="text-xs text-muted-foreground">Média no período: {data.habits.averageRate === null ? "—" : `${data.habits.averageRate}%`}</span>
      </CardHeader>
      <CardContent>
        {data.habits.count === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum hábito cadastrado. <Link href="/habitos?novo=1" className="text-primary hover:underline">Criar hábito</Link>
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {data.habits.items.filter((h) => h.expectedToday).map((h) => {
              const on = state[h.id] ?? false;
              return (
                <li key={h.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={async () => {
                      setState((s) => ({ ...s, [h.id]: !on }));
                      const r = await toggleHabitTodayAction(h.id, !on);
                      if (!r.ok) {
                        setState((s) => ({ ...s, [h.id]: on }));
                        toast.error(r.error);
                      } else router.refresh();
                    }}
                    className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors", on ? "border-transparent bg-success text-white" : "border-border hover:bg-accent")}
                  >
                    {on ? <Check className="size-4" /> : <span className="size-2.5 rounded-full" style={{ background: h.color }} aria-hidden />}
                    {h.name}
                  </button>
                </li>
              );
            })}
            {data.habits.items.every((h) => !h.expectedToday) && <li className="text-sm text-muted-foreground">Nenhum hábito previsto para hoje.</li>}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function CustomizeDialog({ prefs, order, onClose }: { prefs: DashboardPrefs; order: WidgetId[]; onClose: () => void }) {
  const [items, setItems] = React.useState(order);
  const [hidden, setHidden] = React.useState<string[]>(prefs.hidden);
  const label = (id: string) => WIDGETS.find((w) => w.id === id)?.label ?? id;
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setItems(next);
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Personalizar painel</DialogTitle>
          <DialogDescription>Escolha os cartões e a ordem em que aparecem.</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-1.5">
          {items.map((id, i) => (
            <li key={id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <Checkbox checked={!hidden.includes(id)} onChange={(e) => setHidden(e.target.checked ? hidden.filter((h) => h !== id) : [...hidden, id])} aria-label={`Exibir ${label(id)}`} />
              <span className="flex-1">{label(id)}</span>
              <Button size="icon" variant="ghost" className="size-7" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Mover para cima"><ArrowUp /></Button>
              <Button size="icon" variant="ghost" className="size-7" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Mover para baixo"><ArrowDown /></Button>
            </li>
          ))}
        </ul>
        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={() => { setItems(WIDGETS.map((w) => w.id)); setHidden([]); }}>Restaurar padrão</Button>
          <Button
            onClick={async () => {
              const r = await saveDashboardPrefsAction({ order: items, hidden });
              if (!r.ok) return toast.error(r.error);
              toast.success(r.message);
              onClose();
            }}
          >
            Salvar <ArrowRight />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

