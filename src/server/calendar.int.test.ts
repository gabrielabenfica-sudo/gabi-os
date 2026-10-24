import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { listWorkspaces } from "@/server/workspaces";
import { createEvent, deleteEvent, listOccurrences, rescheduleEvent, setEventStatus, updateEvent, type EventInput } from "./calendar";
import { createTestUser } from "../../tests/factories";

const TZ = "America/Sao_Paulo";

async function setup() {
  const user = await createTestUser();
  const [turbo, pessoal, mentoria] = await listWorkspaces(user.id);
  return { user, turbo: turbo!, pessoal: pessoal!, mentoria: mentoria! };
}

const ev = (workspaceId: string, over: Partial<EventInput> = {}): EventInput => ({
  workspaceId, title: "Gravação", allDay: false, startDate: "2026-11-03", startTime: "09:00", endDate: "2026-11-03", endTime: "10:00", ...over,
});

describe("agenda: conflitos entre ambientes", () => {
  it("detecta sobreposição com compromisso de OUTRO ambiente e só salva com confirmação", async () => {
    const { user, turbo, mentoria } = await setup();
    const first = await createEvent(user.id, ev(turbo.id), TZ);
    expect(first.saved).toBe(true);

    const clash = await createEvent(user.id, ev(mentoria.id, { title: "Sessão de mentoria", startTime: "09:30", endTime: "11:00" }), TZ);
    expect(clash.saved).toBe(false);
    expect(clash.conflicts).toHaveLength(1);
    expect(clash.conflicts[0]).toMatchObject({ title: "Gravação", workspace: { name: "Trabalho TURBO" } });
    expect(await db.calendarEvent.count()).toBe(1);

    const forced = await createEvent(user.id, ev(mentoria.id, { title: "Sessão", startTime: "09:30", endTime: "11:00" }), TZ, { allowConflict: true });
    expect(forced.saved).toBe(true);
    expect(await db.calendarEvent.count()).toBe(2);
  });

  it("horários encostados não conflitam; eventos livres, de dia inteiro e cancelados não bloqueiam", async () => {
    const { user, turbo, pessoal } = await setup();
    await createEvent(user.id, ev(turbo.id), TZ);
    expect((await createEvent(user.id, ev(pessoal.id, { startTime: "10:00", endTime: "11:00" }), TZ)).saved).toBe(true);

    await createEvent(user.id, ev(pessoal.id, { title: "Livre", startTime: "14:00", endTime: "15:00", transparency: "FREE" }), TZ);
    expect((await createEvent(user.id, ev(turbo.id, { startTime: "14:00", endTime: "15:00" }), TZ)).saved).toBe(true);

    await createEvent(user.id, ev(pessoal.id, { title: "Aniversário", allDay: true, startTime: undefined, endTime: undefined }), TZ);
    expect((await createEvent(user.id, ev(turbo.id, { startTime: "16:00", endTime: "17:00" }), TZ)).saved).toBe(true);

    const c = await createEvent(user.id, ev(turbo.id, { startTime: "18:00", endTime: "19:00" }), TZ);
    if (c.saved) await setEventStatus(user.id, c.event.id, "CANCELLED");
    expect((await createEvent(user.id, ev(pessoal.id, { startTime: "18:00", endTime: "19:00" }), TZ)).saved).toBe(true);
  });

  it("considera ocorrências de séries recorrentes", async () => {
    const { user, turbo, pessoal } = await setup();
    await createEvent(user.id, ev(pessoal.id, { title: "Academia", startTime: "07:00", endTime: "08:00", rrule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=TU,TH" }), TZ);
    // 2026-11-12 é quinta
    const r = await createEvent(user.id, ev(turbo.id, { startDate: "2026-11-12", endDate: "2026-11-12", startTime: "07:30", endTime: "08:30" }), TZ);
    expect(r.saved).toBe(false);
    expect(r.conflicts[0]!.title).toBe("Academia");
    // Sexta não conflita
    expect((await createEvent(user.id, ev(turbo.id, { startDate: "2026-11-13", endDate: "2026-11-13", startTime: "07:30", endTime: "08:30" }), TZ)).saved).toBe(true);
  });

  it("edição e reagendamento não conflitam consigo mesmos", async () => {
    const { user, turbo, pessoal } = await setup();
    const a = await createEvent(user.id, ev(turbo.id), TZ);
    if (!a.saved) throw new Error();
    expect((await updateEvent(user.id, a.event.id, ev(turbo.id, { endTime: "10:30" }), TZ)).saved).toBe(true);
    const b = await createEvent(user.id, ev(pessoal.id, { startTime: "11:00", endTime: "12:00" }), TZ);
    if (!b.saved) throw new Error();
    const moved = await rescheduleEvent(user.id, b.event.id, { start: "2026-11-03T13:00:00.000Z", end: "2026-11-03T14:00:00.000Z", allDay: false });
    expect(moved.saved).toBe(false); // 10:00–11:00 em SP sobrepõe 09:00–10:30
  });
});

describe("agenda: visualização e status", () => {
  it("lista ocorrências de todos os ambientes, filtra por ambiente e respeita exclusão", async () => {
    const { user, turbo, pessoal } = await setup();
    await createEvent(user.id, ev(turbo.id), TZ);
    const p = await createEvent(user.id, ev(pessoal.id, { startTime: "12:00", endTime: "13:00", rrule: "FREQ=DAILY;INTERVAL=1;COUNT=3" }), TZ);
    const from = new Date("2026-11-01T00:00:00Z");
    const to = new Date("2026-11-30T00:00:00Z");
    expect(await listOccurrences(user.id, from, to)).toHaveLength(4);
    expect(await listOccurrences(user.id, from, to, turbo.id)).toHaveLength(1);
    if (p.saved) await deleteEvent(user.id, p.event.id);
    expect(await listOccurrences(user.id, from, to)).toHaveLength(1);
  });

  it("guarda horários no fuso correto e não conclui automaticamente", async () => {
    const { user, turbo } = await setup();
    const r = await createEvent(user.id, ev(turbo.id, { startDate: "2020-01-10", endDate: "2020-01-10" }), TZ);
    if (!r.saved) throw new Error();
    expect(r.event.start.toISOString()).toBe("2020-01-10T12:00:00.000Z");
    expect(r.event.status).toBe("NOT_STARTED");
    const fresh = await db.calendarEvent.findUniqueOrThrow({ where: { id: r.event.id } });
    expect(fresh.status).toBe("NOT_STARTED");
  });

  it("outra usuária não vê nem altera compromissos", async () => {
    const { user, turbo } = await setup();
    const intruder = await createTestUser();
    const r = await createEvent(user.id, ev(turbo.id), TZ);
    if (!r.saved) throw new Error();
    expect(await listOccurrences(intruder.id, new Date("2026-11-01"), new Date("2026-12-01"))).toHaveLength(0);
    await expect(setEventStatus(intruder.id, r.event.id, "DONE")).rejects.toThrow();
    // E os compromissos dela não geram conflito para a outra
    expect((await createEvent(intruder.id, ev((await listWorkspaces(intruder.id))[0]!.id), TZ)).saved).toBe(true);
  });
});
