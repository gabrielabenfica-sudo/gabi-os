"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, GanttChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { addDaysYmd, startOfWeekYmd } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { TaskCard, TaskMeta } from "./types";

const WEEKS = 6;
const DAY_PX = 22;

/** Linha do tempo: barras do início ao prazo, em janelas de 6 semanas. */
export function TaskTimeline({ tasks, meta, onOpen }: { tasks: TaskCard[]; meta: TaskMeta; onOpen: (id: string) => void }) {
  const [start, setStart] = React.useState(() => addDaysYmd(startOfWeekYmd(meta.today), -7));
  const end = addDaysYmd(start, WEEKS * 7 - 1);
  const days = Array.from({ length: WEEKS * 7 }, (_, i) => addDaysYmd(start, i));

  const rows = tasks
    .map((t) => {
      const s = t.startDate ? new Date(t.startDate).toISOString().slice(0, 10) : null;
      const d = t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : null;
      const from = s ?? d;
      const to = d ?? s;
      return from && to ? { task: t, from, to } : null;
    })
    .filter((r): r is { task: TaskCard; from: string; to: string } => Boolean(r && r.to >= start && r.from <= end))
    .sort((a, b) => a.from.localeCompare(b.from));

  const undated = tasks.filter((t) => !t.startDate && !t.dueDate).length;
  const indexOf = (ymd: string) => Math.max(0, Math.min(days.length - 1, days.findIndex((d) => d >= ymd) === -1 ? days.length - 1 : days.findIndex((d) => d >= ymd)));

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setStart(addDaysYmd(start, -14))} aria-label="Semanas anteriores"><ChevronLeft /></Button>
        <Button variant="outline" size="sm" onClick={() => setStart(addDaysYmd(startOfWeekYmd(meta.today), -7))}>Hoje</Button>
        <Button variant="outline" size="icon" onClick={() => setStart(addDaysYmd(start, 14))} aria-label="Próximas semanas"><ChevronRight /></Button>
        <span className="text-sm text-muted-foreground">
          {start.slice(8, 10)}/{start.slice(5, 7)} – {end.slice(8, 10)}/{end.slice(5, 7)}/{end.slice(0, 4)}
        </span>
        {undated > 0 && <span className="ml-auto text-xs text-muted-foreground">{undated} tarefa(s) sem datas não aparecem aqui</span>}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={GanttChart} title="Nada neste período" description="Tarefas com data de início ou prazo aparecem aqui." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <div style={{ width: 260 + days.length * DAY_PX }}>
            <div className="sticky top-0 flex border-b border-border bg-muted/50 text-[10px] text-muted-foreground">
              <div className="w-[260px] shrink-0 px-3 py-2 text-xs font-medium">Tarefa</div>
              {days.map((d) => (
                <div
                  key={d}
                  style={{ width: DAY_PX }}
                  className={cn("shrink-0 py-2 text-center", d === meta.today && "font-bold text-primary", new Date(`${d}T12:00:00Z`).getUTCDay() === 1 && "border-l border-border")}
                  title={d}
                >
                  {d.slice(8, 10)}
                </div>
              ))}
            </div>
            {rows.map(({ task, from, to }) => {
              const a = indexOf(from);
              const b = indexOf(to);
              const overdue = !task.status.isDone && to < meta.today;
              return (
                <div key={task.id} className="flex items-center border-b border-border last:border-0 hover:bg-accent/30">
                  <button type="button" onClick={() => onOpen(task.id)} className="w-[260px] shrink-0 truncate px-3 py-2 text-left text-sm hover:underline">
                    {task.title}
                  </button>
                  <div className="relative h-9" style={{ width: days.length * DAY_PX }}>
                    {days.includes(meta.today) && (
                      <span
                        className="absolute top-0 h-full border-l border-dashed border-primary/50"
                        style={{ left: days.indexOf(meta.today) * DAY_PX + DAY_PX / 2 }}
                        aria-hidden
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => onOpen(task.id)}
                      title={`${task.title} (${from.split("-").reverse().join("/")} → ${to.split("-").reverse().join("/")})`}
                      className={cn("absolute top-2 h-5 rounded-md text-left", task.status.isDone && "opacity-50")}
                      style={{
                        left: a * DAY_PX + 2,
                        width: Math.max(1, b - a + 1) * DAY_PX - 4,
                        background: overdue ? "var(--danger)" : task.workspace.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
