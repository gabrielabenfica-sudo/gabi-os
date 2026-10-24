"use client";

import * as React from "react";
import { CalendarClock, CheckSquare, GitBranch, MessageSquare, Repeat } from "lucide-react";
import { PriorityBadge } from "@/components/priority";
import { WsDot } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { dueInfo, type TaskCard as TaskCardType } from "./types";

export function TaskCardView({
  task,
  today,
  showWorkspace = false,
  dragging = false,
  onOpen,
}: {
  task: TaskCardType;
  today: string;
  showWorkspace?: boolean;
  dragging?: boolean;
  onOpen?: () => void;
}) {
  const due = dueInfo(task.dueDate, today, task.status.isDone);
  const checklistDone = task.checklist.filter((c) => c.done).length;
  return (
    <div
      className={cn(
        "group relative grid gap-2 rounded-lg border border-border bg-card p-3 text-left shadow-[0_1px_2px_rgba(55,48,57,0.05)] transition-shadow",
        dragging ? "rotate-1 shadow-lg ring-2 ring-ring/40" : "hover:shadow-md",
        task.status.isDone && "opacity-70",
      )}
    >
      {task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {task.labels.map(({ label }) => (
            <span key={label.id} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-foreground" style={{ background: `${label.color}33` }}>
              <span className="size-1.5 rounded-full" style={{ background: label.color }} aria-hidden />
              {label.name}
            </span>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={onOpen}
        className={cn("text-left text-sm font-medium leading-snug after:absolute after:inset-0 focus-visible:outline-none", task.status.isDone && "line-through")}
      >
        {task.title}
      </button>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {showWorkspace && (
          <span className="inline-flex items-center gap-1">
            <WsDot color={task.workspace.color} className="size-2" /> {task.workspace.name}
          </span>
        )}
        <PriorityBadge priority={task.priority} hideMedium />
        {due && (
          <span
            className={cn(
              "inline-flex items-center gap-1",
              due.tone === "overdue" && "font-medium text-danger",
              due.tone === "today" && "font-medium text-warning",
            )}
          >
            <CalendarClock className="size-3.5" />
            {due.tone === "overdue" ? `Atrasada · ${due.label}` : due.label}
          </span>
        )}
        {task.rrule && <Repeat className="size-3.5" aria-label="Recorrente" />}
        {task.checklist.length > 0 && (
          <span className={cn("inline-flex items-center gap-1", checklistDone === task.checklist.length && "text-success")}>
            <CheckSquare className="size-3.5" /> {checklistDone}/{task.checklist.length}
          </span>
        )}
        {task._count.subtasks > 0 && (
          <span className="inline-flex items-center gap-1">
            <GitBranch className="size-3.5" /> {task._count.subtasks}
          </span>
        )}
        {task._count.comments > 0 && (
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="size-3.5" /> {task._count.comments}
          </span>
        )}
        {task.project && <span className="truncate">{task.project.name}</span>}
        {task.assignee && (
          <span className="ml-auto grid size-6 place-items-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground" title={task.assignee}>
            {task.assignee
              .split(/\s+/)
              .slice(0, 2)
              .map((p) => p[0]?.toUpperCase())
              .join("")}
          </span>
        )}
      </div>
    </div>
  );
}
