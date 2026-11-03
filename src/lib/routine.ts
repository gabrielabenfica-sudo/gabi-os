import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { timeToMinutes, todayISO, weekdayIndex } from "./format";
import type { RoutineBlock, RoutineLog } from "./types";

export function blocksForDate(blocks: RoutineBlock[], dateISO: string) {
  const weekday = weekdayIndex(dateISO);
  return blocks
    .filter((block) => block.active && block.days.includes(weekday))
    .slice()
    .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
}

export function logKey(blockId: string, dateISO: string) {
  return `${blockId}::${dateISO}`;
}

export function logsMap(logs: RoutineLog[]) {
  const map = new Map<string, boolean>();
  logs.forEach((log) => map.set(logKey(log.block_id, log.log_date), log.done));
  return map;
}

export function adherence(blocks: RoutineBlock[], logs: RoutineLog[], dateISO: string) {
  const today = blocksForDate(blocks, dateISO);
  if (!today.length) return 0;
  const map = logsMap(logs);
  const done = today.filter((block) => map.get(logKey(block.id, dateISO))).length;
  return Math.round((done / today.length) * 100);
}

export function currentAndNext(blocks: RoutineBlock[], now = new Date()) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const today = blocksForDate(blocks, format(now, "yyyy-MM-dd"));
  const current = today.find(
    (block) => timeToMinutes(block.start_time) <= minutes && timeToMinutes(block.end_time) > minutes,
  );
  const next = today.find((block) => timeToMinutes(block.start_time) > minutes);
  return { current: current ?? null, next: next ?? null };
}

export function greeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 6) return "Boa madrugada";
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export function longToday(now = new Date()) {
  return format(now, "EEEE, d 'de' MMMM", { locale: ptBR });
}

export function weekDates(anchor = new Date()) {
  const weekday = weekdayIndex(anchor);
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - weekday);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return format(date, "yyyy-MM-dd");
  });
}

export const isToday = (dateISO: string) => dateISO === todayISO();
