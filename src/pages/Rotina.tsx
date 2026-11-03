import { useMemo, useState } from "react";
import { addWeeks, format, parseISO, subWeeks } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, ChevronLeft, ChevronRight, Clock, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
import { useWorkspace, useWorkspaceMap } from "@/lib/workspace";
import {
  useHabitEntries,
  useHabits,
  useRoutineBlocks,
  useRoutineLogs,
  useSocialProfiles,
} from "@/lib/queries";
import {
  useDeleteRoutineBlock,
  useSaveRoutineBlock,
  useToggleHabitEntry,
  useToggleRoutineLog,
} from "@/lib/mutations";
import { adherence, blocksForDate, currentAndNext, logKey, logsMap, weekDates } from "@/lib/routine";
import { minutesToTime, todayISO, WEEKDAYS, WEEKDAYS_LONG } from "@/lib/format";
import { PageHeader, StatCard, WorkspaceDot } from "@/components/common/page-parts";
import type { RoutineBlock } from "@/lib/types";

const DAY_LABELS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const START_MIN = 4 * 60;
const END_MIN = 24 * 60;
const PX_PER_MIN = 0.85;

type FormState = {
  id?: string;
  title: string;
  start_time: string;
  end_time: string;
  days: number[];
  workspace_id: string | null;
  notes: string;
  active: boolean;
};

const emptyForm = (workspaceId: string | null): FormState => ({
  title: "",
  start_time: "08:00",
  end_time: "09:00",
  days: [0, 1, 2, 3, 4],
  workspace_id: workspaceId,
  notes: "",
  active: true,
});

export default function Rotina() {
  const today = todayISO();
  const [anchor, setAnchor] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [view, setView] = useState<"semana" | "dia">(() =>
    window.innerWidth < 1024 ? "dia" : "semana",
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm(null));

  const { workspaces, activeId } = useWorkspace();
  const workspaceMap = useWorkspaceMap(workspaces);
  const { data: blocks = [] } = useRoutineBlocks();
  const { data: logs = [] } = useRoutineLogs();
  const { data: habits = [] } = useHabits();
  const { data: habitEntries = [] } = useHabitEntries();
  const { data: profiles = [] } = useSocialProfiles();

  const toggleRoutine = useToggleRoutineLog();
  const toggleHabit = useToggleHabitEntry();
  const saveBlock = useSaveRoutineBlock();
  const deleteBlock = useDeleteRoutineBlock();

  const dates = useMemo(() => weekDates(anchor), [anchor]);
  const logMap = logsMap(logs);
  const activeBlocks = blocks.filter((block) => block.active);

  const dayBlocks = useMemo(() => blocksForDate(blocks, selectedDate), [blocks, selectedDate]);
  const todayBlocks = useMemo(() => blocksForDate(blocks, today), [blocks, today]);
  const todayDone = todayBlocks.filter((block) => logMap.get(logKey(block.id, today))).length;
  const { current, next } = currentAndNext(blocks);

  const weekTotals = useMemo(() => {
    let total = 0;
    let done = 0;
    dates.forEach((date) => {
      const dayList = blocksForDate(blocks, date);
      total += dayList.length;
      done += dayList.filter((block) => logMap.get(logKey(block.id, date))).length;
    });
    return total ? Math.round((done / total) * 100) : 0;
  }, [blocks, dates, logMap]);

  const openNew = () => {
    setForm(emptyForm(activeId));
    setDialogOpen(true);
  };

  const openEdit = (block: RoutineBlock) => {
    setForm({
      id: block.id,
      title: block.title,
      start_time: block.start_time.slice(0, 5),
      end_time: block.end_time.slice(0, 5),
      days: block.days?.length ? block.days : [0, 1, 2, 3, 4],
      workspace_id: block.workspace_id,
      notes: block.notes ?? "",
      active: block.active,
    });
    setDialogOpen(true);
  };

  const submit = () => {
    if (!form.title.trim()) return;
    saveBlock.mutate(
      {
        id: form.id,
        title: form.title.trim(),
        start_time: form.start_time,
        end_time: form.end_time,
        days: form.days,
        workspace_id: form.workspace_id,
        color: form.workspace_id ? workspaceMap.get(form.workspace_id)?.color ?? null : null,
        notes: form.notes || null,
        active: form.active,
        position: form.id ? undefined : blocks.length,
      },
      { onSuccess: () => setDialogOpen(false) },
    );
  };

  const remove = () => {
    if (!form.id) return;
    deleteBlock.mutate(form.id, { onSuccess: () => setDialogOpen(false) });
  };

  const toggleDay = (day: number) =>
    setForm((current) => ({
      ...current,
      days: current.days.includes(day)
        ? current.days.filter((item) => item !== day)
        : [...current.days, day].sort(),
    }));

  const hours = Array.from({ length: (END_MIN - START_MIN) / 60 + 1 }, (_, index) => START_MIN + index * 60);

  const blocksOf = (date: string) => blocksForDate(activeBlocks, date);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Rotina"
        title="A semana que sustenta tudo"
        description="Sua rotina é independente da agenda: aqui você desenha os blocos do dia, marca o que cumpriu e acompanha a constância."
        actions={
          <Button onClick={openNew}>
            <Plus className="size-4" /> Novo bloco
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Hoje"
          value={`${todayDone}/${todayBlocks.length}`}
          hint={`${adherence(blocks, logs, today)}% do dia`}
          icon={<Check className="size-4" />}
          accent
        />
        <StatCard label="Constância da semana" value={`${weekTotals}%`} hint="blocos cumpridos" icon={<Clock className="size-4" />} />
        <StatCard
          label={current ? "Agora" : "Próximo"}
          value={current ? current.title : next ? next.title : "—"}
          hint={
            current
              ? `até ${current.end_time.slice(0, 5)}`
              : next
                ? `às ${next.start_time.slice(0, 5)}`
                : "nada depois deste horário"
          }
          icon={<Clock className="size-4" />}
        />
      </div>

      <Card className="border-border/70 shadow-card">
        <CardHeader className="flex flex-col gap-4 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost" onClick={() => setAnchor(subWeeks(anchor, 1))} aria-label="Semana anterior">
              <ChevronLeft className="size-4" />
            </Button>
            <div className="min-w-[170px] text-center">
              <p className="text-sm font-medium text-foreground">
                {format(parseISO(dates[0]), "dd 'de' MMM", { locale: ptBR })} —{" "}
                {format(parseISO(dates[6]), "dd 'de' MMM", { locale: ptBR })}
              </p>
              <p className="text-[11px] text-muted-foreground">semana de referência</p>
            </div>
            <Button size="icon" variant="ghost" onClick={() => setAnchor(addWeeks(anchor, 1))} aria-label="Próxima semana">
              <ChevronRight className="size-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="ml-1"
              onClick={() => {
                setAnchor(new Date());
                setSelectedDate(today);
              }}
            >
              Hoje
            </Button>
          </div>
          <div className="flex rounded-full border border-border bg-secondary/60 p-0.5 text-xs">
            {(["semana", "dia"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setView(option)}
                className={cn(
                  "rounded-full px-3 py-1 capitalize transition",
                  view === option ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-7 gap-1.5">
            {dates.map((date, index) => {
              const isSelected = date === selectedDate;
              const dayList = blocksOf(date);
              const done = dayList.filter((block) => logMap.get(logKey(block.id, date))).length;
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => {
                    setSelectedDate(date);
                    setView("dia");
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-center transition",
                    isSelected
                      ? "border-primary/40 bg-accent text-accent-foreground"
                      : "border-border/60 hover:border-primary/30",
                  )}
                >
                  <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {DAY_LABELS[index]}
                  </span>
                  <span className={cn("text-sm font-medium", date === today && "text-primary")}>
                    {format(parseISO(date), "dd")}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {dayList.length ? `${done}/${dayList.length}` : "livre"}
                  </span>
                </button>
              );
            })}
          </div>

          {view === "semana" ? (
            <div className="overflow-x-auto scrollbar-thin">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] gap-1">
                  <div />
                  {dates.map((date, index) => (
                    <div key={date} className="pb-1 text-center">
                      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        {DAY_LABELS[index]}
                      </p>
                      <p className={cn("text-xs", date === today ? "text-primary" : "text-muted-foreground")}>
                        {format(parseISO(date), "dd/MM")}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] gap-1">
                  <div className="relative" style={{ height: (END_MIN - START_MIN) * PX_PER_MIN }}>
                    {hours.map((hour) => (
                      <span
                        key={hour}
                        className="absolute right-1 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
                        style={{ top: (hour - START_MIN) * PX_PER_MIN }}
                      >
                        {minutesToTime(hour)}
                      </span>
                    ))}
                  </div>

                  {dates.map((date) => (
                    <div
                      key={date}
                      className="relative rounded-lg border border-border/50 bg-secondary/20"
                      style={{ height: (END_MIN - START_MIN) * PX_PER_MIN }}
                    >
                      {hours.map((hour) => (
                        <div
                          key={hour}
                          className="absolute inset-x-0 border-t border-border/40"
                          style={{ top: (hour - START_MIN) * PX_PER_MIN }}
                        />
                      ))}
                      {blocksOf(date).map((block) => {
                        const start = Math.max(START_MIN, Math.min(END_MIN, Number(block.start_time.slice(0, 2)) * 60 + Number(block.start_time.slice(3, 5))));
                        let end = Number(block.end_time.slice(0, 2)) * 60 + Number(block.end_time.slice(3, 5));
                        if (end <= start) end = Math.min(END_MIN, start + 45);
                        const height = Math.max(22, (end - start) * PX_PER_MIN - 2);
                        const done = logMap.get(logKey(block.id, date));
                        const workspace = workspaceMap.get(block.workspace_id ?? "");
                        return (
                          <button
                            key={block.id}
                            type="button"
                            onClick={() => openEdit(block)}
                            className={cn(
                              "absolute inset-x-0.5 overflow-hidden rounded-md border px-1.5 py-1 text-left transition hover:shadow-sm",
                              done
                                ? "border-primary/30 bg-primary/15"
                                : "border-border bg-card/90 hover:border-primary/40",
                            )}
                            style={{ top: (start - START_MIN) * PX_PER_MIN, height }}
                            title={`${block.title} · ${block.start_time.slice(0, 5)}–${block.end_time.slice(0, 5)}`}
                          >
                            <span className="flex items-center gap-1">
                              <span
                                className="size-1.5 shrink-0 rounded-full"
                                style={{ backgroundColor: workspace?.color ?? "hsl(var(--taupe))" }}
                              />
                              <span className="truncate text-[10px] font-medium text-foreground">
                                {block.title}
                              </span>
                            </span>
                            <span className="block text-[9px] tabular-nums text-muted-foreground">
                              {block.start_time.slice(0, 5)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-display text-lg text-foreground">
                  {WEEKDAYS_LONG[(parseISO(selectedDate).getDay() + 6) % 7]}, {format(parseISO(selectedDate), "dd 'de' MMMM", { locale: ptBR })}
                </p>
                <Badge variant="secondary" className="text-[10px]">
                  {dayBlocks.filter((block) => logMap.get(logKey(block.id, selectedDate))).length}/
                  {dayBlocks.length} cumpridos
                </Badge>
              </div>
              <Progress
                value={
                  dayBlocks.length
                    ? (dayBlocks.filter((block) => logMap.get(logKey(block.id, selectedDate))).length /
                        dayBlocks.length) *
                      100
                    : 0
                }
                className="h-1.5"
              />
              {dayBlocks.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum bloco neste dia. Adicione um para começar.
                </p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {dayBlocks.map((block) => {
                    const done = Boolean(logMap.get(logKey(block.id, selectedDate)));
                    return (
                      <li key={block.id} className="flex items-center gap-3 py-3">
                        <button
                          type="button"
                          aria-label={done ? "Desmarcar" : "Marcar"}
                          onClick={() =>
                            toggleRoutine.mutate({ blockId: block.id, date: selectedDate, done: !done })
                          }
                          className={cn(
                            "flex size-6 shrink-0 items-center justify-center rounded-full border transition",
                            done
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border text-transparent hover:border-primary/60",
                          )}
                        >
                          <Check className="size-3.5" />
                        </button>
                        <div className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">
                          {block.start_time.slice(0, 5)}
                          <span className="block text-[10px]">{block.end_time.slice(0, 5)}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={cn("truncate text-sm", done ? "text-muted-foreground line-through" : "text-foreground")}>
                            {block.title}
                          </p>
                          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <WorkspaceDot color={workspaceMap.get(block.workspace_id ?? "")?.color} />
                            {workspaceMap.get(block.workspace_id ?? "")?.name ?? "Sem área"}
                          </p>
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => openEdit(block)} aria-label="Editar bloco">
                          <Pencil className="size-3.5" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="border-border/70 shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-lg">Hábitos de hoje</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {habits.filter((habit) => habit.active).map((habit) => {
              const done = habitEntries.some(
                (entry) => entry.habit_id === habit.id && entry.entry_date === today && entry.done,
              );
              return (
                <button
                  key={habit.id}
                  type="button"
                  onClick={() => toggleHabit.mutate({ habitId: habit.id, date: today, done: !done })}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition",
                    done
                      ? "border-primary/30 bg-primary/12 text-foreground"
                      : "border-border text-muted-foreground hover:border-primary/40",
                  )}
                >
                  <Check className={cn("size-3.5", done ? "text-primary" : "text-muted-foreground/50")} />
                  {habit.name}
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-accent/25 shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-lg">Blocos que você mantém</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>
              {blocks.filter((block) => block.active).length} blocos ativos em{" "}
              {new Set(blocks.flatMap((block) => block.days)).size} dias da semana.
            </p>
            <p className="text-xs">
              {profiles.length
                ? `Os stories e o conteúdo do dia aparecem aqui para você encaixar entre os blocos.`
                : "Sua rotina não altera a agenda: são independentes, como você pediu."}
            </p>
            <div className="flex flex-wrap gap-1.5 pt-2">
              {WEEKDAYS.map((day, index) => {
                const count = blocks.filter((block) => block.days?.includes(index) && block.active).length;
                return (
                  <span
                    key={day}
                    className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] tabular-nums text-muted-foreground"
                  >
                    {day} · {count}
                  </span>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar bloco" : "Novo bloco de rotina"}</DialogTitle>
            <DialogDescription>
              A rotina é sua: estes horários não criam eventos na agenda.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="block-title">Nome</Label>
              <Input
                id="block-title"
                value={form.title}
                placeholder="Ex.: devocional, academia, deep work"
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="block-start">Início</Label>
                <Input
                  id="block-start"
                  type="time"
                  value={form.start_time}
                  onChange={(event) => setForm({ ...form, start_time: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="block-end">Fim</Label>
                <Input
                  id="block-end"
                  type="time"
                  value={form.end_time}
                  onChange={(event) => setForm({ ...form, end_time: event.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Dias da semana</Label>
              <div className="flex flex-wrap gap-1.5">
                {DAY_LABELS.map((day, index) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(index)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs uppercase transition",
                      form.days.includes(index)
                        ? "border-primary/40 bg-primary/12 text-foreground"
                        : "border-border text-muted-foreground hover:border-primary/30",
                    )}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Área</Label>
              <Select
                value={form.workspace_id ?? "none"}
                onValueChange={(value) =>
                  setForm({ ...form, workspace_id: value === "none" ? null : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolher área" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem área</SelectItem>
                  {workspaces.map((workspace) => (
                    <SelectItem key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="block-notes">Observações</Label>
              <Textarea
                id="block-notes"
                rows={2}
                value={form.notes}
                placeholder="O que precisa acontecer neste bloco?"
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {form.id ? (
              <Button type="button" variant="ghost" className="text-destructive" onClick={remove}>
                <Trash2 className="size-4" /> Excluir
              </Button>
            ) : (
              <span />
            )}
            <Button type="button" onClick={submit} disabled={saveBlock.isPending}>
              {form.id ? "Salvar bloco" : "Adicionar bloco"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
