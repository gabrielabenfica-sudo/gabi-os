import { useMemo } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  Circle,
  ListChecks,
  Repeat,
  Sparkles,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useWorkspace, useWorkspaceMap } from "@/lib/workspace";
import {
  useContentItems,
  useEvents,
  useGoals,
  useHabitEntries,
  useHabits,
  useProfile,
  useRoutineBlocks,
  useRoutineLogs,
  useTaskStatuses,
  useTasks,
} from "@/lib/queries";
import { useSaveTask, useToggleHabitEntry, useToggleRoutineLog } from "@/lib/mutations";
import {
  adherence,
  blocksForDate,
  currentAndNext,
  greeting,
  logKey,
  logsMap,
  longToday,
} from "@/lib/routine";
import { dateInZone, formatDate, formatTimeZoned, todayISO } from "@/lib/format";
import { PageHeader, StatCard, WorkspaceDot } from "@/components/common/page-parts";

export default function Hoje() {
  const { user } = useAuth();
  const { active, workspaces } = useWorkspace();
  const workspaceMap = useWorkspaceMap(workspaces);
  const { data: profile } = useProfile();
  const { data: blocks = [] } = useRoutineBlocks();
  const { data: logs = [] } = useRoutineLogs();
  const { data: tasks = [] } = useTasks();
  const { data: statuses = [] } = useTaskStatuses();
  const { data: events = [] } = useEvents();
  const { data: habits = [] } = useHabits();
  const { data: habitEntries = [] } = useHabitEntries();
  const { data: goals = [] } = useGoals();
  const { data: content = [] } = useContentItems();

  const toggleRoutine = useToggleRoutineLog();
  const toggleHabit = useToggleHabitEntry();
  const saveTask = useSaveTask();

  const today = todayISO();
  const todayBlocks = useMemo(() => blocksForDate(blocks, today), [blocks, today]);
  const todayEvents = useMemo(
    () => events.filter((event) => dateInZone(event.start_at) === today),
    [events, today],
  );
  const openTasks = tasks.filter((task) => !task.completed_at);
  const todayTasks = openTasks.filter((task) => task.due_date === today || task.start_date === today);
  const logMap = logsMap(logs);
  const progress = adherence(blocks, logs, today);
  const { current, next } = currentAndNext(blocks);
  const doneToday = todayBlocks.filter((block) => logMap.get(logKey(block.id, today))).length;
  const activeHabits = habits.filter((habit) => habit.active);
  const habitsDone = activeHabits.filter((habit) =>
    habitEntries.some(
      (entry) => entry.habit_id === habit.id && entry.entry_date === today && entry.done,
    ),
  ).length;
  const name = (profile?.name || user?.email?.split("@")[0] || "Gabi").split("@")[0];
  const firstName = name.split(" ")[0];

  const doneStatusFor = (workspaceId: string) =>
    statuses.find((status) => status.workspace_id === workspaceId && status.is_done)?.id ?? null;

  const startStatusFor = (workspaceId: string) =>
    statuses.find((status) => status.workspace_id === workspaceId && status.category === "TODO")?.id ??
    null;

  const toggleTask = (task: (typeof tasks)[number]) => {
    const doneId = doneStatusFor(task.workspace_id);
    if (!doneId) return;
    saveTask.mutate({
      id: task.id,
      values: task.completed_at
        ? { status_id: startStatusFor(task.workspace_id), completed_at: null }
        : { status_id: doneId, completed_at: new Date().toISOString() },
    });
  };

  const nextContent = content
    .filter((item) => item.publish_date && item.publish_date.slice(0, 10) >= today)
    .sort((a, b) => (a.publish_date ?? "").localeCompare(b.publish_date ?? ""))[0];

  const activeGoals = goals
    .filter((goal) => goal.status === "ACTIVE" && !goal.is_objective)
    .slice(0, 3);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={longToday()}
        title={`${greeting()}, ${firstName}`}
        description={
          active
            ? `Você está em ${active.name}. O dia está desenhado abaixo — ajuste o que precisar.`
            : "Seu dia, sua rotina e seus projetos em um só lugar."
        }
        actions={
          <Button asChild variant="outline">
            <Link to="/rotina">
              <Repeat className="size-4" /> Ver rotina
            </Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Rotina de hoje"
          value={`${doneToday}/${todayBlocks.length}`}
          hint={`${progress}% do dia cumprido`}
          icon={<Repeat className="size-4" />}
          accent
        />
        <StatCard
          label="Tarefas abertas"
          value={openTasks.length}
          hint={`${todayTasks.length} para hoje`}
          icon={<ListChecks className="size-4" />}
        />
        <StatCard
          label="Hábitos"
          value={`${habitsDone}/${activeHabits.length}`}
          hint={habitsDone === activeHabits.length && activeHabits.length > 0 ? "todos marcados" : "marcação do dia"}
          icon={<Sparkles className="size-4" />}
        />
        <StatCard
          label="Na agenda hoje"
          value={todayEvents.length}
          hint={todayEvents.length ? "compromissos de hoje" : "dia livre"}
          icon={<CalendarDays className="size-4" />}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-5">
          <Card className="border-border/70 shadow-card">
            <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
              <div>
                <CardTitle className="font-display text-lg">Rotina de hoje</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {current
                    ? `Agora: ${current.title} · até ${current.end_time.slice(0, 5)}`
                    : next
                      ? `Próximo: ${next.title} às ${next.start_time.slice(0, 5)}`
                      : "Nenhum bloco ativo neste horário"}
                </p>
              </div>
              <Button asChild size="sm" variant="ghost">
                <Link to="/rotina">
                  Abrir <ArrowUpRight className="size-3.5" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress value={progress} className="h-1.5" />
              {todayBlocks.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">
                  Nenhum bloco para hoje. Monte sua rotina na área Rotina.
                </p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {todayBlocks.map((block) => {
                    const done = Boolean(logMap.get(logKey(block.id, today)));
                    const isCurrent = current?.id === block.id;
                    return (
                      <li key={block.id} className="flex items-center gap-3 py-2.5">
                        <button
                          type="button"
                          aria-label={done ? "Desmarcar" : "Marcar como feito"}
                          onClick={() =>
                            toggleRoutine.mutate({ blockId: block.id, date: today, done: !done })
                          }
                          className={cn(
                            "flex size-5 shrink-0 items-center justify-center rounded-full border transition",
                            done
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border text-transparent hover:border-primary/60",
                          )}
                        >
                          <Check className="size-3" />
                        </button>
                        <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">
                          {block.start_time.slice(0, 5)}
                        </span>
                        <span
                          className={cn(
                            "flex min-w-0 flex-1 items-center gap-2 text-sm",
                            done ? "text-muted-foreground line-through" : "text-foreground",
                          )}
                        >
                          <span className="truncate">{block.title}</span>
                          {isCurrent ? (
                            <Badge variant="secondary" className="shrink-0 text-[10px]">
                              agora
                            </Badge>
                          ) : null}
                        </span>
                        <WorkspaceDot color={workspaceMap.get(block.workspace_id ?? "")?.color} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="font-display text-lg">Tarefas de hoje</CardTitle>
              <Button asChild size="sm" variant="ghost">
                <Link to="/tarefas">
                  Kanban <ArrowUpRight className="size-3.5" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {todayTasks.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">
                  Nada marcado para hoje. Respire — ou puxe uma tarefa do backlog.
                </p>
              ) : (
                <ul className="space-y-2">
                  {todayTasks.map((task) => (
                    <li
                      key={task.id}
                      className="flex items-start gap-3 rounded-xl border border-border/60 px-3 py-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => toggleTask(task)}
                        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-transparent transition hover:border-primary/60"
                        aria-label="Concluir tarefa"
                      >
                        <Check className="size-3" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground">{task.title}</p>
                        <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <WorkspaceDot color={workspaceMap.get(task.workspace_id)?.color} />
                          {workspaceMap.get(task.workspace_id)?.name ?? "—"}
                          {task.estimate_minutes ? ` · ${task.estimate_minutes} min` : ""}
                        </p>
                      </div>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {task.priority === "URGENT"
                          ? "urgente"
                          : task.priority === "HIGH"
                            ? "alta"
                            : task.priority === "MEDIUM"
                              ? "média"
                              : "baixa"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="font-display text-lg">Agenda de hoje</CardTitle>
              <Button asChild size="sm" variant="ghost">
                <Link to="/calendario">
                  Calendário <ArrowUpRight className="size-3.5" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {todayEvents.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  Nenhum evento hoje no calendário.
                </p>
              ) : (
                <ul className="space-y-2">
                  {todayEvents.map((event) => (
                    <li key={event.id} className="flex items-center gap-3 text-sm">
                      <CalendarDays className="size-4 text-primary" />
                      <span className="w-11 text-xs tabular-nums text-muted-foreground">
                        {formatTimeZoned(event.start_at)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{event.title}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {workspaceMap.get(event.workspace_id)?.name}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="border-border/70 shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="font-display text-lg">Hábitos</CardTitle>
              <Button asChild size="sm" variant="ghost">
                <Link to="/habitos">
                  Ver <ArrowUpRight className="size-3.5" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {activeHabits.map((habit) => {
                const done = habitEntries.some(
                  (entry) =>
                    entry.habit_id === habit.id && entry.entry_date === today && entry.done,
                );
                return (
                  <button
                    key={habit.id}
                    type="button"
                    onClick={() => toggleHabit.mutate({ habitId: habit.id, date: today, done: !done })}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition",
                      done
                        ? "border-primary/30 bg-accent/60 text-foreground"
                        : "border-border/70 hover:border-primary/40",
                    )}
                  >
                    {done ? (
                      <Check className="size-4 text-primary" />
                    ) : (
                      <Circle className="size-4 text-muted-foreground" />
                    )}
                    <span className="flex-1">{habit.name}</span>
                    {habit.category && habit.category !== habit.name ? (
                      <span className="text-[11px] text-muted-foreground">{habit.category}</span>
                    ) : null}
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="font-display text-lg">Metas em foco</CardTitle>
              <Button asChild size="sm" variant="ghost">
                <Link to="/metas">
                  <Target className="size-3.5" /> Metas
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeGoals.map((goal) => {
                const start = Number(goal.start_value ?? 0);
                const target = Number(goal.target_value ?? 0);
                const currentValue = Number(goal.current_value ?? start);
                const pct =
                  target && target !== start
                    ? Math.min(100, Math.max(0, Math.round(((currentValue - start) / (target - start)) * 100)))
                    : 0;
                return (
                  <div key={goal.id} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm text-foreground">{goal.title}</p>
                      <span className="text-[11px] tabular-nums text-muted-foreground">{pct}%</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                    <p className="text-[11px] text-muted-foreground">
                      {goal.unit === "BRL"
                        ? `${Number(currentValue).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} de ${Number(target).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
                        : `${currentValue}${goal.unit ? ` ${goal.unit}` : ""} · meta ${target}${goal.unit ?? ""}`}
                      {goal.due_date ? ` · até ${formatDate(goal.due_date, "dd/MM/yyyy")}` : ""}
                    </p>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-accent/30 shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-lg">Próximo conteúdo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {nextContent ? (
                <>
                  <p className="font-medium text-foreground">{nextContent.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {nextContent.format} · publica em{" "}
                    {format(nextContent.publish_date ?? "", "dd/MM 'às' HH:mm")}
                  </p>
                  <Button asChild size="sm" variant="outline" className="mt-1">
                    <Link to="/conteudo">Abrir conteúdo</Link>
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Nada agendado por aqui.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
