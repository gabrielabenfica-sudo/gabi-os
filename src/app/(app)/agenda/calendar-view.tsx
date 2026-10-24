"use client";

import * as React from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import ptBrLocale from "@fullcalendar/core/locales/pt-br";
import type { DatesSetArg, EventChangeArg, EventInput } from "@fullcalendar/core";
import type { Occurrence } from "./shared";

export type CalendarViewName = "timeGridDay" | "timeGridWeek" | "dayGridMonth" | "listWeek";

const STATUS_CLASS: Record<string, string[]> = {
  CANCELLED: ["line-through", "opacity-50"],
  DONE: ["opacity-70"],
};

function toEvent(o: Occurrence): EventInput {
  const start = new Date(o.start);
  const end = new Date(o.end);
  return {
    id: o.key,
    title: o.title,
    // Dia inteiro vai como data (sem hora) para não mudar de dia com o fuso
    start: o.allDay ? start.toISOString().slice(0, 10) : start,
    end: o.allDay ? end.toISOString().slice(0, 10) : end,
    allDay: o.allDay,
    backgroundColor: o.transparency === "FREE" ? "transparent" : `${o.workspace.color}2e`,
    borderColor: o.workspace.color,
    textColor: "var(--foreground)",
    classNames: [...(STATUS_CLASS[o.status] ?? []), o.transparency === "FREE" ? "border-dashed" : ""],
    extendedProps: { eventId: o.eventId, isRecurring: o.isRecurring, occurrenceStart: start.toISOString(), workspace: o.workspace.name, location: o.location },
  };
}

/** Calendário (dia, semana, mês e lista) com arrastar para reagendar. */
export function CalendarView({
  view,
  initialDate,
  occurrences,
  onRange,
  onSelect,
  onOpen,
  onMove,
}: {
  view: CalendarViewName;
  initialDate?: Date;
  occurrences: Occurrence[];
  onRange: (from: Date, to: Date, current: Date) => void;
  onSelect: (start: Date, end: Date, allDay: boolean) => void;
  onOpen: (eventId: string) => void;
  onMove: (info: EventChangeArg) => void;
}) {
  const events = React.useMemo(() => occurrences.map(toEvent), [occurrences]);
  return (
    <div className="gabi-calendar rounded-xl border border-border bg-card p-3" data-testid="calendar">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
        initialView={view}
        initialDate={initialDate}
        locale={ptBrLocale}
        timeZone="local"
        height="auto"
        headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
        events={events}
        nowIndicator
        selectable
        selectMirror
        editable
        eventResizableFromStart
        slotMinTime="06:00:00"
        slotMaxTime="23:00:00"
        scrollTime="07:00:00"
        allDayText="Dia todo"
        dayMaxEvents={4}
        moreLinkText={(n) => `+${n}`}
        noEventsText="Nenhum compromisso neste período."
        datesSet={(arg: DatesSetArg) => onRange(arg.start, arg.end, arg.view.currentStart)}
        select={(arg) => onSelect(arg.start, arg.end, arg.allDay)}
        eventClick={(arg) => {
          arg.jsEvent.preventDefault();
          onOpen(arg.event.extendedProps.eventId as string);
        }}
        eventChange={onMove}
        eventDidMount={(arg) => {
          const p = arg.event.extendedProps;
          arg.el.title = [arg.event.title, p.workspace, p.location].filter(Boolean).join(" · ");
        }}
      />
    </div>
  );
}
