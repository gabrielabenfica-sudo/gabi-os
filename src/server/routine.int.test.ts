import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { listWorkspaces } from "@/server/workspaces";
import { createTestUser } from "../../tests/factories";
import {
  applyRoutineTemplate, clearRoutineDay, copyRoutineDay, createRoutineItem, createTemplateItem, deleteRoutineItem, listRoutineDay, listRoutineTemplate,
  routineDayContext, saveDayAsTemplate, setRoutineItemDone, updateRoutineItem, updateTemplateItem,
} from "./routine";
import { createEvent } from "./calendar";
import { createTask } from "./tasks";
import { contentForExport, createContent, deleteContent } from "./content";
import { exportUserData } from "./export";

const TZ = "America/Sao_Paulo";
// 2026-11-02 é segunda-feira; 2026-11-03, terça
const MON = "2026-11-02";
const TUE = "2026-11-03";

async function setup() {
  const user = await createTestUser();
  const [turbo, pessoal, mentoria] = await listWorkspaces(user.id);
  return { user, turbo: turbo!, pessoal: pessoal!, mentoria: mentoria! };
}

describe("rotina do dia", () => {
  it("cria blocos, ordena por horário, marca feito, edita e remove", async () => {
    const { user, pessoal, turbo } = await setup();
    await createRoutineItem(user.id, { date: MON, title: "Responder e-mails" });
    await createRoutineItem(user.id, { date: MON, title: "Reunião de marketing", startTime: "10:00", endTime: "11:00", workspaceId: turbo.id });
    const gym = await createRoutineItem(user.id, { date: MON, title: "Academia", startTime: "06:30", endTime: "07:30", workspaceId: pessoal.id });
    await createRoutineItem(user.id, { date: TUE, title: "Outro dia", startTime: "08:00" });

    let day = await listRoutineDay(user.id, MON);
    expect(day.map((i) => i.title)).toEqual(["Academia", "Reunião de marketing", "Responder e-mails"]);
    expect(day[0]!.workspace?.name).toBe(pessoal.name);

    await setRoutineItemDone(user.id, gym.id, true);
    await updateRoutineItem(user.id, gym.id, { date: MON, title: "Academia (perna)", startTime: "06:00", endTime: "07:00", workspaceId: pessoal.id });
    day = await listRoutineDay(user.id, MON);
    expect(day[0]).toMatchObject({ title: "Academia (perna)", startTime: "06:00", done: true });

    await deleteRoutineItem(user.id, gym.id);
    expect((await listRoutineDay(user.id, MON)).map((i) => i.title)).toEqual(["Reunião de marketing", "Responder e-mails"]);
    expect(await clearRoutineDay(user.id, MON)).toBe(2);
    expect(await listRoutineDay(user.id, MON)).toHaveLength(0);
    expect(await listRoutineDay(user.id, TUE)).toHaveLength(1);
  });

  it("valida horários", async () => {
    const { user } = await setup();
    await expect(createRoutineItem(user.id, { date: MON, title: "X", startTime: "10:00", endTime: "09:00" })).rejects.toThrow();
    await expect(createRoutineItem(user.id, { date: MON, title: "X", endTime: "09:00" })).rejects.toThrow();
    await expect(createRoutineItem(user.id, { date: MON, title: "X", startTime: "25:00" })).rejects.toThrow();
    await expect(createRoutineItem(user.id, { date: MON, title: "   " })).rejects.toThrow();
  });

  it("isola a rotina de cada usuária e não aceita ambiente de outra pessoa", async () => {
    const a = await setup();
    const b = await setup();
    const item = await createRoutineItem(a.user.id, { date: MON, title: "Particular" });
    expect(await listRoutineDay(b.user.id, MON)).toHaveLength(0);
    await expect(setRoutineItemDone(b.user.id, item.id, true)).rejects.toThrow(/não encontrado/);
    await expect(deleteRoutineItem(b.user.id, item.id)).rejects.toThrow(/não encontrado/);
    await expect(createRoutineItem(b.user.id, { date: MON, title: "Intrusa", workspaceId: a.pessoal.id })).rejects.toThrow();
    const tpl = await createTemplateItem(a.user.id, { title: "Devocional", weekdays: [1] });
    await expect(updateTemplateItem(b.user.id, tpl.id, { title: "Hack", weekdays: [1] })).rejects.toThrow(/não encontrado/);
    expect(await listRoutineTemplate(b.user.id)).toHaveLength(0);
  });

  it("aplica a rotina padrão do dia da semana sem duplicar", async () => {
    const { user, pessoal } = await setup();
    await createTemplateItem(user.id, { title: "Devocional", startTime: "06:00", endTime: "06:30", weekdays: [1, 2, 3, 4, 5], workspaceId: pessoal.id });
    await createTemplateItem(user.id, { title: "Planejar a semana", startTime: "08:00", weekdays: [1] });
    await createTemplateItem(user.id, { title: "Só terça", weekdays: [2] });
    await expect(createTemplateItem(user.id, { title: "Sem dia", weekdays: [] })).rejects.toThrow(/dia da semana/);

    expect(await applyRoutineTemplate(user.id, MON)).toBe(2);
    expect(await applyRoutineTemplate(user.id, MON)).toBe(0);
    const day = await listRoutineDay(user.id, MON);
    expect(day.map((i) => i.title)).toEqual(["Devocional", "Planejar a semana"]);
    expect(day.every((i) => !i.done)).toBe(true);
    expect(day[0]!.workspaceId).toBe(pessoal.id);

    // Domingo não tem nada
    await expect(applyRoutineTemplate(user.id, "2026-11-01")).rejects.toThrow(/não tem nada/);
  });

  it("copia outro dia e salva um dia como rotina padrão", async () => {
    const { user } = await setup();
    const a = await createRoutineItem(user.id, { date: MON, title: "Gravar Reels", startTime: "14:00", endTime: "16:00" });
    await createRoutineItem(user.id, { date: MON, title: "Academia", startTime: "06:30", endTime: "07:30" });
    await setRoutineItemDone(user.id, a.id, true);
    await createRoutineItem(user.id, { date: TUE, title: "academia", startTime: "06:30" });

    expect(await copyRoutineDay(user.id, MON, TUE)).toBe(1); // "Academia" já existia na terça
    const tue = await listRoutineDay(user.id, TUE);
    expect(tue.map((i) => i.title)).toEqual(["academia", "Gravar Reels"]);
    expect(tue.find((i) => i.title === "Gravar Reels")!.done).toBe(false);
    await expect(copyRoutineDay(user.id, "2026-11-10", TUE)).rejects.toThrow(/Não há rotina/);

    expect(await saveDayAsTemplate(user.id, MON, [1])).toBe(2);
    // Salvar de novo para quarta só acrescenta o dia aos mesmos blocos
    expect(await saveDayAsTemplate(user.id, MON, [3])).toBe(0);
    const tpl = await listRoutineTemplate(user.id);
    expect(tpl).toHaveLength(2);
    expect(tpl.every((t) => t.weekdays.join() === "1,3")).toBe(true);
  });

  it("mostra compromissos, prazos e gravações do dia", async () => {
    const { user, turbo, mentoria } = await setup();
    await createEvent(user.id, { workspaceId: turbo.id, title: "Reunião com cliente", allDay: false, startDate: MON, startTime: "15:00", endDate: MON, endTime: "16:00" }, TZ);
    await createEvent(user.id, { workspaceId: turbo.id, title: "Outro dia", allDay: false, startDate: TUE, startTime: "15:00", endDate: TUE, endTime: "16:00" }, TZ);
    await createTask(user.id, { workspaceId: turbo.id, title: "Enviar relatório", dueDate: MON });
    await createContent(user.id, { workspaceId: mentoria.id, title: "Reel bastidores", recordingDate: MON, recordingTime: "09:00" }, TZ);
    await createContent(user.id, { workspaceId: mentoria.id, title: "Só publica", publishDate: MON }, TZ);

    const ctx = await routineDayContext(user.id, MON, TZ);
    expect(ctx.map((c) => [c.kind, c.title, c.startTime])).toEqual([
      ["recording", "Gravar: Reel bastidores", "09:00"],
      ["event", "Reunião com cliente", "15:00"],
      ["task", "Enviar relatório", null],
    ]);
    expect(ctx[1]!.endTime).toBe("16:00");
  });

  it("entra na exportação de dados da usuária", async () => {
    const { user } = await setup();
    await createRoutineItem(user.id, { date: MON, title: "Bloco exportado" });
    await createTemplateItem(user.id, { title: "Modelo exportado", weekdays: [1] });
    const data = await exportUserData(user.id);
    expect(data.data.routineItems.map((i) => i.title)).toContain("Bloco exportado");
    expect(data.data.routineTemplate.map((i) => i.title)).toContain("Modelo exportado");
  });
});

describe("exportar roteiros", () => {
  it("devolve os conteúdos escolhidos na ordem pedida, sem os excluídos nem os de outra pessoa", async () => {
    const { user, mentoria, turbo } = await setup();
    const other = await setup();
    const a = await createContent(user.id, { workspaceId: mentoria.id, title: "A", hook: "Gancho A", script: "Roteiro A" }, TZ);
    const b = await createContent(user.id, { workspaceId: turbo.id, title: "B", script: "Roteiro B" }, TZ);
    const c = await createContent(user.id, { workspaceId: mentoria.id, title: "C" }, TZ);
    const alheio = await createContent(other.user.id, { workspaceId: other.mentoria.id, title: "Alheio", script: "Segredo" }, TZ);
    await deleteContent(user.id, c.id);

    const out = await contentForExport(user.id, [b.id, alheio.id, a.id, c.id, b.id, "inexistente"]);
    expect(out.map((i) => i.title)).toEqual(["B", "A"]);
    expect(out[1]).toMatchObject({ hook: "Gancho A", script: "Roteiro A" });
    expect(out[0]!.workspace.name).toBe(turbo.name);
    expect(await contentForExport(user.id, [])).toEqual([]);
    expect(await db.contentItem.count({ where: { id: alheio.id } })).toBe(1);
  });
});
