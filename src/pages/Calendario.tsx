import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, Plus, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useWorkspace, useWorkspaceMap } from "@/lib/workspace";
import { useEvents } from "@/lib/queries";
import { useSaveEvent } from "@/lib/mutations";
import { expandEvents, type Occurrence } from "@/lib/recurrence";
import { dateInZone, formatTimeZoned, minutesInZone, rruleLabel, todayISO } from "@/lib/format";
import { PageHeader, WorkspaceDot } from "@/components/common/page-parts";

const MONTH_LABELS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const WEEK_LABELS = ["Dom.", "Seg.", "Ter.", "Qua.", "Qui.", "Sex.", "Sáb."];
const HOUR_START = 5;
const HOUR_END = 23;
const PX_PER_MIN = 0.8;

type View = "dia" | "semana" | "mes";

const VIEW_LABELS: Array<{ key: View; label: string }> = [
  { key: "dia", label: "Dia" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mês" },
];

type Placed = { event: Occurrence; top: number; height: number; lane: number; lanes: number };

export default function Calendario() {
  const today = dateInZone(new Date()) ?? todayISO();
  const [params, setParams] = useSearchParams();
  const requestedView = params.get("visao");
  const view: View =
    requestedView === "dia" || requestedView === "semana" || requestedView === "mes"
      ? requestedView
      : "semana";
  const setView = (next: View) =>
    setParams(next === "semana" ? {} : { visao: next }, { replace: true });

  const [month, setMonth] = useState(new Date());
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const [dayAnchor, setDayAnchor] = useState(today);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    date: today,
    start: "09:00",
    end: "10:00",
    workspace_id: "",
    priority: "MEDIUM",
    recurrence: "none",
  });

  const { workspaces, activeId } = useWorkspace();
  const workspaceMap = useWorkspaceMap(workspaces);
  const { data: events = [] } = useEvents();
  const saveEvent = useSaveEvent();

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(weekAnchor, { weekStartsOn: 0 });
    const end = endOfWeek(weekAnchor, { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [weekAnchor]);

  const gridDays = view === "dia" ? [parseISO(dayAnchor)] : weekDays;

  const visibleRange = useMemo(() => {
    if (view === "dia") {
      const date = parseISO(dayAnchor);
      return { start: date, end: date };
    }
    if (view === "semana") return { start: weekDays[0], end: weekDays[6] };
    return { start: monthDays[0], end: monthDays[monthDays.length - 1] };
  }, [view, dayAnchor, weekDays, monthDays]);

  const occurrences = useMemo(
    () => expandEvents(events, visibleRange.start, visibleRange.end),
    [events, visibleRange],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    occurrences.forEach((occurrence) => {
      const list = map.get(occurrence.occurrence_date) ?? [];
      list.push(occurrence);
      map.set(occurrence.occurrence_date, list);
    });
    return map;
  }, [occurrences]);

  const dayOccurrences = (iso: string) =>
    (byDay.get(iso) ?? []).slice().sort((a, b) => a.start_at.localeCompare(b.start_at));

  const selectedEvents = dayOccurrences(view === "mes" ? today : dayAnchor);
  const hours = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, index) => HOUR_START + index);
  const gridHeight = (HOUR_END - HOUR_START) * 60 * PX_PER_MIN;

  const geometry = (startAt: string, endAt: string) => {
    const startMinutes = minutesInZone(startAt);
    const endMinutes = minutesInZone(endAt);
    const safeEnd = endMinutes > startMinutes ? endMinutes : startMinutes + 30;
    const top = (Math.max(startMinutes, HOUR_START * 60) - HOUR_START * 60) * PX_PER_MIN;
    const visibleEnd = Math.min(safeEnd, HOUR_END * 60);
    return {
      top,
      height: Math.max(18, (visibleEnd - Math.max(startMinutes, HOUR_START * 60)) * PX_PER_MIN - 2),
      startMinutes,
      endMinutes: safeEnd,
    };
  };

  /** Side-by-side columns for events that overlap, like a real agenda. */
  const layoutDay = (list: Occurrence[]): Placed[] => {
    const items = list
      .map((event) => {
        const geo = geometry(event.start_at, event.end_at);
        return { event, ...geo };
      })
      .sort((a, b) => a.startMinutes - b.startMinutes);

    const placed: Placed[] = [];
    let cluster: typeof items = [];
    let clusterEnd = -1;

    const flush = () => {
      if (!cluster.length) return;
      const laneEnds: number[] = [];
      const assigned = cluster.map((item) => {
        let lane = laneEnds.findIndex((end) => end <= item.startMinutes);
        if (lane === -1) {
          lane = laneEnds.length;
          laneEnds.push(item.endMinutes);
        } else {
          laneEnds[lane] = item.endMinutes;
        }
        return { ...item, lane };
      });
      const lanes = laneEnds.length || 1;
      assigned.forEach((item) =>
        placed.push({
          event: item.event,
          top: item.top,
          height: item.height,
          lane: item.lane,
          lanes,
        }),
      );
      cluster = [];
      clusterEnd = -1;
    };

    items.forEach((item) => {
      if (cluster.length && item.startMinutes >= clusterEnd) flush();
      cluster.push(item);
      clusterEnd = Math.max(clusterEnd, item.endMinutes);
    });
    flush();

    return placed;
  };

  const shift = (direction: -1 | 1) => {
    if (view === "mes") {
      setMonth(direction === 1 ? addMonths(month, 1) : subMonths(month, 1));
      return;
    }
    if (view === "semana") {
      setWeekAnchor(direction === 1 ? addWeeks(weekAnchor, 1) : subWeeks(weekAnchor, 1));
      return;
    }
    const next = direction === 1 ? addDays(parseISO(dayAnchor), 1) : subDays(parseISO(dayAnchor), 1);
    setDayAnchor(format(next, "yyyy-MM-dd"));
  };

  const goToday = () => {
    setMonth(new Date());
    setWeekAnchor(new Date());
    setDayAnchor(today);
  };

  const openNew = (date = dayAnchor) => {
    setForm({
      title: "",
      date,
      start: "09:00",
      end: "10:00",
      workspace_id: activeId ?? workspaces[0]?.id ?? "",
      priority: "MEDIUM",
      recurrence: "none",
    });
    setOpen(true);
  };

  const submit = () => {
    if (!form.title.trim() || !form.workspace_id) return;
    const rrule =
      form.recurrence === "weekdays"
        ? "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR"
        : form.recurrence === "weekly"
          ? "FREQ=WEEKLY;INTERVAL=1"
          : form.recurrence === "daily"
            ? "FREQ=DAILY;INTERVAL=1"
            : null;
    saveEvent.mutate(
      {
        title: form.title.trim(),
        start_at: new Date(`${form.date}T${form.start}:00-03:00`).toISOString(),
        end_at: new Date(`${form.date}T${form.end}:00-03:00`).toISOString(),
        all_day: false,
        timezone: "America/Sao_Paulo",
        workspace_id: form.workspace_id,
        priority: form.priority,
        rrule,
        status: "NOT_STARTED",
        transparency: "BUSY",
        sync_state: "LOCAL",
      },
      { onSuccess: () => setOpen(false) },
    );
  };

  const periodLabel =
    view === "mes"
      ? format(month, "MMMM 'de' yyyy", { locale: ptBR })
      : view === "semana"
        ? `${format(weekDays[0], "dd")} – ${format(weekDays[6], "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`
        : format(parseISO(dayAnchor), "d 'de' MMMM 'de' yyyy", { locale: ptBR });

  const blockStyle = (workspaceId: string) => {
    const color = workspaceMap.get(workspaceId)?.color ?? "#B8AAA4";
    return { backgroundColor: `${color}1c`, borderColor: `${color}5c` };
  };

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Agenda"
        title="Seus compromissos no tempo"
        description="Semana para encaixar, dia para executar e mês para planejar. A agenda é independente da rotina."
        actions={
          <Button onClick={() => openNew(view === "mes" ? today : dayAnchor)}>
            <Plus className="size-4" /> Novo evento
          </Button>
        }
      />

      <Card className="border-border/70 shadow-card">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" onClick={() => shift(-1)} aria-label="Anterior">
                <ChevronLeft className="size-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => shift(1)} aria-label="Próximo">
                <ChevronRight className="size-4" />
              </Button>
              <Button size="sm" variant="outline" className="ml-1 hidden sm:inline-flex" onClick={goToday}>
                Hoje
              </Button>
            </div>
            <p className="truncate text-center font-display text-sm capitalize text-foreground sm:text-lg">
              {periodLabel}
            </p>
            <div className="flex rounded-full border border-border bg-secondary/60 p-0.5 text-[11px] sm:text-xs">
              {VIEW_LABELS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setView(option.key)}
                  className={cn(
                    "rounded-full px-2.5 py-1 transition sm:px-3",
                    view === option.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {view === "mes" ? (
            <div className="grid gap-5 lg:grid-cols-[1.75fr_1fr]">
              <div>
                <div className="grid grid-cols-7 gap-1 pb-1">
                  {MONTH_LABELS.map((day) => (
                    <div
                      key={day}
                      className="pb-1 text-center text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground"
                    >
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {monthDays.map((day) => {
                    const iso = format(day, "yyyy-MM-dd");
                    const dayList = dayOccurrences(iso);
                    const outside = !isSameMonth(day, month);
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => {
                          setDayAnchor(iso);
                          setView("dia");
                        }}
                        className={cn(
                          "flex min-h-[82px] flex-col gap-1 rounded-xl border p-1.5 text-left align-top transition",
                          iso === today
                            ? "border-primary/40 bg-accent/40"
                            : "border-border/50 hover:border-primary/30",
                          outside && "opacity-45",
                        )}
                      >
                        <span
                          className={cn(
                            "text-xs tabular-nums",
                            iso === today
                              ? "flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          {format(day, "d")}
                        </span>
                        <div className="space-y-0.5">
                          {dayList.slice(0, 2).map((event) => (
                            <span
                              key={`${event.id}-${event.start_at}`}
                              className="block truncate rounded border px-1 py-0.5 text-[10px] text-foreground"
                              style={blockStyle(event.workspace_id)}
                            >
                              {formatTimeZoned(event.start_at)} {event.title}
                            </span>
                          ))}
                          {dayList.length > 2 ? (
                            <span className="block text-[10px] text-muted-foreground">
                              +{dayList.length - 2}
                            </span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-display text-base capitalize text-foreground">
                    {format(parseISO(today), "EEEE, d 'de' MMMM", { locale: ptBR })}
                  </p>
                  <Button size="sm" variant="ghost" onClick={() => openNew(today)}>
                    <Plus className="size-3.5" /> evento
                  </Button>
                </div>
                {selectedEvents.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-8 text-center">
                    <CalendarDays className="size-5 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Dia livre na agenda.</p>
                  </div>
                ) : (
                  selectedEvents.map((event) => (
                    <div key={`${event.id}-${event.start_at}`} className="rounded-xl border border-border/60 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">{event.title}</p>
                        <WorkspaceDot color={workspaceMap.get(event.workspace_id)?.color} />
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Clock className="size-3" />
                        {formatTimeZoned(event.start_at)} – {formatTimeZoned(event.end_at)}
                      </p>
                      {event.rrule ? (
                        <Badge variant="secondary" className="mt-2 gap-1 text-[10px]">
                          <Repeat className="size-2.5" /> {rruleLabel(event.rrule)}
                        </Badge>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <div
                className={cn(
                  "overflow-hidden rounded-xl border border-border/70",
                  view === "dia" ? "min-w-0" : "min-w-[860px]",
                )}
              >
                <div
                  className="grid border-b border-border/70 bg-secondary/40"
                  style={{ gridTemplateColumns: `68px repeat(${gridDays.length}, minmax(0,1fr))` }}
                >
                  <div className="px-2 py-2" />
                  {gridDays.map((day, index) => {
                    const iso = format(day, "yyyy-MM-dd");
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => {
                          setDayAnchor(iso);
                          setView("dia");
                        }}
                        className={cn(
                          "border-l border-border/60 px-2 py-2 text-center transition hover:bg-card/60",
                          iso === today && "bg-accent/50",
                        )}
                      >
                        <span className="text-[11px] text-muted-foreground">
                          {view === "dia"
                            ? format(day, "EEEE", { locale: ptBR })
                            : WEEK_LABELS[day.getDay()]}
                        </span>{" "}
                        <span
                          className={cn(
                            "text-[11px] tabular-nums",
                            iso === today ? "font-semibold text-primary" : "text-foreground",
                          )}
                        >
                          {format(day, "dd/MM")}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div
                  className="grid border-b border-border/70"
                  style={{ gridTemplateColumns: `68px repeat(${gridDays.length}, minmax(0,1fr))` }}
                >
                  <div className="px-2 py-2 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    Dia todo
                  </div>
                  {gridDays.map((day) => {
                    const iso = format(day, "yyyy-MM-dd");
                    const allDay = dayOccurrences(iso).filter((event) => event.all_day);
                    return (
                      <div key={iso} className="min-h-[34px] space-y-0.5 border-l border-border/60 px-1 py-1">
                        {allDay.map((event) => (
                          <span
                            key={`${event.id}-${event.start_at}`}
                            className="block truncate rounded border px-1 py-0.5 text-[10px] text-foreground"
                            style={blockStyle(event.workspace_id)}
                          >
                            {event.title}
                          </span>
                        ))}
                      </div>
                    );
                  })}
                </div>

                <div
                  className="grid"
                  style={{ gridTemplateColumns: `68px repeat(${gridDays.length}, minmax(0,1fr))` }}
                >
                  <div className="relative" style={{ height: gridHeight }}>
                    {hours.map((hour) => (
                      <span
                        key={hour}
                        className="absolute right-2 translate-y-0.5 text-[10px] tabular-nums text-muted-foreground"
                        style={{ top: (hour - HOUR_START) * 60 * PX_PER_MIN }}
                      >
                        {String(hour).padStart(2, "0")}
                      </span>
                    ))}
                  </div>

                  {gridDays.map((day) => {
                    const iso = format(day, "yyyy-MM-dd");
                    const timed = dayOccurrences(iso).filter((event) => !event.all_day);
                    return (
                      <div
                        key={iso}
                        className={cn("relative border-l border-border/60", iso === today && "bg-accent/15")}
                        style={{ height: gridHeight }}
                      >
                        {hours.map((hour) => (
                          <div
                            key={hour}
                            className="absolute inset-x-0 border-t border-border/50"
                            style={{ top: (hour - HOUR_START) * 60 * PX_PER_MIN }}
                          />
                        ))}
                        {layoutDay(timed).map(({ event, top, height, lane, lanes }) => (
                          <button
                            key={`${event.id}-${event.start_at}`}
                            type="button"
                            onClick={() => {
                              setDayAnchor(iso);
                              setView("dia");
                            }}
                            className="absolute overflow-hidden rounded-md border px-1.5 py-[3px] text-left shadow-[0_1px_1px_hsl(var(--foreground)/0.04)] transition hover:brightness-[0.97]"
                            style={{
                              top,
                              height,
                              left: `calc(${(lane / lanes) * 100}% + 3px)`,
                              width: `calc(${100 / lanes}% - 6px)`,
                              ...blockStyle(event.workspace_id),
                            }}
                            title={`${event.title} · ${formatTimeZoned(event.start_at)}–${formatTimeZoned(event.end_at)}`}
                          >
                            {height < 30 ? (
                              <span className="block truncate text-[9px] leading-[1.2] text-foreground">
                                {formatTimeZoned(event.start_at)} {event.title}
                              </span>
                            ) : (
                              <>
                                <span className="block truncate text-[10px] tabular-nums text-foreground/75">
                                  {formatTimeZoned(event.start_at)}
                                  {height > 52 ? ` - ${formatTimeZoned(event.end_at)}` : ""}
                                </span>
                                <span className="block truncate text-[11px] font-medium leading-tight text-foreground">
                                  {event.title}
                                </span>
                              </>
                            )}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {view !== "mes" ? (
            <div className="space-y-2 border-t border-border/60 pt-4">
              <div className="flex items-center justify-between">
                <p className="font-display text-base capitalize text-foreground">
                  {format(parseISO(dayAnchor), "EEEE, d 'de' MMMM", { locale: ptBR })}
                </p>
                <Button size="sm" variant="ghost" onClick={() => openNew(dayAnchor)}>
                  <Plus className="size-3.5" /> evento neste dia
                </Button>
              </div>
              {selectedEvents.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">Nenhum compromisso neste dia.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {selectedEvents.map((event) => (
                    <div key={`${event.id}-${event.start_at}`} className="rounded-xl border border-border/60 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">{event.title}</p>
                        <WorkspaceDot color={workspaceMap.get(event.workspace_id)?.color} />
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Clock className="size-3" /> {formatTimeZoned(event.start_at)} –{" "}
                        {formatTimeZoned(event.end_at)}
                      </p>
                      {event.location ? (
                        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <MapPin className="size-3" /> {event.location}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {event.rrule ? (
                          <Badge variant="secondary" className="gap-1 text-[10px]">
                            <Repeat className="size-2.5" /> {rruleLabel(event.rrule)}
                          </Badge>
                        ) : null}
                        {event.external_id ? (
                          <Badge variant="outline" className="text-[10px]">
                            Google Agenda
                          </Badge>
                        ) : null}
                        <span className="text-[10px] text-muted-foreground">
                          {workspaceMap.get(event.workspace_id)?.name}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo evento</DialogTitle>
            <DialogDescription>Os eventos entram na agenda — a rotina continua separada.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="event-title">Título</Label>
              <Input
                id="event-title"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Ex.: reunião de alinhamento"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="event-date">Data</Label>
                <Input
                  id="event-date"
                  type="date"
                  value={form.date}
                  onChange={(event) => setForm({ ...form, date: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="event-start">Início</Label>
                <Input
                  id="event-start"
                  type="time"
                  value={form.start}
                  onChange={(event) => setForm({ ...form, start: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="event-end">Fim</Label>
                <Input
                  id="event-end"
                  type="time"
                  value={form.end}
                  onChange={(event) => setForm({ ...form, end: event.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Área</Label>
                <Select
                  value={form.workspace_id}
                  onValueChange={(value) => setForm({ ...form, workspace_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Área" />
                  </SelectTrigger>
                  <SelectContent>
                    {workspaces.map((workspace) => (
                      <SelectItem key={workspace.id} value={workspace.id}>
                        {workspace.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Repetir</Label>
                <Select
                  value={form.recurrence}
                  onValueChange={(value) => setForm({ ...form, recurrence: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não repetir</SelectItem>
                    <SelectItem value="daily">Todos os dias</SelectItem>
                    <SelectItem value="weekdays">Dias úteis</SelectItem>
                    <SelectItem value="weekly">Toda semana</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select
                value={form.priority}
                onValueChange={(value) => setForm({ ...form, priority: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="URGENT">Urgente</SelectItem>
                  <SelectItem value="HIGH">Alta</SelectItem>
                  <SelectItem value="MEDIUM">Média</SelectItem>
                  <SelectItem value="LOW">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" onClick={submit} disabled={saveEvent.isPending}>
              Criar evento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
