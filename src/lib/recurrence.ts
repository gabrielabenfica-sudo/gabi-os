import { eachDayOfInterval, format } from "date-fns";
import { dateInZone, minutesInZone } from "./format";
import type { CalendarEvent } from "./types";

const DAY_MAP: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

export type Occurrence = CalendarEvent & { occurrence_date: string };

/**
 * Expands weekly recurring events across the visible range.
 * Times are computed in São Paulo wall-clock time so the agenda never shifts
 * with the device time zone.
 */
export function expandEvents(
  events: CalendarEvent[],
  rangeStart: Date,
  rangeEnd: Date,
): Occurrence[] {
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
  const result: Occurrence[] = [];

  events.forEach((event) => {
    const startMinutes = minutesInZone(event.start_at);
    const endMinutes = minutesInZone(event.end_at);
    const durationMinutes = (endMinutes > startMinutes ? endMinutes - startMinutes : 60) || 60;
    const firstDate = dateInZone(event.start_at);

    const buildStart = (day: Date) =>
      new Date(
        Date.UTC(
          day.getFullYear(),
          day.getMonth(),
          day.getDate(),
          Math.floor(startMinutes / 60) + 3,
          startMinutes % 60,
        ),
      );

    if (!event.rrule) {
      result.push({
        ...event,
        occurrence_date: format(dayOf(event.start_at), "yyyy-MM-dd"),
      });
      return;
    }

    const byDayPart = event.rrule.split(";").find((part) => part.startsWith("BYDAY="));
    const allowedDays = byDayPart
      ? byDayPart
          .replace("BYDAY=", "")
          .split(",")
          .map((code) => DAY_MAP[code])
          .filter((day) => day !== undefined)
      : [dayOf(event.start_at).getDay()];

    days.forEach((day) => {
      const iso = format(day, "yyyy-MM-dd");
      if (firstDate && iso < firstDate) return;
      if (!allowedDays.includes(day.getDay())) return;

      const start = buildStart(day);
      result.push({
        ...event,
        start_at: start.toISOString(),
        end_at: new Date(start.getTime() + durationMinutes * 60_000).toISOString(),
        occurrence_date: iso,
      });
    });
  });

  return result.sort((a, b) => a.start_at.localeCompare(b.start_at));
}

/** The São Paulo calendar day of an instant, expressed as a device-local date. */
function dayOf(value: string) {
  const iso = dateInZone(value) ?? format(new Date(value), "yyyy-MM-dd");
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}
