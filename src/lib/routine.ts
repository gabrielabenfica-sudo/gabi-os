/** Regras puras da rotina do dia (ordenação, conflitos, progresso). */

export type RoutineLike = { id: string; startTime: string | null; endTime: string | null; title: string; done?: boolean };

export const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
export const WEEKDAY_NAME = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"] as const;

/** "HH:MM" → minutos desde 00:00. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Itens com horário primeiro, em ordem de início; depois os "sem horário", na ordem em que vieram. */
export function sortRoutine<T extends RoutineLike>(items: T[]): T[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const sa = a.item.startTime, sb = b.item.startTime;
      if (sa && sb) return sa === sb ? (a.item.endTime ?? "").localeCompare(b.item.endTime ?? "") || a.i - b.i : sa.localeCompare(sb);
      if (sa) return -1;
      if (sb) return 1;
      return a.i - b.i;
    })
    .map((x) => x.item);
}

/**
 * Ids dos blocos que se sobrepõem a outro. Só contam blocos com início e fim;
 * encostar (um termina 10:00, outro começa 10:00) não é conflito.
 */
export function findOverlaps(items: RoutineLike[]): Set<string> {
  const blocks = items
    .filter((i) => i.startTime && i.endTime && toMinutes(i.endTime) > toMinutes(i.startTime))
    .map((i) => ({ id: i.id, s: toMinutes(i.startTime!), e: toMinutes(i.endTime!) }))
    .sort((a, b) => a.s - b.s);
  const out = new Set<string>();
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length && blocks[j]!.s < blocks[i]!.e; j++) {
      out.add(blocks[i]!.id);
      out.add(blocks[j]!.id);
    }
  }
  return out;
}

/** "1h30", "45 min" — ou null quando não há início e fim válidos. */
export function durationLabel(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const mins = toMinutes(end) - toMinutes(start);
  if (mins <= 0) return null;
  const h = Math.floor(mins / 60), m = mins % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

/** Concluídos / total e percentual inteiro. */
export function routineProgress(items: { done?: boolean }[]) {
  const total = items.length;
  const done = items.filter((i) => i.done).length;
  return { done, total, percent: total ? Math.round((done * 100) / total) : 0 };
}

/** Chave para não duplicar um bloco ao aplicar a rotina padrão ou copiar outro dia. */
export function routineKey(i: { title: string; startTime: string | null }) {
  return `${i.startTime ?? "--:--"}|${i.title.trim().toLocaleLowerCase("pt-BR")}`;
}

/** Texto curto dos dias da semana de um modelo ("Todos os dias", "Seg a Sex", "Seg, Qua"). */
export function weekdaysLabel(days: number[]): string {
  const set = [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  if (set.length === 7) return "Todos os dias";
  if (set.length === 5 && [1, 2, 3, 4, 5].every((d) => set.includes(d))) return "Seg a Sex";
  if (set.length === 2 && set.includes(0) && set.includes(6)) return "Fins de semana";
  if (!set.length) return "Nenhum dia";
  return set.map((d) => WEEKDAY_SHORT[d]).join(", ");
}

/** "segunda-feira, 26 de outubro de 2026" para uma data "YYYY-MM-DD". */
export function longDate(ymd: string) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ymd}T12:00:00Z`));
}
