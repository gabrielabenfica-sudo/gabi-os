"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { PriorityBadge, PRIORITY_ORDER } from "@/components/priority";
import { Checkbox, EmptyState, WsDot } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { setTaskDoneAction } from "./actions";
import { dueInfo, type TaskCard, type TaskMeta } from "./types";

type SortKey = "title" | "status" | "priority" | "assignee" | "project" | "dueDate";

export function TaskList({
  tasks,
  meta,
  groupBy,
  showWorkspace,
  onOpen,
}: {
  tasks: TaskCard[];
  meta: TaskMeta;
  groupBy: "assignee" | "project" | null;
  showWorkspace: boolean;
  onOpen: (id: string) => void;
}) {
  const [sort, setSort] = React.useState<{ key: SortKey; dir: 1 | -1 }>({ key: "dueDate", dir: 1 });

  const sorted = React.useMemo(() => {
    const val = (t: TaskCard): string | number => {
      switch (sort.key) {
        case "title": return t.title.toLowerCase();
        case "status": return t.status.name;
        case "priority": return PRIORITY_ORDER[t.priority];
        case "assignee": return t.assignee?.toLowerCase() ?? "￿";
        case "project": return t.project?.name.toLowerCase() ?? "￿";
        case "dueDate": return t.dueDate ? new Date(t.dueDate).toISOString() : "￿";
      }
    };
    return [...tasks].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
  }, [tasks, sort]);

  const groups = React.useMemo(() => {
    if (!groupBy) return [{ key: "all", title: null as string | null, items: sorted }];
    const map = new Map<string, TaskCard[]>();
    for (const t of sorted) {
      const key = groupBy === "assignee" ? t.assignee ?? "" : t.project?.name ?? "";
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "pt-BR")))
      .map(([key, items]) => ({ key, title: key || (groupBy === "assignee" ? "Sem responsável" : "Sem projeto"), items }));
  }, [sorted, groupBy]);

  if (!tasks.length) {
    return <EmptyState icon={ListChecks} title="Nenhuma tarefa encontrada" description="Ajuste os filtros ou crie uma nova tarefa." />;
  }

  const Header = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={cn("px-3 py-2 text-left font-medium", className)} aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? ((-s.dir) as 1 | -1) : 1 }))}>
        {children}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  );

  return (
    <div className="grid gap-4">
      {groups.map((g) => (
        <section key={g.key} className="overflow-hidden rounded-xl border border-border bg-card">
          {g.title && (
            <h3 className="border-b border-border bg-muted/50 px-4 py-2 text-sm font-semibold">
              {g.title} <span className="font-normal text-muted-foreground">{g.items.length}</span>
            </h3>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="w-10 px-3 py-2"><span className="sr-only">Concluída</span></th>
                  <Header k="title">Tarefa</Header>
                  {showWorkspace && <th className="px-3 py-2 text-left font-medium">Ambiente</th>}
                  <Header k="status">Status</Header>
                  <Header k="priority">Prioridade</Header>
                  {groupBy !== "assignee" && <Header k="assignee">Responsável</Header>}
                  {groupBy !== "project" && <Header k="project">Projeto</Header>}
                  <Header k="dueDate">Prazo</Header>
                </tr>
              </thead>
              <tbody>
                {g.items.map((t) => (
                  <Row key={t.id} task={t} today={meta.today} showWorkspace={showWorkspace} groupBy={groupBy} onOpen={() => onOpen(t.id)} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function Row({ task, today, showWorkspace, groupBy, onOpen }: { task: TaskCard; today: string; showWorkspace: boolean; groupBy: string | null; onOpen: () => void }) {
  const [done, setDone] = React.useState(task.status.isDone);
  const [pending, startTransition] = React.useTransition();
  React.useEffect(() => setDone(task.status.isDone), [task.status.isDone]);
  const due = dueInfo(task.dueDate, today, done);

  return (
    <tr className="border-b border-border last:border-0 hover:bg-accent/40">
      <td className="px-3 py-2">
        <Checkbox
          checked={done}
          disabled={pending || task.isTemplate}
          aria-label={done ? `Reabrir ${task.title}` : `Concluir ${task.title}`}
          onChange={(e) => {
            const value = e.target.checked;
            setDone(value);
            startTransition(async () => {
              const r = await setTaskDoneAction(task.id, value);
              if (!r.ok) {
                setDone(!value);
                toast.error(r.error);
              } else toast.success(r.message);
            });
          }}
        />
      </td>
      <td className="max-w-80 px-3 py-2">
        <button type="button" onClick={onOpen} className={cn("text-left font-medium hover:underline", done && "text-muted-foreground line-through")}>
          {task.title}
        </button>
        {task.archivedAt && <span className="ml-2 text-xs text-muted-foreground">(arquivada)</span>}
      </td>
      {showWorkspace && (
        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><WsDot color={task.workspace.color} /> {task.workspace.name}</span>
        </td>
      )}
      <td className="whitespace-nowrap px-3 py-2">{task.status.name}</td>
      <td className="px-3 py-2"><PriorityBadge priority={task.priority} /></td>
      {groupBy !== "assignee" && <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{task.assignee ?? "—"}</td>}
      {groupBy !== "project" && <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{task.project?.name ?? "—"}</td>}
      <td className={cn("whitespace-nowrap px-3 py-2 tabular", due?.tone === "overdue" ? "font-medium text-danger" : due?.tone === "today" ? "font-medium text-warning" : "text-muted-foreground")}>
        {due ? (due.tone === "overdue" ? `Atrasada · ${due.label}` : due.label) : "—"}
      </td>
    </tr>
  );
}
