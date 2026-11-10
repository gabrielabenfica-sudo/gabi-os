import { useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, Circle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useWorkspace } from "@/lib/workspace";
import { useTaskLabels, useTaskStatuses, useTasks } from "@/lib/queries";
import { useCreateTask, useDeleteTask, useMoveCards, useSaveTask } from "@/lib/mutations";
import { dropPositions, topPosition } from "@/lib/kanban";
import { CardMenu, ConfirmDelete, DropColumn, draggableCard } from "@/components/common/kanban";
import { toast } from "sonner";
import { formatShortDate, PRIORITY_META, rruleLabel } from "@/lib/format";
import { PageHeader, WorkspaceDot } from "@/components/common/page-parts";
import type { Task } from "@/lib/types";

type TaskForm = {
  id?: string;
  title: string;
  description: string;
  status_id: string;
  priority: string;
  due_date: string;
  estimate_minutes: string;
};

export default function Tarefas() {
  const { active, workspaces } = useWorkspace();
  const { data: tasks = [] } = useTasks();
  const { data: statuses = [] } = useTaskStatuses();
  const { data: labels = [] } = useTaskLabels();
  const createTask = useCreateTask();
  const saveTask = useSaveTask();
  const deleteTask = useDeleteTask();
  const moveCards = useMoveCards("tasks", "tasks");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<TaskForm | null>(null);

  const workspace = active ?? workspaces[0] ?? null;
  const workspaceStatuses = useMemo(
    () => statuses.filter((status) => status.workspace_id === workspace?.id),
    [statuses, workspace],
  );
  const workspaceTasks = useMemo(
    () => tasks.filter((task) => task.workspace_id === workspace?.id),
    [tasks, workspace],
  );
  const workspaceLabels = labels.filter((label) => label.workspace_id === workspace?.id);

  const openNew = () => {
    setForm({
      title: "",
      description: "",
      status_id: workspaceStatuses.find((status) => status.category === "TODO")?.id ?? workspaceStatuses[0]?.id ?? "",
      priority: "MEDIUM",
      due_date: "",
      estimate_minutes: "",
    });
    setOpen(true);
  };

  const openEdit = (task: Task) => {
    setForm({
      id: task.id,
      title: task.title,
      description: task.description ?? "",
      status_id: task.status_id ?? "",
      priority: task.priority ?? "MEDIUM",
      due_date: task.due_date ?? "",
      estimate_minutes: task.estimate_minutes ? String(task.estimate_minutes) : "",
    });
    setOpen(true);
  };

  const submit = () => {
    if (!form || !workspace || !form.title.trim()) return;
    const doneStatus = workspaceStatuses.find((status) => status.is_done);
    const values = {
      title: form.title.trim(),
      description: form.description || null,
      status_id: form.status_id || null,
      priority: form.priority,
      due_date: form.due_date || null,
      estimate_minutes: form.estimate_minutes ? Number(form.estimate_minutes) : null,
      workspace_id: workspace.id,
      completed_at: form.status_id === doneStatus?.id ? new Date().toISOString() : null,
    };
    const onError = (error: unknown) =>
      toast.error(`Não foi possível salvar a tarefa. ${error instanceof Error ? error.message : ""}`);
    if (form.id) {
      const current = workspaceTasks.find((task) => task.id === form.id);
      saveTask.mutate(
        {
          id: form.id,
          // Mantém a data de início que já existia (ex.: data de gravação vinda da planilha)
          values: { ...values, start_date: current?.start_date ?? (form.due_date || null) },
        },
        { onSuccess: () => setOpen(false), onError },
      );
    } else {
      createTask.mutate(
        { ...values, start_date: form.due_date || null, position: topPosition(columnOf(form.status_id)) },
        { onSuccess: () => setOpen(false), onError },
      );
    }
  };

  const columnOf = (statusId: string | null) =>
    workspaceTasks.filter((task) => task.status_id === statusId).sort((a, b) => b.position - a.position);

  /** Solta a tarefa na coluna `statusId`, na posição `index` (0 = topo). */
  const moveTask = (taskId: string, statusId: string, index = 0) => {
    const task = workspaceTasks.find((item) => item.id === taskId);
    if (!task) return;
    const positions = dropPositions(columnOf(statusId), taskId, index, task);
    const updates = positions.map((item) => ({ id: item.id, values: { position: item.position } as Record<string, unknown> }));
    if (statusId !== task.status_id) {
      const target = workspaceStatuses.find((status) => status.id === statusId);
      const from = workspaceStatuses.find((status) => status.id === task.status_id);
      const moved = updates.find((item) => item.id === taskId);
      if (moved) {
        Object.assign(moved.values, {
          status_id: statusId,
          completed_at: target?.is_done ? task.completed_at ?? new Date().toISOString() : null,
          history: [
            ...(task.history ?? []),
            { field: "status", from: from?.name ?? null, to: target?.name ?? null, at: new Date().toISOString() },
          ],
        });
      }
    } else if (updates.length === 1 && updates[0].values.position === task.position) {
      return; // soltou no mesmo lugar
    }
    moveCards.mutate(updates, {
      onError: (error) => toast.error(`Não foi possível mover a tarefa. ${error instanceof Error ? error.message : ""}`),
    });
  };

  const removeTask = (id: string) =>
    deleteTask.mutate(id, {
      onSuccess: () => {
        setOpen(false);
        toast.success("Tarefa excluída.");
      },
      onError: (error) => toast.error(`Não foi possível excluir. ${error instanceof Error ? error.message : ""}`),
    });

  const toggleDone = (task: Task) => {
    const done = workspaceStatuses.find((status) => status.is_done);
    const todo = workspaceStatuses.find((status) => status.category === "TODO") ?? workspaceStatuses[0];
    if (!done) return;
    saveTask.mutate({
      id: task.id,
      values: task.completed_at
        ? { status_id: todo?.id ?? null, completed_at: null }
        : { status_id: done.id, completed_at: new Date().toISOString() },
    });
  };

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Tarefas"
        title={workspace ? `${workspace.name}` : "Tarefas"}
        description="Cada área tem seu próprio fluxo. Arraste os cards entre as colunas (ou use o menu ⋯ do card), edite e exclua."
        actions={
          <Button onClick={openNew}>
            <Plus className="size-4" /> Nova tarefa
          </Button>
        }
      />

      {!workspaceStatuses.length ? (
        <p className="text-sm text-muted-foreground">Nenhum fluxo configurado nesta área.</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-thin">
          {workspaceStatuses.map((status) => {
            const columnTasks = workspaceTasks
              .filter((task) => task.status_id === status.id)
              .sort((a, b) => b.position - a.position);
            return (
              <div key={status.id} className="flex w-[286px] shrink-0 flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {status.name}
                    </p>
                    <span className="rounded-full bg-secondary px-1.5 text-[10px] tabular-nums text-muted-foreground">
                      {columnTasks.length}
                    </span>
                  </div>
                  {status.is_done ? <CheckCircle2 className="size-3.5 text-primary" /> : null}
                </div>

                <DropColumn
                  columnId={status.id}
                  onDropCard={moveTask}
                  className="min-h-[120px] space-y-2 rounded-2xl border border-border/50 bg-secondary/25 p-2"
                >
                  {columnTasks.map((task) => {
                    const priority = PRIORITY_META[task.priority ?? "MEDIUM"] ?? PRIORITY_META.MEDIUM;
                    const taskLabels = workspaceLabels.filter((label) =>
                      (task.label_ids ?? []).includes(label.id),
                    );
                    return (
                      <Card
                        key={task.id}
                        {...draggableCard(task.id)}
                        className="cursor-grab border-border/70 p-3 shadow-sm transition hover:border-primary/40 hover:shadow-card active:cursor-grabbing"
                        onClick={() => openEdit(task)}
                      >
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            aria-label="Concluir"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleDone(task);
                            }}
                            className="mt-0.5 text-muted-foreground transition hover:text-primary"
                          >
                            {task.completed_at ? (
                              <CheckCircle2 className="size-4 text-primary" />
                            ) : (
                              <Circle className="size-4" />
                            )}
                          </button>
                          <p
                            className={cn(
                              "flex-1 text-sm leading-snug",
                              task.completed_at ? "text-muted-foreground line-through" : "text-foreground",
                            )}
                          >
                            {task.title}
                          </p>
                          <CardMenu
                            title={task.title}
                            columns={workspaceStatuses}
                            currentColumnId={task.status_id}
                            onMove={(statusId) => moveTask(task.id, statusId, 0)}
                            onDelete={() => removeTask(task.id)}
                          />
                        </div>

                        {taskLabels.length ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {taskLabels.map((label) => (
                              <span
                                key={label.id}
                                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                                style={{
                                  backgroundColor: `${label.color ?? "#A66F7C"}1a`,
                                  color: label.color ?? "#A66F7C",
                                }}
                              >
                                {label.name}
                              </span>
                            ))}
                          </div>
                        ) : null}

                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className={cn("text-[10px]", priority.className)}>
                            {priority.label}
                          </Badge>
                          {task.due_date ? (
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <CalendarClock className="size-3" />
                              {formatShortDate(task.due_date)}
                            </span>
                          ) : null}
                          {task.estimate_minutes ? (
                            <span className="text-[10px] text-muted-foreground">
                              {task.estimate_minutes} min
                            </span>
                          ) : null}
                          {task.rrule ? (
                            <span className="rounded-full bg-secondary px-1.5 text-[10px] text-muted-foreground">
                              {rruleLabel(task.rrule)}
                            </span>
                          ) : null}
                        </div>
                      </Card>
                    );
                  })}
                  {columnTasks.length === 0 ? (
                    <p className="px-2 py-6 text-center text-[11px] text-muted-foreground">solte aqui</p>
                  ) : null}
                </DropColumn>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <WorkspaceDot color={workspace?.color} />
          {workspaceTasks.length} tarefas nesta área
        </span>
        <span>·</span>
        <span>{workspaceTasks.filter((task) => task.completed_at).length} concluídas</span>
        <span>·</span>
        <span>{workspaceTasks.filter((task) => !task.completed_at).length} em aberto</span>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
            <DialogDescription>
              {workspace ? `Dentro de ${workspace.name}.` : "Escolha uma área na barra lateral."}
            </DialogDescription>
          </DialogHeader>

          {form ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="task-title">Título</Label>
                <Input
                  id="task-title"
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  placeholder="O que precisa ser feito?"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="task-description">Descrição</Label>
                <Textarea
                  id="task-description"
                  rows={2}
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="Contexto, combinados, links…"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Etapa</Label>
                  <Select
                    value={form.status_id}
                    onValueChange={(value) => setForm({ ...form, status_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Etapa" />
                    </SelectTrigger>
                    <SelectContent>
                      {workspaceStatuses.map((status) => (
                        <SelectItem key={status.id} value={status.id}>
                          {status.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="task-date">Data</Label>
                  <Input
                    id="task-date"
                    type="date"
                    value={form.due_date}
                    onChange={(event) => setForm({ ...form, due_date: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="task-estimate">Estimativa (min)</Label>
                  <Input
                    id="task-estimate"
                    type="number"
                    min={0}
                    value={form.estimate_minutes}
                    onChange={(event) => setForm({ ...form, estimate_minutes: event.target.value })}
                  />
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:justify-between">
            {form?.id ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-4" /> Excluir
              </Button>
            ) : (
              <span />
            )}
            <Button type="button" onClick={submit}>
              {form?.id ? "Salvar" : "Criar tarefa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDelete
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={form?.title || "tarefa"}
        onConfirm={() => form?.id && removeTask(form.id)}
      />
    </div>
  );
}
