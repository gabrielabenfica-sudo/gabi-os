import { eachDayYmd, weekdayOfYmd } from "@/lib/dates";

/** Horário "HH:MM" (00:00–23:59). */
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export type DayPeriod = "MANHA" | "TARDE" | "NOITE";

export const PERIOD_LABEL: Record<DayPeriod, string> = { MANHA: "Manhã", TARDE: "Tarde", NOITE: "Noite" };

/** Manhã até 11:59, tarde até 17:59, noite a partir das 18:00. */
export function periodOf(time: string): DayPeriod {
  if (time < "12:00") return "MANHA";
  if (time < "18:00") return "TARDE";
  return "NOITE";
}

export type ScheduleItemLike = {
  id: string;
  /** Dia (no fuso da usuária) em que o item entrou na rotina */
  createdYmd: string;
  /** Dia em que saiu da rotina (deixa de valer a partir dele), ou null */
  archivedYmd: string | null;
};

export type ScheduleLike = {
  daysOfWeek: number[];
  items: ScheduleItemLike[];
};

/** A rotina vale neste dia da semana? */
export function appliesOn(routine: Pick<ScheduleLike, "daysOfWeek">, ymd: string): boolean {
  return routine.daysOfWeek.includes(weekdayOfYmd(ymd));
}

/** O item fazia parte da rotina neste dia? */
export function itemActiveOn(item: ScheduleItemLike, ymd: string): boolean {
  return item.createdYmd <= ymd && (item.archivedYmd === null || ymd < item.archivedYmd);
}

export const checkKey = (itemId: string, ymd: string) => `${itemId}:${ymd}`;

export type ScheduleStats = {
  expected: number;
  done: number;
  /** 0–100, ou null quando nada era esperado no período */
  rate: number | null;
};

/**
 * Percentual da rotina do dia cumprido no período.
 * Dias futuros não contam; hoje só conta o que já foi marcado (o dia ainda não acabou).
 * Item não marcado reduz o percentual, mas não vira pendência.
 */
export function computeScheduleStats(routines: ScheduleLike[], checks: Set<string>, from: string, to: string, today: string): ScheduleStats {
  const end = to < today ? to : today;
  let expected = 0;
  let done = 0;
  if (from <= end) {
    for (const d of eachDayYmd(from, end)) {
      for (const r of routines) {
        if (!appliesOn(r, d)) continue;
        for (const item of r.items) {
          if (!itemActiveOn(item, d)) continue;
          const checked = checks.has(checkKey(item.id, d));
          if (d === today && !checked) continue;
          expected += 1;
          if (checked) done += 1;
        }
      }
    }
  }
  return { expected, done, rate: expected ? Math.round((done / expected) * 100) : null };
}

/** Duração legível entre início e fim de uma execução. */
export function durationLabel(start: Date, end: Date): string {
  const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h >= 24) return `${Math.floor(h / 24)} d ${h % 24} h`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
