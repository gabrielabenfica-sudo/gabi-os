"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { EventChangeArg } from "@fullcalendar/core";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader, Segmented, WsDot } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { addDaysYmd } from "@/lib/dates";
import { listOccurrencesAction, rescheduleEventAction } from "./actions";
import { syncCalendarsIfStaleAction } from "../configuracoes/integracoes/actions";
import { EventDialog, type EventDialogState } from "./event-dialog";
import { ConflictDialog } from "./conflict-dialog";
import { TimelineView } from "./timeline-view";
import type { CalendarViewName } from "./calendar-view";
import type { AgendaWs, Conflict, Occurrence, ProjectRef, TaskRef } from "./shared";

const CalendarView = dynamic(() => import("./calendar-view").then((m) => m.CalendarView), {
  ssr: false,
  loading: () => <div className="h-[640px] animate-pulse rounded-xl bg-muted" />,
});

type View = CalendarViewName | "timeline";

const VIEWS: { value: View; label: string }[] = [
  { value: "timeGridDay", label: "Dia" },
  { value: "timeGridWeek", label: "Semana" },
  { value: "dayGridMonth", label: "Mês" },
  { value: "listWeek", label: "Lista" },
  { value: "timeline", label: "Linha do tempo" },
];

export function AgendaClient({
  workspaces,
  initialVisible,
  tz,
  today,
  tasks,
  projects,
  openEventId,
  openNew,
}: {
  workspaces: AgendaWs[];
  initialVisible: string[];
  tz: string;
  today: string;
  tasks: TaskRef[];
  projects: ProjectRef[];
  openEventId: string | null;
  openNew: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const anchor = React.useRef<Date | undefined>(undefined);
  const [view, setView] = React.useState<View>(() => (VIEWS.some((v) => v.value === params.get("v")) ? (params.get("v") as View) : "timeGridWeek"));
  const [visible, setVisible] = React.useState<string[]>(initialVisible);
  const [range, setRange] = React.useState<{ from: Date; to: Date } | null>(null);
  const [timelineStart, setTimelineStart] = React.useState(today);
  const [occurrences, setOccurrences] = React.useState<Occurrence[]>([]);
  const [dialog, setDialog] = React.useState<EventDialogState | null>(
    openEventId ? { mode: "edit", eventId: openEventId } : openNew ? { mode: "new" } : null,
  );
  React.useEffect(() => {
    if (openNew) setDialog({ mode: "new" });
    else if (openEventId) setDialog({ mode: "edit", eventId: openEventId });
  }, [openNew, openEventId]);
  const [pendingMove, setPendingMove] = React.useState<{ info: EventChangeArg; conflicts: Conflict[] } | null>(null);

  // A linha do tempo mostra 14 dias a partir da data escolhida
  const effectiveRange = React.useMemo(() => {
    if (view !== "timeline") return range;
    const from = new Date(`${timelineStart}T00:00:00`);
    return { from, to: new Date(from.getTime() + 14 * 86_400_000) };
  }, [view, range, timelineStart]);

  const load = React.useCallback(async () => {
    if (!effectiveRange) return;
    const r = await listOccurrencesAction(effectiveRange.from.toISOString(), effectiveRange.to.toISOString(), visible);
    if (r.ok) setOccurrences(r.data);
    else toast.error(r.error);
  }, [effectiveRange, visible]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Google Calendar: sincroniza ao abrir a agenda se a última vez foi há mais de 10 minutos
  React.useEffect(() => {
    void syncCalendarsIfStaleAction().then((r) => {
      if (r.changed) void load();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const changeView = (v: View) => {
    setView(v);
    const next = new URLSearchParams(params.toString());
    next.set("v", v);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const onRange = React.useCallback((from: Date, to: Date, current: Date) => {
    anchor.current = current;
    setRange((prev) => (prev && prev.from.getTime() === from.getTime() && prev.to.getTime() === to.getTime() ? prev : { from, to }));
  }, []);

  const doMove = async (info: EventChangeArg, allowConflict: boolean) => {
    const ev = info.event;
    const allDay = ev.allDay;
    const start = allDay ? `${ev.startStr.slice(0, 10)}T00:00:00.000Z` : ev.start!.toISOString();
    const end = allDay
      ? `${(ev.endStr || addDaysYmd(ev.startStr.slice(0, 10), 1)).slice(0, 10)}T00:00:00.000Z`
      : (ev.end ?? new Date(ev.start!.getTime() + 3_600_000)).toISOString();
    const r = await rescheduleEventAction(
      ev.extendedProps.eventId as string,
      { start, end, allDay, occurrenceStart: ev.extendedProps.isRecurring ? (ev.extendedProps.occurrenceStart as string) : undefined },
      allowConflict,
    );
    if (!r.ok) {
      toast.error(r.error);
      info.revert();
      return;
    }
    if (!r.data.saved) {
      setPendingMove({ info, conflicts: r.data.conflicts });
      return;
    }
    toast.success(ev.extendedProps.isRecurring ? "Série reagendada." : "Compromisso reagendado.");
    setPendingMove(null);
    void load();
  };

  const toggleWs = (id: string) =>
    setVisible((v) => (v.includes(id) ? (v.length > 1 ? v.filter((x) => x !== id) : v) : [...v, id]));

  const defaultWs = visible.length === 1 ? visible[0]! : workspaces[0]?.id ?? "";

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Agenda"
        description="Compromissos dos três ambientes juntos, para não marcar nada em cima de nada."
        actions={
          <Button onClick={() => setDialog({ mode: "new" })}>
            <Plus /> Novo compromisso
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Segmented ariaLabel="Visualização da agenda" value={view} options={VIEWS} onChange={changeView} size="sm" />
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Ambientes visíveis">
          {workspaces.map((w) => {
            const on = visible.includes(w.id);
            return (
              <button
                key={w.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleWs(w.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  on ? "border-foreground/15 bg-card text-foreground shadow-sm" : "border-dashed border-border text-muted-foreground",
                )}
              >
                <WsDot color={w.color} className={cn(!on && "opacity-40")} /> {w.name}
              </button>
            );
          })}
        </div>
      </div>

      {view === "timeline" ? (
        <div className="grid gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setTimelineStart(addDaysYmd(timelineStart, -14))} aria-label="Período anterior"><ChevronLeft /></Button>
            <Button variant="outline" size="sm" onClick={() => setTimelineStart(today)}>Hoje</Button>
            <Button variant="outline" size="icon" onClick={() => setTimelineStart(addDaysYmd(timelineStart, 14))} aria-label="Próximo período"><ChevronRight /></Button>
            <span className="text-sm text-muted-foreground">
              {timelineStart.split("-").reverse().join("/")} – {addDaysYmd(timelineStart, 13).split("-").reverse().join("/")}
            </span>
          </div>
          <TimelineView occurrences={occurrences} tz={tz} today={today} onOpen={(id) => setDialog({ mode: "edit", eventId: id })} />
        </div>
      ) : (
        <CalendarView
          key={view}
          view={view}
          initialDate={anchor.current}
          occurrences={occurrences}
          onRange={onRange}
          onSelect={(start, end, allDay) => setDialog({ mode: "new", start, end, allDay })}
          onOpen={(id) => setDialog({ mode: "edit", eventId: id })}
          onMove={(info) => void doMove(info, false)}
        />
      )}

      {dialog && (
        <EventDialog
          key={dialog.mode === "edit" ? dialog.eventId : "new"}
          state={dialog}
          workspaces={workspaces}
          defaultWorkspaceId={defaultWs}
          tz={tz}
          tasks={tasks}
          projects={projects}
          onClose={() => {
            setDialog(null);
            if (params.get("e") || params.get("novo")) {
              const next = new URLSearchParams(params.toString());
              next.delete("e");
              next.delete("novo");
              router.replace(`${pathname}?${next.toString()}`, { scroll: false });
            }
          }}
          onSaved={() => void load()}
        />
      )}
      {pendingMove && (
        <ConflictDialog
          conflicts={pendingMove.conflicts}
          tz={tz}
          onChooseAnother={() => {
            pendingMove.info.revert();
            setPendingMove(null);
          }}
          onConfirm={() => void doMove(pendingMove.info, true)}
        />
      )}
    </div>
  );
}
