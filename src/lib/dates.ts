import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const DEFAULT_TZ = "America/Sao_Paulo";

/** Data atual no fuso da usuária. */
export function nowIn(tz: string = DEFAULT_TZ): TZDate {
  return TZDate.tz(tz);
}

export function formatDateBR(date: Date, tz: string = DEFAULT_TZ): string {
  return format(new TZDate(date, tz), "dd/MM/yyyy", { locale: ptBR });
}

export function formatDateTimeBR(date: Date, tz: string = DEFAULT_TZ): string {
  return format(new TZDate(date, tz), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

export function formatLongDateBR(date: Date, tz: string = DEFAULT_TZ): string {
  return format(new TZDate(date, tz), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
}

export function greetingFor(date: Date, tz: string = DEFAULT_TZ): string {
  const hour = new TZDate(date, tz).getHours();
  if (hour < 5) return "Boa noite";
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

/** Valida um identificador de fuso IANA. */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ── Datas de calendário (sem hora) ─────────────────────────────
// Prazos, hábitos e competências são guardados como meia-noite UTC do dia
// (ex.: 2026-10-23T00:00:00Z). Assim a data nunca "muda de dia" com o fuso.

/** "YYYY-MM-DD" de hoje no fuso da usuária. */
export function todayYmd(tz: string = DEFAULT_TZ, now: Date = new Date()): string {
  return ymdInTz(now, tz);
}

/** "YYYY-MM-DD" de um instante, no fuso informado. */
export function ymdInTz(date: Date, tz: string = DEFAULT_TZ): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return parts; // en-CA já formata como YYYY-MM-DD
}

/** "YYYY-MM-DD" → Date à meia-noite UTC. */
export function ymdToDate(ymd: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error(`Data inválida: ${ymd}`);
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** Date (meia-noite UTC) → "YYYY-MM-DD". */
export function dateToYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = ymdToDate(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return dateToYmd(d);
}

/** Dia da semana (0=domingo) de uma data "YYYY-MM-DD". */
export function weekdayOfYmd(ymd: string): number {
  return ymdToDate(ymd).getUTCDay();
}

/** Segunda-feira da semana de uma data. */
export function startOfWeekYmd(ymd: string): string {
  const wd = weekdayOfYmd(ymd);
  return addDaysYmd(ymd, wd === 0 ? -6 : 1 - wd);
}

export function startOfMonthYmd(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

export function endOfMonthYmd(ymd: string): string {
  const [y, m] = ymd.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ymd.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

/** Lista de datas entre início e fim (inclusive). */
export function eachDayYmd(start: string, end: string): string[] {
  const days: string[] = [];
  for (let d = start; d <= end; d = addDaysYmd(d, 1)) days.push(d);
  return days;
}

/** Instante UTC correspondente a "YYYY-MM-DD HH:mm" no fuso informado. */
export function zonedToUtc(ymd: string, hhmm: string, tz: string = DEFAULT_TZ): Date {
  const [y, mo, d] = ymd.split("-").map(Number) as [number, number, number];
  const [h, mi] = hhmm.split(":").map(Number) as [number, number];
  return new Date(new TZDate(y, mo - 1, d, h, mi, 0, tz).getTime());
}

export function formatYmdBR(ymd: string): string {
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
}
