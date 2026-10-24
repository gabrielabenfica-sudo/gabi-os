"use client";

import * as React from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { TaskCardView } from "./task-card";
import { moveTaskAction } from "./actions";
import type { StatusOption, TaskCard, TaskMeta } from "./types";

type Columns = Record<string, string[]>;

function buildColumns(statuses: StatusOption[], tasks: TaskCard[]): Columns {
  const cols: Columns = Object.fromEntries(statuses.map((s) => [s.id, [] as string[]]));
  for (const t of tasks) cols[t.statusId]?.push(t.id);
  return cols;
}

export function KanbanBoard({
  statuses,
  tasks,
  meta,
  onOpen,
  onAdd,
}: {
  statuses: StatusOption[];
  tasks: TaskCard[];
  meta: TaskMeta;
  onOpen: (taskId: string) => void;
  onAdd: (statusId: string) => void;
}) {
  const router = useRouter();
  const byId = React.useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const [columns, setColumns] = React.useState<Columns>(() => buildColumns(statuses, tasks));
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const dragOrigin = React.useRef<Columns | null>(null);

  // Sincroniza quando o servidor devolve dados novos (fora de um arraste)
  React.useEffect(() => {
    if (!activeId) setColumns(buildColumns(statuses, tasks));
  }, [statuses, tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findColumn = (id: string) => (id in columns ? id : Object.keys(columns).find((c) => columns[c]!.includes(id)));

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    dragOrigin.current = columns;
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = findColumn(String(active.id));
    const to = findColumn(String(over.id));
    if (!from || !to || from === to) return;
    setColumns((prev) => {
      const fromItems = prev[from]!.filter((id) => id !== active.id);
      const toItems = [...prev[to]!];
      const overIndex = toItems.indexOf(String(over.id));
      const index = overIndex >= 0 ? overIndex : toItems.length;
      toItems.splice(index, 0, String(active.id));
      return { ...prev, [from]: fromItems, [to]: toItems };
    });
  };

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    const taskId = String(active.id);
    setActiveId(null);
    if (!over) {
      if (dragOrigin.current) setColumns(dragOrigin.current);
      return;
    }
    const col = findColumn(taskId);
    const overCol = findColumn(String(over.id));
    if (!col || !overCol) return;
    let next = columns;
    if (col === overCol) {
      const items = columns[col]!;
      const oldIndex = items.indexOf(taskId);
      const newIndex = over.id in columns ? items.length - 1 : items.indexOf(String(over.id));
      if (oldIndex !== newIndex && newIndex >= 0) {
        next = { ...columns, [col]: arrayMove(items, oldIndex, newIndex) };
        setColumns(next);
      }
    }
    const index = next[col]!.indexOf(taskId);
    const origin = dragOrigin.current;
    const originCol = origin ? Object.keys(origin).find((c) => origin[c]!.includes(taskId)) : undefined;
    if (originCol === col && origin?.[col]!.indexOf(taskId) === index) return;

    const result = await moveTaskAction(taskId, col, index);
    if (!result.ok) {
      toast.error(result.error);
      if (origin) setColumns(origin);
      router.refresh();
    }
  };

  const active = activeId ? byId.get(activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        if (dragOrigin.current) setColumns(dragOrigin.current);
      }}
      accessibility={{
        screenReaderInstructions: { draggable: "Pressione espaço para pegar o cartão, use as setas para mover e espaço novamente para soltar." },
      }}
    >
      <div className="flex gap-3 overflow-x-auto pb-3" data-testid="kanban">
        {statuses.map((status) => (
          <Column
            key={status.id}
            status={status}
            ids={columns[status.id] ?? []}
            byId={byId}
            today={meta.today}
            onOpen={onOpen}
            onAdd={() => onAdd(status.id)}
          />
        ))}
      </div>
      <DragOverlay>{active ? <TaskCardView task={active} today={meta.today} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  ids,
  byId,
  today,
  onOpen,
  onAdd,
}: {
  status: StatusOption;
  ids: string[];
  byId: Map<string, TaskCard>;
  today: string;
  onOpen: (id: string) => void;
  onAdd: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id });
  return (
    <section
      aria-label={status.name}
      data-column={status.name}
      className={cn("flex w-72 shrink-0 flex-col rounded-xl bg-muted/70 p-2", isOver && "ring-2 ring-ring/30")}
    >
      <header className="flex items-center justify-between px-1.5 pb-2 pt-1">
        <h3 className="text-sm font-semibold">
          {status.name} <span className="ml-1 font-normal text-muted-foreground">{ids.length}</span>
        </h3>
        <button type="button" onClick={onAdd} className="rounded p-1 text-muted-foreground hover:bg-card hover:text-foreground" aria-label={`Nova tarefa em ${status.name}`}>
          <Plus className="size-4" />
        </button>
      </header>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex min-h-24 flex-1 flex-col gap-2">
          {ids.map((id) => {
            const task = byId.get(id);
            return task ? <SortableCard key={id} task={task} today={today} onOpen={() => onOpen(id)} /> : null;
          })}
          {ids.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">Arraste cartões para cá</p>}
        </div>
      </SortableContext>
    </section>
  );
}

function SortableCard({ task, today, onOpen }: { task: TaskCard; today: string; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative touch-none", isDragging && "opacity-40")}
      data-task-title={task.title}
      {...attributes}
      {...listeners}
    >
      <TaskCardView task={task} today={today} onOpen={onOpen} />
    </div>
  );
}
