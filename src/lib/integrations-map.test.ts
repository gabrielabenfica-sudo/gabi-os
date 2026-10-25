import { describe, expect, it } from "vitest";
import { fromGoogle, toGoogle } from "./google-calendar-map";
import { mapMediaType, normalizePermalink, pickInsight, titleFromCaption } from "./meta-map";

describe("Google Calendar ↔ app", () => {
  it("evento com horário, convidados e lembrete", () => {
    const f = fromGoogle(
      {
        id: "abc",
        status: "confirmed",
        etag: '"1"',
        updated: "2026-10-20T10:00:00Z",
        summary: " Reunião ",
        location: "Meet",
        start: { dateTime: "2026-10-21T09:00:00-03:00", timeZone: "America/Sao_Paulo" },
        end: { dateTime: "2026-10-21T10:00:00-03:00" },
        attendees: [{ email: "eu@x.com", self: true }, { email: "ana@x.com" }, { email: "sala@x.com", resource: true }],
        reminders: { useDefault: false, overrides: [{ method: "email", minutes: 60 }, { method: "popup", minutes: 10 }] },
        transparency: "transparent",
      },
      "America/Sao_Paulo",
    )!;
    expect(f).toMatchObject({ title: "Reunião", allDay: false, attendees: ["ana@x.com"], reminderMinutes: 10, transparency: "FREE", location: "Meet" });
    expect(f.start.toISOString()).toBe("2026-10-21T12:00:00.000Z");
    expect(f.end.toISOString()).toBe("2026-10-21T13:00:00.000Z");
  });

  it("dia inteiro usa fim exclusivo (igual ao app); cancelado não vira evento", () => {
    const f = fromGoogle({ id: "d", start: { date: "2026-10-21" }, end: { date: "2026-10-23" } }, "America/Sao_Paulo")!;
    expect(f.allDay).toBe(true);
    expect(f.start.toISOString()).toBe("2026-10-21T00:00:00.000Z");
    expect(f.end.toISOString()).toBe("2026-10-23T00:00:00.000Z");
    expect(f.title).toBe("(sem título)");
    expect(fromGoogle({ id: "x", status: "cancelled" }, "UTC")).toBeNull();
  });

  it("app → Google: dia inteiro, recorrência e lembrete; status não é enviado", () => {
    const body = toGoogle({
      title: "Plantão",
      description: null,
      location: null,
      start: new Date("2026-10-21T00:00:00Z"),
      end: new Date("2026-10-22T00:00:00Z"),
      allDay: true,
      timezone: "America/Sao_Paulo",
      transparency: "FREE",
      attendees: ["a@x.com", 3],
      reminderMinutes: 30,
      rrule: "FREQ=WEEKLY;INTERVAL=1",
      status: "CANCELLED",
    });
    expect(body).toMatchObject({
      summary: "Plantão",
      start: { date: "2026-10-21" },
      end: { date: "2026-10-22" },
      transparency: "transparent",
      recurrence: ["RRULE:FREQ=WEEKLY;INTERVAL=1"],
      reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 30 }] },
      attendees: [{ email: "a@x.com" }],
    });
    expect(body).not.toHaveProperty("status");
    const timed = toGoogle({ title: "x", description: null, location: null, start: new Date("2026-10-21T12:00:00Z"), end: new Date("2026-10-21T13:00:00Z"), allDay: false, timezone: "America/Sao_Paulo", transparency: "BUSY", attendees: null, reminderMinutes: null, rrule: null, status: "NOT_STARTED" });
    expect(timed).toMatchObject({ start: { dateTime: "2026-10-21T12:00:00.000Z", timeZone: "America/Sao_Paulo" }, reminders: { useDefault: true }, transparency: "opaque" });
  });
});

describe("Instagram", () => {
  it("lê métricas nos dois formatos da Graph API", () => {
    const list = [
      { name: "reach", total_value: { value: 1200 } },
      { name: "views", values: [{ value: 300 }, { value: 200 }] },
      { name: "follower_demographics", values: [{ value: { BR: 10 } }] },
    ];
    expect(pickInsight(list, "reach")).toBe(1200);
    expect(pickInsight(list, "views")).toBe(500);
    expect(pickInsight(list, "follower_demographics")).toBeNull();
    expect(pickInsight(list, "saves")).toBeNull();
  });
  it("formato, título e link", () => {
    expect(mapMediaType("VIDEO", "REELS")).toBe("REELS");
    expect(mapMediaType("CAROUSEL_ALBUM", "FEED")).toBe("CAROUSEL");
    expect(mapMediaType("IMAGE", "FEED")).toBe("STATIC");
    expect(titleFromCaption("\n  3 erros que travam sua venda\n#mentoria")).toBe("3 erros que travam sua venda");
    expect(titleFromCaption(null)).toBe("Publicação do Instagram");
    expect(normalizePermalink("https://instagram.com/reel/ABC/?igsh=x")).toBe("https://www.instagram.com/reel/ABC");
  });
});
