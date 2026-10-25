/** Conversão entre eventos do Google Calendar e compromissos do app (pura, testável). */

export type GoogleEvent = {
  id: string;
  status?: "confirmed" | "tentative" | "cancelled";
  etag?: string;
  updated?: string;
  summary?: string;
  description?: string;
  location?: string;
  transparency?: "opaque" | "transparent";
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  attendees?: { email?: string; self?: boolean; resource?: boolean }[];
  reminders?: { useDefault?: boolean; overrides?: { method: string; minutes: number }[] };
  recurringEventId?: string;
  originalStartTime?: { date?: string; dateTime?: string };
  recurrence?: string[];
};

export type LocalEventFields = {
  title: string;
  description: string | null;
  location: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
  timezone: string;
  transparency: "BUSY" | "FREE";
  attendees: string[] | null;
  reminderMinutes: number | null;
  externalEtag: string | null;
  externalUpdatedAt: Date | null;
  recurringExternalId: string | null;
  originalStart: Date | null;
};

const dateOnly = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

/** Google → app. Retorna null para eventos cancelados ou sem data. */
export function fromGoogle(e: GoogleEvent, defaultTz: string): LocalEventFields | null {
  if (e.status === "cancelled" || !e.start || !e.end) return null;
  const allDay = !!e.start.date;
  let start: Date;
  let end: Date;
  if (allDay) {
    // Dia inteiro no Google já usa fim exclusivo, igual ao app
    start = dateOnly(e.start.date!);
    end = dateOnly(e.end.date ?? e.start.date!);
    if (end <= start) end = new Date(start.getTime() + 86_400_000);
  } else {
    if (!e.start.dateTime || !e.end.dateTime) return null;
    start = new Date(e.start.dateTime);
    end = new Date(e.end.dateTime);
    if (!(end > start)) end = new Date(start.getTime() + 30 * 60_000);
  }
  const attendees = (e.attendees ?? []).filter((a) => a.email && !a.self && !a.resource).map((a) => a.email!);
  const override = e.reminders?.useDefault ? null : e.reminders?.overrides?.find((o) => o.method === "popup") ?? e.reminders?.overrides?.[0];
  const orig = e.originalStartTime?.dateTime ?? (e.originalStartTime?.date ? `${e.originalStartTime.date}T00:00:00Z` : null);
  return {
    title: (e.summary ?? "").trim().slice(0, 300) || "(sem título)",
    description: e.description ? e.description.slice(0, 10000) : null,
    location: e.location ? e.location.slice(0, 500) : null,
    start,
    end,
    allDay,
    timezone: e.start.timeZone || defaultTz,
    transparency: e.transparency === "transparent" ? "FREE" : "BUSY",
    attendees: attendees.length ? attendees.slice(0, 100) : null,
    reminderMinutes: override ? override.minutes : null,
    externalEtag: e.etag ?? null,
    externalUpdatedAt: e.updated ? new Date(e.updated) : null,
    recurringExternalId: e.recurringEventId ?? null,
    originalStart: orig ? new Date(orig) : null,
  };
}

export type LocalEventForPush = {
  title: string;
  description: string | null;
  location: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
  timezone: string;
  transparency: string;
  attendees: unknown;
  reminderMinutes: number | null;
  rrule: string | null;
  status: string;
};

/** App → Google (corpo para insert/patch). */
export function toGoogle(ev: LocalEventForPush): Record<string, unknown> {
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const body: Record<string, unknown> = {
    summary: ev.title,
    description: ev.description ?? "",
    location: ev.location ?? "",
    transparency: ev.transparency === "FREE" ? "transparent" : "opaque",
    start: ev.allDay ? { date: ymd(ev.start) } : { dateTime: ev.start.toISOString(), timeZone: ev.timezone },
    end: ev.allDay ? { date: ymd(ev.end) } : { dateTime: ev.end.toISOString(), timeZone: ev.timezone },
    reminders: ev.reminderMinutes == null ? { useDefault: true } : { useDefault: false, overrides: [{ method: "popup", minutes: ev.reminderMinutes }] },
  };
  if (Array.isArray(ev.attendees)) body.attendees = (ev.attendees as unknown[]).filter((a): a is string => typeof a === "string" && a.includes("@")).map((email) => ({ email }));
  if (ev.rrule) body.recurrence = [`RRULE:${ev.rrule.replace(/^RRULE:/, "")}`];
  // O status do app (concluído, cancelado…) é controle pessoal e não é enviado:
  // cancelar no Google apagaria o evento lá.
  return body;
}
