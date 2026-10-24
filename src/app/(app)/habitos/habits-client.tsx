"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Archive, ArchiveRestore, Check, Flame, MoreHorizontal, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { EmptyState, PageHeader, Segmented, WsDot } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm";
import { addDaysYmd, eachDayYmd, weekdayOfYmd } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { HabitView } from "@/server/habits";
import { createHabitAction, deleteHabitAction, setHabitActiveAction, setHabitEntryAction, updateHabitAction } from "./actions";

type Ws = { id: string; name: string; color: string; kind: string };

const WEEKDAY_SHORT = ["D", "S", "T", "Q", "Q", "S", "S"];
const WEEKDAY_NAME = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const CATEGORIES = ["Academia", "Leitura", "Devocional", "Estudos", "Compromissos pessoais", "Saúde", "Outro"];

function frequencyLabel(h: Pick<HabitView, "frequency" | "daysOfWeek" | "timesPerWeek">) {
  if (h.frequency === "DAILY") return "Todo dia";
  if (h.frequency === "WEEKLY") return `${h.timesPerWeek}x por semana`;
  return h.daysOfWeek.map((d) => WEEKDAY_NAME[d]!.slice(0, 3)).join(", ");
}

function expectedOn(h: HabitView, ymd: string) {
  return h.frequency === "DAILY" || h.frequency === "WEEKLY" || h.daysOfWeek.includes(weekdayOfYmd(ymd));
}

export function HabitsClient({
  habits,
  workspaces,
  period,
  from,
  today,
  showArchived,
  openNew,
}: {
  habits: HabitView[];
  workspaces: Ws[];
  period: number;
  from: string;
  today: string;
  showArchived: boolean;
  openNew: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [editing, setEditing] = React.useState<HabitView | "new" | null>(openNew ? "new" : null);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (openNew) setEditing("new");
  }, [openNew]);
  const last7 = eachDayYmd(addDaysYmd(today, -6), today);

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    next.delete("novo");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const expectedToday = habits.filter((h) => h.active && h.expectedToday);
  const doneToday = expectedToday.filter((h) => h.doneToday).length;
  const rated = habits.filter((h) => h.stats.rate !== null);
  const avg = rated.length ? Math.round(rated.reduce((s, h) => s + h.stats.rate!, 0) / rated.length) : null;

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Hábitos e rotina"
        description="Acompanhe a constância. Dia não marcado reduz o percentual, mas não vira pendência."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus /> Novo hábito
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          ariaLabel="Período"
          value={String(period)}
          options={[{ value: "7", label: "7 dias" }, { value: "30", label: "30 dias" }, { value: "90", label: "90 dias" }]}
          onChange={(v) => setParam("periodo", v === "30" ? null : v)}
          size="sm"
        />
        <Segmented
          ariaLabel="Situação"
          value={showArchived ? "arq" : "ativos"}
          options={[{ value: "ativos", label: "Ativos" }, { value: "arq", label: "Arquivados" }]}
          onChange={(v) => setParam("arquivados", v === "arq" ? "1" : null)}
          size="sm"
        />
        {!showArchived && habits.length > 0 && (
          <div className="ml-auto flex gap-4 text-sm">
            <span>
              Hoje: <strong className="tabular">{doneToday}/{expectedToday.length}</strong>
            </span>
            <span>
              Média no período: <strong className="tabular">{avg === null ? "—" : `${avg}%`}</strong>
            </span>
          </div>
        )}
      </div>

      {habits.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title={showArchived ? "Nenhum hábito arquivado" : "Nenhum hábito ainda"}
          description={showArchived ? undefined : "Comece por academia, leitura, devocional ou estudos, com a frequência que fizer sentido."}
          action={!showArchived && <Button onClick={() => setEditing("new")}><Plus /> Criar hábito</Button>}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left font-medium">Hábito</th>
                {last7.map((d) => (
                  <th key={d} className={cn("w-11 px-1 py-2 text-center font-medium", d === today && "text-primary")}>
                    <span className="block">{WEEKDAY_SHORT[weekdayOfYmd(d)]}</span>
                    <span className="block tabular font-normal">{d.slice(8, 10)}</span>
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">{period} dias</th>
                <th className="px-3 py-2 text-right font-medium">Sequência</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {habits.map((h) => (
                <HabitRow
                  key={h.id}
                  habit={h}
                  days={last7}
                  today={today}
                  from={from}
                  expanded={expanded === h.id}
                  onToggleExpand={() => setExpanded(expanded === h.id ? null : h.id)}
                  onEdit={() => setEditing(h)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <HabitDialog
          habit={editing === "new" ? null : editing}
          workspaces={workspaces}
          onClose={() => {
            setEditing(null);
            if (params.get("novo")) setParam("novo", null);
          }}
        />
      )}
    </div>
  );
}

function HabitRow({
  habit, days, today, from, expanded, onToggleExpand, onEdit,
}: {
  habit: HabitView;
  days: string[];
  today: string;
  from: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [done, setDone] = React.useState(() => new Set(habit.doneDays));
  React.useEffect(() => setDone(new Set(habit.doneDays)), [habit.doneDays]);

  const toggle = async (day: string) => {
    const value = !done.has(day);
    setDone((s) => {
      const n = new Set(s);
      if (value) n.add(day);
      else n.delete(day);
      return n;
    });
    const r = await setHabitEntryAction(habit.id, day, value);
    if (!r.ok) {
      toast.error(r.error);
      setDone(new Set(habit.doneDays));
    } else router.refresh();
  };

  return (
    <>
      <tr className="border-b border-border last:border-0">
        <td className="px-4 py-2">
          <button type="button" onClick={onToggleExpand} className="grid text-left" aria-expanded={expanded}>
            <span className="flex items-center gap-2 font-medium">
              <span className="size-2.5 rounded-full" style={{ background: habit.color ?? habit.workspace.color }} aria-hidden />
              {habit.name}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <WsDot color={habit.workspace.color} className="size-2" /> {habit.workspace.name} · {frequencyLabel(habit)}
              {habit.category && ` · ${habit.category}`}
            </span>
          </button>
        </td>
        {days.map((d) => {
          const on = done.has(d);
          const expected = expectedOn(habit, d);
          return (
            <td key={d} className="px-1 py-2 text-center">
              <button
                type="button"
                disabled={!habit.active}
                aria-pressed={on}
                aria-label={`${habit.name} em ${d.split("-").reverse().join("/")}: ${on ? "feito" : "não feito"}`}
                onClick={() => toggle(d)}
                className={cn(
                  "mx-auto grid size-8 place-items-center rounded-full border transition-colors disabled:cursor-default",
                  on ? "border-transparent bg-success text-white" : expected ? "border-border hover:border-success/60 hover:bg-success-soft" : "border-dashed border-border/70 opacity-60",
                  d === today && !on && "ring-2 ring-ring/30",
                )}
              >
                {on && <Check className="size-4" />}
              </button>
            </td>
          );
        })}
        <td className="px-3 py-2 text-right tabular">
          {habit.stats.rate === null ? <span className="text-muted-foreground">—</span> : (
            <span title={`${habit.stats.done} de ${habit.stats.expected}`} className={cn("font-medium", habit.stats.rate >= 80 ? "text-success" : habit.stats.rate < 50 ? "text-danger" : "")}>
              {habit.stats.rate}%
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-right tabular">
          <span className="inline-flex items-center gap-1">
            {habit.stats.streak > 0 && <Flame className="size-3.5 text-warning" />}
            {habit.stats.streak} {habit.frequency === "WEEKLY" ? "sem." : "d"}
          </span>
        </td>
        <td className="px-2 py-2">
          <DropdownMenu>
            <DropdownMenuTrigger className="grid size-8 place-items-center rounded-md hover:bg-accent" aria-label={`Ações de ${habit.name}`}>
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit}><Pencil /> Editar</DropdownMenuItem>
              <DropdownMenuItem
                onSelect={async () => {
                  const r = await setHabitActiveAction(habit.id, !habit.active);
                  if (!r.ok) return toast.error(r.error);
                  toast.success(r.message);
                }}
              >
                {habit.active ? <><Archive /> Arquivar</> : <><ArchiveRestore /> Reativar</>}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-danger"
                onSelect={async () => {
                  if (!(await confirm({ title: `Excluir “${habit.name}”?`, description: "O histórico de marcações também será apagado. Para manter o histórico, prefira arquivar.", confirmLabel: "Excluir", danger: true }))) return;
                  const r = await deleteHabitAction(habit.id);
                  if (!r.ok) return toast.error(r.error);
                  toast.success(r.message);
                }}
              >
                <Trash2 /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border bg-muted/30">
          <td colSpan={days.length + 4} className="px-4 py-3">
            <HabitCalendar habit={habit} done={done} from={from} today={today} />
          </td>
        </tr>
      )}
    </>
  );
}

/** Calendário do período: semanas em linhas, dias em colunas. */
function HabitCalendar({ habit, done, from, today }: { habit: HabitView; done: Set<string>; from: string; today: string }) {
  const firstMonday = addDaysYmd(from, -((weekdayOfYmd(from) + 6) % 7));
  const days = eachDayYmd(firstMonday, today);
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="grid gap-1" role="grid" aria-label={`Histórico de ${habit.name}`}>
        <div className="grid grid-cols-7 gap-1 text-[10px] text-muted-foreground">
          {["S", "T", "Q", "Q", "S", "S", "D"].map((d, i) => <span key={i} className="w-5 text-center">{d}</span>)}
        </div>
        {weeks.map((w, i) => (
          <div key={i} className="grid grid-cols-7 gap-1" role="row">
            {w.map((d) => {
              const inRange = d >= from && d <= today;
              const on = done.has(d);
              return (
                <span
                  key={d}
                  role="gridcell"
                  title={`${d.split("-").reverse().join("/")}${on ? " · feito" : ""}`}
                  className={cn(
                    "size-5 rounded",
                    !inRange ? "bg-transparent" : on ? "bg-success" : expectedOn(habit, d) ? "bg-muted ring-1 ring-border" : "bg-muted/40",
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>
      <dl className="grid gap-1 text-sm">
        <div><dt className="inline text-muted-foreground">Realizado: </dt><dd className="inline font-medium tabular">{habit.stats.done} de {habit.stats.expected} esperados</dd></div>
        <div><dt className="inline text-muted-foreground">Percentual: </dt><dd className="inline font-medium tabular">{habit.stats.rate === null ? "—" : `${habit.stats.rate}%`}</dd></div>
        <div><dt className="inline text-muted-foreground">Sequência atual: </dt><dd className="inline font-medium tabular">{habit.stats.streak}</dd></div>
        <p className="mt-2 max-w-xs text-xs text-muted-foreground">
          {habit.frequency === "WEEKLY" ? "A meta semanal só é cobrada quando a semana termina." : "O dia de hoje só conta depois de marcado."}
        </p>
      </dl>
    </div>
  );
}

function HabitDialog({ habit, workspaces, onClose }: { habit: HabitView | null; workspaces: Ws[]; onClose: () => void }) {
  const defaultWs = workspaces.find((w) => w.kind === "PESSOAL")?.id ?? workspaces[0]?.id ?? "";
  const [values, setValues] = React.useState({
    workspaceId: habit?.workspace.id ?? defaultWs,
    name: habit?.name ?? "",
    category: habit?.category ?? "",
    frequency: (habit?.frequency ?? "DAILY") as "DAILY" | "WEEKLY" | "CUSTOM",
    daysOfWeek: habit?.daysOfWeek ?? [1, 3, 5],
    timesPerWeek: habit?.timesPerWeek ?? 3,
    color: habit?.color ?? "#A66F7C",
  });
  const [saving, setSaving] = React.useState(false);
  const set = <K extends keyof typeof values>(k: K, v: (typeof values)[K]) => setValues((p) => ({ ...p, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const input = { ...values, category: values.category || null };
    const r = habit ? await updateHabitAction(habit.id, input) : await createHabitAction(input);
    setSaving(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(r.message);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{habit ? "Editar hábito" : "Novo hábito"}</DialogTitle>
          <DialogDescription>Defina com que frequência ele deve acontecer.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-4">
          <Field label="Nome" htmlFor="hb-name">
            <Input id="hb-name" value={values.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Ler 20 páginas" required autoFocus maxLength={80} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Categoria" htmlFor="hb-cat">
              <Input id="hb-cat" list="hb-cats" value={values.category} onChange={(e) => set("category", e.target.value)} maxLength={40} />
              <datalist id="hb-cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
            <Field label="Ambiente" htmlFor="hb-ws">
              <Select id="hb-ws" value={values.workspaceId} onChange={(e) => set("workspaceId", e.target.value)}>
                {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </Field>
            <Field label="Frequência" htmlFor="hb-freq">
              <Select id="hb-freq" value={values.frequency} onChange={(e) => set("frequency", e.target.value as typeof values.frequency)}>
                <option value="DAILY">Todos os dias</option>
                <option value="CUSTOM">Dias específicos da semana</option>
                <option value="WEEKLY">X vezes por semana</option>
              </Select>
            </Field>
            {values.frequency === "WEEKLY" && (
              <Field label="Vezes por semana" htmlFor="hb-times">
                <Input id="hb-times" type="number" min={1} max={7} value={values.timesPerWeek} onChange={(e) => set("timesPerWeek", Math.min(7, Math.max(1, Number(e.target.value) || 1)))} />
              </Field>
            )}
            <Field label="Cor" htmlFor="hb-color">
              <input id="hb-color" type="color" value={values.color} onChange={(e) => set("color", e.target.value)} className="h-9 w-16 cursor-pointer rounded-md border border-input bg-card p-1" />
            </Field>
          </div>
          {values.frequency === "CUSTOM" && (
            <div className="flex gap-1" role="group" aria-label="Dias da semana">
              {WEEKDAY_SHORT.map((d, i) => {
                const on = values.daysOfWeek.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={on}
                    aria-label={WEEKDAY_NAME[i]}
                    onClick={() => set("daysOfWeek", on ? values.daysOfWeek.filter((x) => x !== i) : [...values.daysOfWeek, i])}
                    className={cn("size-9 rounded-full text-xs font-medium", on ? "bg-primary text-primary-foreground" : "bg-card ring-1 ring-border hover:bg-accent")}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving || !values.name.trim()}>{saving ? "Salvando…" : "Salvar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
