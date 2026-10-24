"use client";

import * as React from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import ptBrLocale from "@fullcalendar/core/locales/pt-br";
import type { EventDropArg } from "@fullcalendar/core";
import { toast } from "sonner";
import { updateTaskAction } from "./actions";
import type { TaskCard, TaskMeta } from "./types";

/** Tarefas por prazo no calendário mensal. Arrastar muda o prazo. */
export function TaskCalendar({
  tasks,
  meta,
  onOpen,
  onCreate,
}: {
  tasks: TaskCard[];
  meta: TaskMeta;
  onOpen: (id: string) => void;
  onCreate: (dueDate: string) => void;
}) {
  const events = React.useMemo(
    () =>
      tasks
        .filter((t) => t.dueDate)
        .map((t) => {
          const ymd = new Date(t.dueDate!).toISOString().slice(0, 10);
          const overdue = !t.status.isDone && ymd < meta.today;
          return {
            id: t.id,
            title: t.title,
            start: ymd,
            allDay: true,
            backgroundColor: t.status.isDone ? "transparent" : overdue ? "var(--danger-soft)" : `${t.workspace.color}26`,
            borderColor: overdue ? "var(--danger)" : t.workspace.color,
            textColor: "var(--foreground)",
            classNames: t.status.isDone ? ["line-through", "opacity-60"] : [],
          };
        }),
    [tasks, meta.today],
  );

  const onDrop = async (info: EventDropArg) => {
    const dueDate = info.event.startStr.slice(0, 10);
    const r = await updateTaskAction(info.event.id, { dueDate });
    if (!r.ok) {
      toast.error(r.error);
      info.revert();
    } else toast.success("Prazo atualizado.");
  };

  return (
    <div className="gabi-calendar rounded-xl border border-border bg-card p-3">
      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        locale={ptBrLocale}
        timeZone="UTC"
        height="auto"
        headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
        events={events}
        editable
        eventDurationEditable={false}
        eventDrop={onDrop}
        eventClick={(info) => {
          info.jsEvent.preventDefault();
          onOpen(info.event.id);
        }}
        dateClick={(info) => onCreate(info.dateStr)}
        dayMaxEvents={4}
        moreLinkText={(n) => `+${n}`}
      />
    </div>
  );
}
