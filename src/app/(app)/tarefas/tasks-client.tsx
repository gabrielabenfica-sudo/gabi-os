"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Columns3, GanttChart, List, Plus, Search, Settings2, UserRound, FolderKanban, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form-controls";
import { EmptyState, PageHeader, Segmented, WsDot } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import type { TaskCard, TaskMeta } from "./types";
import { KanbanBoard } from "./kanban-board";
import { TaskList } from "./task-list";
import { TaskTimeline } from "./task-timeline";
import { TaskDialog } from "./task-dialog";
import { ColumnsDialog } from "./columns-dialog";

const TaskCalendar = dynamic(() => import("./task-calendar").then((m) => m.TaskCalendar), {
  ssr: false,
  loading: () => <div className="h-[600px] animate-pulse rounded-xl bg-muted" />,
});

export type TasksView = "kanban" | "lista" | "calendario" | "linha" | "responsavel" | "projeto";

const VIEW_OPTIONS = [
  { value: "kanban" as const, label: "Kanban", icon: Columns3 },
  { value: "lista" as const, label: "Lista", icon: List },
  { value: "calendario" as const, label: "Calendário", icon: CalendarDays },
  { value: "linha" as const, label: "Linha do tempo", icon: GanttChart },
  { value: "responsavel" as const, label: "Por responsável", icon: UserRound },
  { value: "projeto" as const, label: "Por projeto", icon: FolderKanban },
];

export function TasksClient({
  view,
  boardWorkspaceId,
  globalFilter,
  tasks,
  meta,
  openTaskId,
  openNew,
}: {
  view: TasksView;
  boardWorkspaceId: string | null;
  globalFilter: string;
  tasks: TaskCard[];
  meta: TaskMeta;
  openTaskId: string | null;
  openNew: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [dialog, setDialog] = React.useState<{ mode: "edit"; taskId: string } | { mode: "new"; statusId?: string; dueDate?: string } | null>(
    openTaskId ? { mode: "edit", taskId: openTaskId } : openNew ? { mode: "new" } : null,
  );
  const [columnsOpen, setColumnsOpen] = React.useState(false);
  React.useEffect(() => {
    if (openNew) setDialog({ mode: "new" });
    else if (openTaskId) setDialog((d) => (d?.mode === "edit" && d.taskId === openTaskId ? d : { mode: "edit", taskId: openTaskId }));
  }, [openNew, openTaskId]);
  const [search, setSearch] = React.useState(params.get("q") ?? "");

  const setParams = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      next.delete("nova");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  // Busca com espera curta para não recarregar a cada tecla
  React.useEffect(() => {
    const current = params.get("q") ?? "";
    if (search === current) return;
    const t = setTimeout(() => setParams({ q: search || null }), 350);
    return () => clearTimeout(t);
  }, [search, params, setParams]);

  const openTask = (taskId: string) => {
    setDialog({ mode: "edit", taskId });
    setParams({ t: taskId });
  };
  const closeDialog = () => {
    setDialog(null);
    if (params.get("t") || params.get("nova")) setParams({ t: null });
  };

  const boardWs = meta.workspaces.find((w) => w.id === boardWorkspaceId);
  const boardStatuses = meta.statuses.filter((s) => s.workspaceId === boardWorkspaceId);
  const defaultWs = view === "kanban" ? boardWorkspaceId : globalFilter !== "all" ? globalFilter : meta.workspaces[0]?.id;
  const toggle = (key: string) => setParams({ [key]: params.get(key) === "1" ? null : "1" });
  const activeFilters = ["atrasadas", "concluidas", "arquivadas", "modelos", "projeto", "etiqueta", "resp", "prioridade", "q"].filter((k) => params.get(k));
  const visibleProjects = meta.projects.filter((p) => view !== "kanban" || p.workspaceId === boardWorkspaceId);
  const visibleLabels = meta.labels.filter((l) => view !== "kanban" || l.workspaceId === boardWorkspaceId);

  if (!meta.workspaces.length) {
    return <EmptyState icon={ListChecks} title="Sem acesso a tarefas" description="Nenhum ambiente com o módulo de tarefas liberado." />;
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Tarefas"
        description="Demandas dos três ambientes, do backlog à conclusão."
        actions={
          <>
            {view === "kanban" && (
              <Button variant="outline" onClick={() => setColumnsOpen(true)}>
                <Settings2 /> Colunas
              </Button>
            )}
            <Button onClick={() => setDialog({ mode: "new" })}>
              <Plus /> Nova tarefa
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="overflow-x-auto">
          <Segmented ariaLabel="Visualização" value={view} options={VIEW_OPTIONS} onChange={(v) => setParams({ view: v === "kanban" ? null : v, t: null })} size="sm" />
        </div>
        {view === "kanban" && meta.workspaces.length > 1 && (
          <div className="flex items-center gap-1" role="tablist" aria-label="Quadro do ambiente">
            {meta.workspaces.map((w) => (
              <button
                key={w.id}
                role="tab"
                aria-selected={w.id === boardWorkspaceId}
                onClick={() => setParams({ ws: w.id, projeto: null, etiqueta: null })}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
                  w.id === boardWorkspaceId ? "border-foreground/20 bg-card text-foreground shadow-sm" : "border-transparent text-muted-foreground hover:bg-accent",
                )}
              >
                <WsDot color={w.color} /> {w.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar tarefas…" className="pl-8" aria-label="Buscar tarefas" />
        </div>
        <FilterChip active={params.get("atrasadas") === "1"} onClick={() => toggle("atrasadas")}>Atrasadas</FilterChip>
        {view !== "kanban" && <FilterChip active={params.get("concluidas") === "1"} onClick={() => toggle("concluidas")}>Concluídas</FilterChip>}
        <FilterChip active={params.get("arquivadas") === "1"} onClick={() => toggle("arquivadas")}>Arquivadas</FilterChip>
        <FilterChip active={params.get("modelos") === "1"} onClick={() => toggle("modelos")}>Modelos</FilterChip>
        <Select aria-label="Projeto" value={params.get("projeto") ?? ""} onChange={(e) => setParams({ projeto: e.target.value })} className="w-40">
          <option value="">Todos os projetos</option>
          {visibleProjects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
        <Select aria-label="Etiqueta" value={params.get("etiqueta") ?? ""} onChange={(e) => setParams({ etiqueta: e.target.value })} className="w-36">
          <option value="">Etiquetas</option>
          {visibleLabels.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </Select>
        <Select aria-label="Responsável" value={params.get("resp") ?? ""} onChange={(e) => setParams({ resp: e.target.value })} className="w-40">
          <option value="">Responsáveis</option>
          {meta.assignees.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </Select>
        <Select aria-label="Prioridade" value={params.get("prioridade") ?? ""} onChange={(e) => setParams({ prioridade: e.target.value })} className="w-32">
          <option value="">Prioridade</option>
          <option value="URGENT">Urgente</option>
          <option value="HIGH">Alta</option>
          <option value="MEDIUM">Média</option>
          <option value="LOW">Baixa</option>
        </Select>
        {activeFilters.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setParams(Object.fromEntries(activeFilters.map((k) => [k, null])));
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      {view === "kanban" && boardWs && (
        <KanbanBoard
          key={boardWs.id}
          statuses={boardStatuses}
          tasks={tasks}
          meta={meta}
          onOpen={openTask}
          onAdd={(statusId) => setDialog({ mode: "new", statusId })}
        />
      )}
      {(view === "lista" || view === "responsavel" || view === "projeto") && (
        <TaskList
          tasks={tasks}
          meta={meta}
          groupBy={view === "responsavel" ? "assignee" : view === "projeto" ? "project" : null}
          showWorkspace={globalFilter === "all"}
          onOpen={openTask}
        />
      )}
      {view === "calendario" && <TaskCalendar tasks={tasks} meta={meta} onOpen={openTask} onCreate={(dueDate) => setDialog({ mode: "new", dueDate })} />}
      {view === "linha" && <TaskTimeline tasks={tasks} meta={meta} onOpen={openTask} />}

      {dialog && (
        <TaskDialog
          key={dialog.mode === "edit" ? dialog.taskId : "new"}
          state={dialog}
          meta={meta}
          defaultWorkspaceId={defaultWs ?? meta.workspaces[0]!.id}
          onClose={closeDialog}
          onOpenTask={openTask}
        />
      )}
      {columnsOpen && boardWs && (
        <ColumnsDialog workspace={boardWs} statuses={boardStatuses} onClose={() => setColumnsOpen(false)} />
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-9 rounded-md border px-3 text-sm transition-colors",
        active ? "border-primary/40 bg-brand-soft/40 font-medium text-foreground" : "border-input bg-card text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
