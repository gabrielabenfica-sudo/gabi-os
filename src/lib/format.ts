import { format, parseISO, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";

export const WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
export const WEEKDAYS_LONG = [
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
  "domingo",
];

export function toDate(value?: string | Date | null) {
  if (!value) return null;
  const date = typeof value === "string" ? parseISO(value) : value;
  return isValid(date) ? date : null;
}

export function formatDate(value?: string | Date | null, pattern = "dd 'de' MMMM") {
  const date = toDate(value);
  return date ? format(date, pattern, { locale: ptBR }) : "—";
}

export function formatShortDate(value?: string | Date | null) {
  return formatDate(value, "dd/MM");
}

export function formatTime(value?: string | null) {
  const date = toDate(value);
  return date ? format(date, "HH:mm") : "—";
}

export function formatCurrency(cents?: number | null) {
  if (cents === null || cents === undefined) return "—";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatNumber(value?: number | null) {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("pt-BR");
}

export function todayISO() {
  return format(new Date(), "yyyy-MM-dd");
}

export function dateOnly(value?: string | Date | null) {
  const date = toDate(value);
  return date ? format(date, "yyyy-MM-dd") : null;
}

export function weekdayIndex(value: string | Date) {
  const date = toDate(value);
  if (!date) return 0;
  return (date.getDay() + 6) % 7;
}

/** Minutes since midnight for a "HH:mm:ss" or "HH:mm" string. */
export function timeToMinutes(time?: string | null) {
  if (!time) return 0;
  const [hours, minutes] = time.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

export function minutesToTime(minutes: number) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function rruleLabel(rrule?: string | null) {
  if (!rrule) return "Uma vez";
  const dayMap: Record<string, string> = {
    MO: "seg",
    TU: "ter",
    WE: "qua",
    TH: "qui",
    FR: "sex",
    SA: "sáb",
    SU: "dom",
  };
  const byDay = rrule.split(";").find((part) => part.startsWith("BYDAY="));
  if (byDay) {
    const days = byDay.replace("BYDAY=", "").split(",").map((day) => dayMap[day] ?? day);
    if (days.length === 5 && days.join() === "seg,ter,qua,qui,sex") return "Dias úteis";
    return `Toda semana · ${days.join(", ")}`;
  }
  return "Toda semana";
}

export function initials(name?: string | null) {
  if (!name) return "G";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export const PRIORITY_META: Record<string, { label: string; className: string }> = {
  URGENT: { label: "Urgente", className: "bg-destructive/10 text-destructive border-destructive/20" },
  HIGH: { label: "Alta", className: "bg-rose-100 text-rose-800 border-rose-200" },
  MEDIUM: { label: "Média", className: "bg-secondary text-secondary-foreground border-border" },
  LOW: { label: "Baixa", className: "bg-muted text-muted-foreground border-border" },
};

export const TIME_ZONE = "America/Sao_Paulo";

/** Calendar date (yyyy-MM-dd) of an instant, always in São Paulo time. */
export function dateInZone(value?: string | Date | null) {
  const date = toDate(value);
  if (!date) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Minutes since midnight of an instant, always in São Paulo time. */
export function minutesInZone(value?: string | Date | null) {
  const date = toDate(value);
  if (!date) return 0;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hours = Number(parts.find((part) => part.type === "hour")?.value ?? 0) % 24;
  const minutes = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hours * 60 + minutes;
}

export function formatTimeZoned(value?: string | Date | null) {
  const minutes = minutesInZone(value);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
