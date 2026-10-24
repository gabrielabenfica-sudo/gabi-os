import type { Occurrence, Conflict } from "@/server/calendar";

export type { Occurrence, Conflict };

export type AgendaWs = { id: string; name: string; color: string };
export type TaskRef = { id: string; title: string; workspaceId: string };
export type ProjectRef = { id: string; name: string; workspaceId: string };

/** Data e hora de parede de um instante no fuso informado. */
export function partsInTz(date: Date, tz: string): { ymd: string; hm: string } {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  return { ymd, hm };
}

export function timeRange(o: { start: Date | string; end: Date | string; allDay: boolean }, tz: string): string {
  if (o.allDay) return "Dia inteiro";
  const s = partsInTz(new Date(o.start), tz);
  const e = partsInTz(new Date(o.end), tz);
  return s.ymd === e.ymd ? `${s.hm}–${e.hm}` : `${s.hm} → ${e.ymd.split("-").reverse().slice(0, 2).join("/")} ${e.hm}`;
}

export const REMINDER_OPTIONS = [
  { value: "", label: "Sem lembrete" },
  { value: "0", label: "Na hora" },
  { value: "5", label: "5 minutos antes" },
  { value: "10", label: "10 minutos antes" },
  { value: "15", label: "15 minutos antes" },
  { value: "30", label: "30 minutos antes" },
  { value: "60", label: "1 hora antes" },
  { value: "120", label: "2 horas antes" },
  { value: "1440", label: "1 dia antes" },
];
