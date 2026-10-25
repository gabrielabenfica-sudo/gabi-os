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
import { cn } from "@/lib/utils";

type Columns = Record<string, string[]>;
export type KanbanColumn = { id: string; name: string; footer?: React.ReactNode; tone?: "won" | "lost" | "done" };

function build<T extends { id: string }>(columns: KanbanColumn[], items: T[], columnOf: (i: T) => string): Columns {
  const cols: Columns = Object.fromEntries(columns.map((c) => [c.id, [] as string[]]));
  for (const i of items) cols[columnOf(i)]?.push(i.id);
  return cols;
}

/**
 * Quadro Kanban genérico com arrastar e soltar (mouse, toque e teclado).
 * `onMove` recebe a coluna e o índice finais; se falhar, o quadro volta ao estado anterior.
 */
export function Kanban<T extends { id: string }>({
  columns,
  items,
  columnOf,
  renderCard,
  onMove,
  onOpen,
  onAdd,
  addLabel = "Adicionar",
  itemLabel,
  testId = "kanban",
}: {
  columns: KanbanColumn[];
  items: T[];
  columnOf: (item: T) => string;
  renderCard: (item: T, opts: { dragging?: boolean }) => React.ReactNode;
  onMove: (itemId: string, columnId: string, index: number) => Promise<boolean>;
  onOpen: (itemId: string) => void;
  onAdd?: (columnId: string) => void;
  addLabel?: string;
  itemLabel: (item: T) => string;
  testId?: string;
}) {
  const byId = React.useMemo(() => new Map(items.map((t) => [t.id, t])), [items]);
  const [state, setState] = React.useState<Columns>(() => build(columns, items, columnOf));
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const origin = React.useRef<Columns | null>(null);
  const lastDragEnd = React.useRef(0);

  React.useEffect(() => {
    if (!activeId) setState(build(columns, items, columnOf));
  }, [columns, items]); // eslint-disable-line react-hooks/exhaustive-deps

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const findColumn = (id: string) => (id in state ? id : Object.keys(state).find((c) => state[c]!.includes(id)));

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    origin.current = state;
  };
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = findColumn(String(active.id));
    const to = findColumn(String(over.id));
    if (!from || !to || from === to) return;
    setState((prev) => {
      const fromItems = prev[from]!.filter((id) => id !== active.id);
      const toItems = [...prev[to]!];
      const overIndex = toItems.indexOf(String(over.id));
      toItems.splice(overIndex >= 0 ? overIndex : toItems.length, 0, String(active.id));
      return { ...prev, [from]: fromItems, [to]: toItems };
    });
  };
  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    const id = String(active.id);
    lastDragEnd.current = Date.now();
    setActiveId(null);
    const before = origin.current;
    if (!over) {
      if (before) setState(before);
      return;
    }
    const col = findColumn(id);
    const overCol = findColumn(String(over.id));
    if (!col || !overCol) return;
    let next = state;
    if (col === overCol) {
      const list = state[col]!;
      const oldIndex = list.indexOf(id);
      const newIndex = over.id in state ? list.length - 1 : list.indexOf(String(over.id));
      if (oldIndex !== newIndex && newIndex >= 0) {
        next = { ...state, [col]: arrayMove(list, oldIndex, newIndex) };
        setState(next);
      }
    }
    const index = next[col]!.indexOf(id);
    const originCol = before ? Object.keys(before).find((c) => before[c]!.includes(id)) : undefined;
    if (originCol === col && before?.[col]!.indexOf(id) === index) return;
    const ok = await onMove(id, col, index);
    if (!ok && before) setState(before);
  };

  const open = (id: string) => {
    if (Date.now() - lastDragEnd.current < 400) return;
    onOpen(id);
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
        lastDragEnd.current = Date.now();
        setActiveId(null);
        if (origin.current) setState(origin.current);
      }}
      accessibility={{ screenReaderInstructions: { draggable: "Pressione espaço para pegar o cartão, use as setas para mover e espaço novamente para soltar." } }}
    >
      <div className="flex gap-3 overflow-x-auto pb-3" data-testid={testId}>
        {columns.map((c) => (
          <Column key={c.id} column={c} ids={state[c.id] ?? []} byId={byId} renderCard={renderCard} onOpen={open} onAdd={onAdd} addLabel={addLabel} itemLabel={itemLabel} />
        ))}
      </div>
      <DragOverlay>{active ? renderCard(active, { dragging: true }) : null}</DragOverlay>
    </DndContext>
  );
}

function Column<T extends { id: string }>({
  column,
  ids,
  byId,
  renderCard,
  onOpen,
  onAdd,
  addLabel,
  itemLabel,
}: {
  column: KanbanColumn;
  ids: string[];
  byId: Map<string, T>;
  renderCard: (item: T, opts: { dragging?: boolean }) => React.ReactNode;
  onOpen: (id: string) => void;
  onAdd?: (columnId: string) => void;
  addLabel: string;
  itemLabel: (item: T) => string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <section
      aria-label={column.name}
      data-column={column.name}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl bg-muted/70 p-2",
        column.tone === "won" && "bg-success-soft/40",
        column.tone === "lost" && "bg-muted/40",
        isOver && "ring-2 ring-ring/30",
      )}
    >
      <header className="flex items-center justify-between px-1.5 pb-2 pt-1">
        <h3 className="text-sm font-semibold">
          {column.name} <span className="ml-1 font-normal text-muted-foreground">{ids.length}</span>
        </h3>
        {onAdd && (
          <button type="button" onClick={() => onAdd(column.id)} className="rounded p-1 text-muted-foreground hover:bg-card hover:text-foreground" aria-label={`${addLabel} em ${column.name}`}>
            <Plus className="size-4" />
          </button>
        )}
      </header>
      {column.footer && <div className="px-1.5 pb-2 text-xs text-muted-foreground">{column.footer}</div>}
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex min-h-24 flex-1 flex-col gap-2">
          {ids.map((id) => {
            const item = byId.get(id);
            return item ? <SortableCard key={id} id={id} label={itemLabel(item)} onOpen={() => onOpen(id)}>{renderCard(item, {})}</SortableCard> : null;
          })}
          {ids.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">Arraste cartões para cá</p>}
        </div>
      </SortableContext>
    </section>
  );
}

function SortableCard({ id, label, onOpen, children }: { id: string; label: string; onOpen: () => void; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative touch-none", isDragging && "opacity-40")}
      data-card={label}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e);
        if (e.key === "Enter") onOpen();
      }}
    >
      {children}
    </div>
  );
}
