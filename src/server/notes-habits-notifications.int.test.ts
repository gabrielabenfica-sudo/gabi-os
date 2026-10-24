import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { listWorkspaces } from "@/server/workspaces";
import { createFolder, createNote, deleteFolder, extractPlainText, getNote, linkNote, listNotes, notesLinkedTo, updateNote } from "./notes";
import { createHabit, listHabits, setHabitEntry } from "./habits";
import { buildDailyDigest, generateDueNotifications, markAllRead, unreadCount, updatePrefs } from "./notifications";
import { createTask } from "./tasks";
import { createEvent } from "./calendar";
import { addFileAttachment, getAttachmentFile } from "./attachments";
import { createTestUser } from "../../tests/factories";
import { addDaysYmd, todayYmd } from "@/lib/dates";

const TZ = "America/Sao_Paulo";
const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

describe("anotações", () => {
  it("cria, salva automaticamente, busca no conteúdo e organiza em cadernos", async () => {
    const user = await createTestUser();
    const [turbo] = await listWorkspaces(user.id);
    const folder = await createFolder(user.id, { workspaceId: turbo!.id, name: "Reuniões" });
    const sub = await createFolder(user.id, { workspaceId: turbo!.id, name: "Marketing", parentId: folder.id });
    const note = await createNote(user.id, { workspaceId: turbo!.id, folderId: sub.id, title: "Pauta" });
    await updateNote(user.id, note.id, { content: doc("Definir orçamento de tráfego"), favorite: true });

    expect((await listNotes(user.id, { search: "orçamento" })).map((n) => n.id)).toEqual([note.id]);
    expect((await listNotes(user.id, { favorites: true })).length).toBe(1);

    await deleteFolder(user.id, folder.id);
    const after = await getNote(user.id, note.id);
    expect(after.folderId).toBeNull();
    expect(await db.noteFolder.count()).toBe(0);
  });

  it("recusa salvar por cima de versão mais nova", async () => {
    const user = await createTestUser();
    const [turbo] = await listWorkspaces(user.id);
    const note = await createNote(user.id, { workspaceId: turbo!.id });
    const old = note.updatedAt.toISOString();
    await new Promise((r) => setTimeout(r, 20));
    await updateNote(user.id, note.id, { title: "Aba 1" });
    await expect(updateNote(user.id, note.id, { title: "Aba 2", expectedUpdatedAt: old })).rejects.toThrow(/outra janela/);
  });

  it("vincula a tarefas e extrai texto de listas e tabelas", async () => {
    const user = await createTestUser();
    const [turbo] = await listWorkspaces(user.id);
    const task = await createTask(user.id, { workspaceId: turbo!.id, title: "Gravar" });
    const note = await createNote(user.id, { workspaceId: turbo!.id, title: "Roteiro" });
    await linkNote(user.id, note.id, "task", task.id);
    expect((await notesLinkedTo(user.id, "task", task.id)).map((n) => n.id)).toEqual([note.id]);
    expect((await getNote(user.id, note.id)).links[0]!.label).toBe("Gravar");
    const text = extractPlainText({
      type: "doc",
      content: [
        { type: "taskList", content: [{ type: "taskItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Item A" }] }] }] },
        { type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Célula" }] }] }] }] },
      ],
    });
    expect(text).toContain("Item A");
    expect(text).toContain("Célula");
  });
});

describe("hábitos", () => {
  it("marca e desmarca dias, não aceita futuro", async () => {
    const user = await createTestUser();
    const [, pessoal] = await listWorkspaces(user.id);
    const habit = await createHabit(user.id, { workspaceId: pessoal!.id, name: "Leitura", frequency: "DAILY" });
    const today = todayYmd(TZ);
    await setHabitEntry(user.id, habit.id, today, true, TZ);
    let [view] = await listHabits(user.id, { from: today, to: today }, TZ);
    expect(view!.doneToday).toBe(true);
    expect(view!.stats.rate).toBe(100);
    await setHabitEntry(user.id, habit.id, today, false, TZ);
    [view] = await listHabits(user.id, { from: today, to: today }, TZ);
    expect(view!.doneToday).toBe(false);
    await expect(setHabitEntry(user.id, habit.id, addDaysYmd(today, 1), true, TZ)).rejects.toThrow(/futuro/);
    await expect(createHabit(user.id, { workspaceId: pessoal!.id, name: "X", frequency: "CUSTOM", daysOfWeek: [] })).rejects.toThrow(/dia da semana/);
  });
});

describe("notificações", () => {
  it("resumo diário usa só dados registrados e não duplica", async () => {
    const user = await createTestUser();
    const [turbo] = await listWorkspaces(user.id);
    const today = todayYmd(TZ);
    await createTask(user.id, { workspaceId: turbo!.id, title: "Atrasada", dueDate: addDaysYmd(today, -1) });
    await createTask(user.id, { workspaceId: turbo!.id, title: "Para hoje", dueDate: today, priority: "URGENT" });

    const digest = await buildDailyDigest(user.id, today, TZ);
    const section = (t: string) => digest.sections.find((s) => s.title === t)!;
    expect(section("Tarefas atrasadas").items.map((i) => i.label)).toEqual(["Atrasada"]);
    expect(section("Prazo hoje").items.map((i) => i.label)).toEqual(["Para hoje"]);
    expect(section("Compromissos de hoje").items).toHaveLength(0);

    await updatePrefs(user.id, { dailyEnabled: true, dailyTime: "00:00", weeklyEnabled: false, weeklyDay: 0, monthlyEnabled: false, monthlyDay: 1, inAppEnabled: true, billDueDaysBefore: 3 });
    expect((await generateDueNotifications(user.id, TZ)).created).toBe(1);
    expect((await generateDueNotifications(user.id, TZ)).created).toBe(0);
    expect(await unreadCount(user.id)).toBe(1);
    await markAllRead(user.id);
    expect(await unreadCount(user.id)).toBe(0);
  });

  it("gera lembrete de compromisso na janela configurada", async () => {
    const user = await createTestUser();
    const [turbo] = await listWorkspaces(user.id);
    await updatePrefs(user.id, { dailyEnabled: false, dailyTime: "07:00", weeklyEnabled: false, weeklyDay: 0, monthlyEnabled: false, monthlyDay: 1, inAppEnabled: true, billDueDaysBefore: 3 });
    const start = new Date(Date.now() + 20 * 60_000);
    const fmt = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    const hm = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
    const end = new Date(start.getTime() + 30 * 60_000);
    await createEvent(user.id, { workspaceId: turbo!.id, title: "Call", allDay: false, startDate: fmt(start), startTime: hm(start), endDate: fmt(end), endTime: hm(end), reminderMinutes: 30 }, TZ);
    expect((await generateDueNotifications(user.id, TZ)).created).toBe(1);
    const n = await db.notification.findFirstOrThrow({ where: { userId: user.id } });
    expect(n.type).toBe("EVENT_REMINDER");
    expect((await generateDueNotifications(user.id, TZ)).created).toBe(0);
  });
});

describe("anexos", () => {
  it("salva arquivo vinculado à tarefa e protege o acesso", async () => {
    const user = await createTestUser();
    const intruder = await createTestUser();
    const [turbo] = await listWorkspaces(user.id);
    const task = await createTask(user.id, { workspaceId: turbo!.id, title: "Com anexo" });
    const att = await addFileAttachment(user.id, { entityType: "task", entityId: task.id, name: "briefing.pdf", mimeType: "application/pdf", bytes: new Uint8Array([37, 80, 68, 70]) });
    expect((await getAttachmentFile(user.id, att.id)).sizeBytes).toBe(4);
    await expect(getAttachmentFile(intruder.id, att.id)).rejects.toThrow();
    await expect(addFileAttachment(user.id, { entityType: "task", entityId: task.id, name: "x.exe", mimeType: "application/x-msdownload", bytes: new Uint8Array([1]) })).rejects.toThrow(/não permitido/);
  });
});
