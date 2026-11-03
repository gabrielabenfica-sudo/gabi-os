import { useMemo, useState } from "react";
import { addDays, format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, CircleDashed, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";
import { useHabitEntries, useHabits } from "@/lib/queries";
import { useToggleHabitEntry } from "@/lib/mutations";
import { PageHeader, StatCard } from "@/components/common/page-parts";

const DAY_INITIALS = ["D", "S", "T", "Q", "Q", "S", "S"];

export default function Habitos() {
  const { activeId } = useWorkspace();
  const { data: habits = [] } = useHabits();
  const { data: entries = [] } = useHabitEntries();
  const toggleEntry = useToggleHabitEntry();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", category: "", times: "2" });

  const days = useMemo(
    () => Array.from({ length: 14 }, (_, index) => subDays(new Date(), 13 - index)),
    [],
  );

  const createHabit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("habits").insert({
        name: form.name.trim(),
        category: form.category.trim() || "Geral",
        frequency: "DAILY",
        days_of_week: [],
        times_per_week: Number(form.times) || null,
        color: "#A66F7C",
        active: true,
        workspace_id: activeId,
        position: habits.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["habits"] });
      setOpen(false);
      setForm({ name: "", category: "", times: "2" });
    },
  });

  const weekWindow = days.slice(-7);
  const weeklyRate = useMemo(() => {
    const activeHabits = habits.filter((habit) => habit.active);
    if (!activeHabits.length) return 0;
    const possible = activeHabits.length * weekWindow.length;
    const done = entries.filter(
      (entry) =>
        entry.done && weekWindow.some((day) => format(day, "yyyy-MM-dd") === entry.entry_date),
    ).length;
    return possible ? Math.round((done / possible) * 100) : 0;
  }, [habits, entries, weekWindow]);

  const todayISO = format(new Date(), "yyyy-MM-dd");
  const doneToday = habits.filter((habit) =>
    entries.some((entry) => entry.habit_id === habit.id && entry.entry_date === todayISO && entry.done),
  ).length;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Hábitos"
        title="O que você repete, você vira"
        description="Leitura, academia, devocional e cursos — marcados dia a dia, com a constância à vista."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Novo hábito
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Hoje"
          value={`${doneToday}/${habits.filter((habit) => habit.active).length}`}
          hint="hábitos marcados"
          icon={<Check className="size-4" />}
          accent
        />
        <StatCard
          label="Últimos 7 dias"
          value={`${weeklyRate}%`}
          hint="constância semanal"
          icon={<CircleDashed className="size-4" />}
        />
        <StatCard
          label="Hábitos ativos"
          value={habits.filter((habit) => habit.active).length}
          hint="em acompanhamento"
          icon={<CircleDashed className="size-4" />}
        />
      </div>

      <Card className="border-border/70 shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-lg">Últimas duas semanas</CardTitle>
          <p className="text-xs text-muted-foreground">
            Toque em um dia para marcar ou desmarcar o hábito.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto scrollbar-thin">
          <div className="min-w-[640px] space-y-3">
            <div className="grid grid-cols-[minmax(140px,1fr)_repeat(14,26px)] items-center gap-1">
              <span />
              {days.map((day) => (
                <span
                  key={day.toISOString()}
                  className={cn(
                    "text-center text-[10px]",
                    format(day, "yyyy-MM-dd") === todayISO ? "font-semibold text-primary" : "text-muted-foreground",
                  )}
                >
                  {DAY_INITIALS[day.getDay()]}
                </span>
              ))}
            </div>
            {habits.map((habit) => {
              const habitEntries = entries.filter((entry) => entry.habit_id === habit.id);
              const doneInWindow = days.filter((day) =>
                habitEntries.some(
                  (entry) => entry.entry_date === format(day, "yyyy-MM-dd") && entry.done,
                ),
              ).length;
              return (
                <div
                  key={habit.id}
                  className="grid grid-cols-[minmax(140px,1fr)_repeat(14,26px)] items-center gap-1"
                >
                  <div className="pr-2">
                    <p className="truncate text-sm text-foreground">{habit.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {habit.category} · {doneInWindow}/{days.length}
                    </p>
                  </div>
                  {days.map((day) => {
                    const iso = format(day, "yyyy-MM-dd");
                    const done = habitEntries.some((entry) => entry.entry_date === iso && entry.done);
                    return (
                      <button
                        key={iso}
                        type="button"
                        aria-label={`${habit.name} em ${format(day, "dd/MM", { locale: ptBR })}`}
                        onClick={() => toggleEntry.mutate({ habitId: habit.id, date: iso, done: !done })}
                        className={cn(
                          "flex size-6 items-center justify-center rounded-md border text-transparent transition",
                          done
                            ? "border-primary bg-primary/85 text-primary-foreground"
                            : "border-border bg-secondary/40 hover:border-primary/50",
                          iso === todayISO && !done && "border-primary/50",
                        )}
                      >
                        <Check className="size-3" />
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {habits.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum hábito cadastrado ainda.</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-lg">Constância por hábito</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {habits.map((habit) => {
            const done = entries.filter(
              (entry) =>
                entry.habit_id === habit.id &&
                entry.done &&
                weekWindow.some((day) => format(day, "yyyy-MM-dd") === entry.entry_date),
            ).length;
            const pct = Math.round((done / weekWindow.length) * 100);
            return (
              <div key={habit.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span>{habit.name}</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{pct}%</span>
                </div>
                <Progress value={pct} className="h-1.5" />
                <p className="text-[11px] text-muted-foreground">
                  {done} de {weekWindow.length} dias · desde{" "}
                  {format(addDays(new Date(), -30), "MMMM", { locale: ptBR })}
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Novo hábito</DialogTitle>
            <DialogDescription>Comece pequeno e mantenha a constância.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="habit-name">Nome</Label>
              <Input
                id="habit-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Ex.: caminhar 20 minutos"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="habit-category">Categoria</Label>
                <Input
                  id="habit-category"
                  value={form.category}
                  onChange={(event) => setForm({ ...form, category: event.target.value })}
                  placeholder="Saúde"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="habit-times">Meta semanal</Label>
                <Input
                  id="habit-times"
                  type="number"
                  min={1}
                  max={7}
                  value={form.times}
                  onChange={(event) => setForm({ ...form, times: event.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => createHabit.mutate()} disabled={!form.name.trim()}>
              Criar hábito
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
