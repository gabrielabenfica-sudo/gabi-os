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

// ── Meses ──────────────────────────────────────────────────────

/** Soma meses a uma data "YYYY-MM-DD", ajustando o dia ao fim do mês (31/01 + 1 → 28/02). */
export function addMonthsYmd(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** "YYYY-MM" de uma data "YYYY-MM-DD". */
export function ymOf(ymd: string): string {
  return ymd.slice(0, 7);
}

export function addMonthsYm(ym: string, months: number): string {
  return addMonthsYmd(`${ym}-01`, months).slice(0, 7);
}

/** Dia "d" do mês "YYYY-MM", limitado ao último dia. */
export function dayOfMonthYmd(ym: string, day: number): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(Math.min(Math.max(1, day), last)).padStart(2, "0")}`;
}

const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "2026-10" → "outubro de 2026" (ou "out/2026" no formato curto). */
export function formatYm(ym: string, short = false): string {
  const name = MONTH_NAMES[Number(ym.slice(5, 7)) - 1] ?? "";
  return short ? `${name.slice(0, 3)}/${ym.slice(0, 4)}` : `${name} de ${ym.slice(0, 4)}`;
}

export function isValidYm(ym: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(ym);
}
