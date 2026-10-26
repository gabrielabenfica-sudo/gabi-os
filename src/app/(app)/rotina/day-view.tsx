"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Check, ChevronLeft, ChevronRight, MoreHorizontal, Pencil, Plus, Sunrise, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState, WsDot } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm";
import { addDaysYmd, formatYmdBR, weekdayOfYmd } from "@/lib/dates";
import { PERIOD_LABEL, type DayPeriod } from "@/lib/routines";
import { cn } from "@/lib/utils";
import type { RoutineDayView, ScheduleView } from "@/server/routines";
import { deleteRoutineAction, setRoutineActiveAction, setRoutineCheckAction } from "./actions";
import { daysLabel, WEEKDAY_NAME, type EditableRoutine } from "./routine-dialog";

const PERIODS: DayPeriod[] = ["MANHA", "TARDE", "NOITE"];

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function DayView({
  day,
  schedules,
  showArchived,
  onEdit,
  onNew,
  onDate,
}: {
  day: RoutineDayView;
  schedules: ScheduleView[];
  showArchived: boolean;
  onEdit: (r: EditableRoutine) => void;
  onNew: () => void;
  onDate: (ymd: string) => void;
}) {
  const router = useRouter();
  const [checked, setChecked] = React.useState(() => new Set(day.items.filter((i) => i.checked).map((i) => i.id)));
  React.useEffect(() => setChecked(new Set(day.items.filter((i) => i.checked).map((i) => i.id))), [day.items]);
  const isToday = day.date === day.today;
  const future = day.date > day.today;

  const toggle = async (itemId: string) => {
    const value = !checked.has(itemId);
    setChecked((s) => {
      const n = new Set(s);
      if (value) n.add(itemId);
      else n.delete(itemId);
      return n;
    });
    const r = await setRoutineCheckAction(itemId, day.date, value);
    if (!r.ok) {
      toast.error(r.error);
      setChecked(new Set(day.items.filter((i) => i.checked).map((i) => i.id)));
    } else router.refresh();
  };

  const rate = (s: { rate: number | null; done: number; expected: number }) => (s.rate === null ? "—" : `${s.rate}%`);
  const doneHere = day.items.filter((i) => checked.has(i.id)).length;

  return (
    <div className="grid gap-5">
      {!showArchived && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Hoje" value={`${day.todayProgress.done}/${day.todayProgress.total}`} hint="itens cumpridos" />
            <Stat label="Últimos 7 dias" value={rate(day.stats7)} hint={day.stats7.expected ? `${day.stats7.done} de ${day.stats7.expected}` : "ainda sem histórico"} />
            <Stat label="Últimos 30 dias" value={rate(day.stats30)} hint={day.stats30.expected ? `${day.stats30.done} de ${day.stats30.expected}` : "ainda sem histórico"} />
          </div>

          <section className="rounded-xl border border-border bg-card" aria-label="Roteiro do dia">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" aria-label="Dia anterior" onClick={() => onDate(addDaysYmd(day.date, -1))}><ChevronLeft /></Button>
                <h2 className="min-w-44 text-center font-medium" data-testid="routine-date">
                  {isToday ? "Hoje" : WEEKDAY_NAME[weekdayOfYmd(day.date)]!.replace(/^./, (c) => c.toUpperCase())}, {formatYmdBR(day.date)}
                </h2>
                <Button size="icon" variant="ghost" aria-label="Próximo dia" onClick={() => onDate(addDaysYmd(day.date, 1))}><ChevronRight /></Button>
                {!isToday && <Button size="sm" variant="outline" onClick={() => onDate(day.today)}>Hoje</Button>}
              </div>
              {day.items.length > 0 && <span className="text-sm">Cumprido: <strong className="tabular">{doneHere}/{day.items.length}</strong></span>}
            </header>

            {day.items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                {schedules.length ? "Nenhuma rotina vale neste dia." : "Crie sua primeira rotina do dia para ver o roteiro aqui."}
              </p>
            ) : (
              <div className="divide-y divide-border">
                {PERIODS.map((p) => {
                  const items = day.items.filter((i) => i.period === p);
                  if (!items.length) return null;
                  return (
                    <div key={p} className="px-4 py-3">
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{PERIOD_LABEL[p]}</h3>
                      <ul className="grid gap-1">
                        {items.map((i) => {
                          const on = checked.has(i.id);
                          return (
                            <li key={i.id}>
                              <button
                                type="button"
                                disabled={future}
                                aria-pressed={on}
                                aria-label={`${i.title} às ${i.time}: ${on ? "feito" : "não feito"}`}
                                onClick={() => toggle(i.id)}
                                className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-accent disabled:cursor-default disabled:hover:bg-transparent"
                              >
                                <span className="w-12 shrink-0 text-sm tabular text-muted-foreground">{i.time}</span>
                                <span
                                  className={cn(
                                    "grid size-6 shrink-0 place-items-center rounded-full border transition-colors",
                                    on ? "border-transparent bg-success text-white" : "border-border",
                                  )}
                                >
                                  {on && <Check className="size-3.5" />}
                                </span>
                                <span className={cn("flex-1 text-sm", on && "text-muted-foreground line-through")}>{i.title}</span>
                                <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                                  <span className="size-2 rounded-full" style={{ background: i.routine.color }} aria-hidden />
                                  {i.routine.name}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
            {future && day.items.length > 0 && <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">Dias futuros não podem ser marcados.</p>}
          </section>
        </>
      )}

      <section className="grid gap-3" aria-label="Rotinas do dia">
        <h2 className="text-sm font-semibold">{showArchived ? "Rotinas arquivadas" : "Suas rotinas do dia"}</h2>
        {schedules.length === 0 ? (
          <EmptyState
            icon={Sunrise}
            title={showArchived ? "Nenhuma rotina arquivada" : "Nenhuma rotina do dia ainda"}
            description={showArchived ? undefined : "Monte o roteiro com horários, por exemplo uma para dias úteis e outra para o fim de semana."}
            action={!showArchived && <Button onClick={onNew}><Plus /> Criar rotina do dia</Button>}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {schedules.map((r) => <ScheduleCard key={r.id} routine={r} onEdit={() => onEdit(r)} />)}
          </div>
        )}
      </section>
    </div>
  );
}

export function RoutineMenu({ routine, onEdit, what }: { routine: { id: string; name: string; active: boolean }; onEdit: () => void; what: string }) {
  const confirm = useConfirm();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="grid size-8 place-items-center rounded-md hover:bg-accent" aria-label={`Ações de ${routine.name}`}>
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}><Pencil /> Editar</DropdownMenuItem>
        <DropdownMenuItem
          onSelect={async () => {
            const r = await setRoutineActiveAction(routine.id, !routine.active);
            if (!r.ok) return toast.error(r.error);
            toast.success(r.message);
          }}
        >
          {routine.active ? <><Archive /> Arquivar</> : <><ArchiveRestore /> Reativar</>}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-danger"
          onSelect={async () => {
            if (!(await confirm({ title: `Excluir “${routine.name}”?`, description: `Todo o histórico ${what} também será apagado. Para manter o histórico, prefira arquivar.`, confirmLabel: "Excluir", danger: true }))) return;
            const r = await deleteRoutineAction(routine.id);
            if (!r.ok) return toast.error(r.error);
            toast.success(r.message);
          }}
        >
          <Trash2 /> Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ScheduleCard({ routine, onEdit }: { routine: ScheduleView; onEdit: () => void }) {
  return (
    <article className="rounded-xl border border-border bg-card p-4" data-routine={routine.name}>
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 font-medium">
            <span className="size-2.5 rounded-full" style={{ background: routine.color ?? routine.workspace.color }} aria-hidden />
            {routine.name}
          </h3>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <WsDot color={routine.workspace.color} className="size-2" /> {routine.workspace.name} · {daysLabel(routine.daysOfWeek)} · {routine.items.length} {routine.items.length === 1 ? "item" : "itens"}
          </p>
        </div>
        <RoutineMenu routine={routine} onEdit={onEdit} what="de marcações" />
      </header>
      <ul className="mt-3 grid gap-0.5 text-sm">
        {routine.items.slice(0, 6).map((i) => (
          <li key={i.id} className="flex gap-3">
            <span className="w-12 tabular text-muted-foreground">{i.time}</span>
            <span className="truncate">{i.title}</span>
          </li>
        ))}
        {routine.items.length > 6 && <li className="text-xs text-muted-foreground">+ {routine.items.length - 6} itens</li>}
      </ul>
    </article>
  );
}
