import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { listWorkspaces } from "@/server/workspaces";
import { createTestUser } from "../../tests/factories";
import { addDaysYmd, todayYmd, weekdayOfYmd } from "@/lib/dates";
import {
  completeRun,
  createRoutine,
  deleteRoutine,
  getRoutineDay,
  listProcesses,
  listSchedules,
  setRoutineActive,
  setRoutineCheck,
  setRunStep,
  startRun,
  updateRoutine,
} from "./routines";

const TZ = "America/Sao_Paulo";
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

async function setup() {
  const user = await createTestUser();
  const pessoal = (await listWorkspaces(user.id)).find((w) => w.kind === "PESSOAL")!;
  return { user, pessoal };
}

/** Faz os itens da rotina parecerem criados dias atrás (para testar o histórico). */
async function backdate(routineId: string, days: number) {
  await db.routineItem.updateMany({ where: { routineId }, data: { createdAt: new Date(Date.now() - days * 86_400_000) } });
}

describe("rotina do dia", () => {
  it("monta o dia em ordem de horário, marca e calcula os percentuais", async () => {
    const { user, pessoal } = await setup();
    const today = todayYmd(TZ);
    const r = await createRoutine(user.id, {
      workspaceId: pessoal.id,
      kind: "SCHEDULE",
      name: "Dias úteis",
      daysOfWeek: ALL_DAYS,
      items: [
        { title: "Academia", time: "19:00" },
        { title: "Devocional", time: "06:30" },
        { title: "Bloco TURBO", time: "08:00" },
      ],
    });
    await backdate(r.id, 3);

    let day = await getRoutineDay(user.id, {}, TZ);
    expect(day.items.map((i) => i.title)).toEqual(["Devocional", "Bloco TURBO", "Academia"]);
    expect(day.items.map((i) => i.period)).toEqual(["MANHA", "MANHA", "NOITE"]);
    expect(day.todayProgress).toEqual({ total: 3, done: 0 });

    const [devocional, turbo] = day.items;
    await setRoutineCheck(user.id, devocional!.id, today, true, TZ);
    // Ontem: cumpriu 2 de 3
    const yesterday = addDaysYmd(today, -1);
    await setRoutineCheck(user.id, devocional!.id, yesterday, true, TZ);
    await setRoutineCheck(user.id, turbo!.id, yesterday, true, TZ);
    // Marcar de novo não duplica
    await setRoutineCheck(user.id, devocional!.id, today, true, TZ);

    day = await getRoutineDay(user.id, {}, TZ);
    expect(day.todayProgress).toEqual({ total: 3, done: 1 });
    expect(day.items.find((i) => i.title === "Devocional")!.checked).toBe(true);
    // 7 dias: 3 dias anteriores completos (3 × 3 = 9, sendo 2 feitos ontem) + 1 marcado hoje
    expect(day.stats7).toEqual({ expected: 10, done: 3, rate: 30 });

    const past = await getRoutineDay(user.id, { date: yesterday }, TZ);
    expect(past.items.filter((i) => i.checked).map((i) => i.title)).toEqual(["Devocional", "Bloco TURBO"]);

    await setRoutineCheck(user.id, devocional!.id, today, false, TZ);
    expect((await getRoutineDay(user.id, {}, TZ)).todayProgress.done).toBe(0);
  });

  it("recusa dia futuro e dia em que a rotina não vale", async () => {
    const { user, pessoal } = await setup();
    const today = todayYmd(TZ);
    const notToday = ALL_DAYS.filter((d) => d !== weekdayOfYmd(today));
    await createRoutine(user.id, { workspaceId: pessoal.id, kind: "SCHEDULE", name: "Outros dias", daysOfWeek: notToday, items: [{ title: "Leitura", time: "21:00" }] });
    const item = await db.routineItem.findFirstOrThrow({});
    expect((await getRoutineDay(user.id, {}, TZ)).items).toEqual([]);
    await expect(setRoutineCheck(user.id, item.id, today, true, TZ)).rejects.toThrow("não faz parte da rotina");
    await expect(setRoutineCheck(user.id, item.id, addDaysYmd(today, 1), true, TZ)).rejects.toThrow("dia futuro");
  });

  it("exige horário e dias da semana", async () => {
    const { user, pessoal } = await setup();
    await expect(createRoutine(user.id, { workspaceId: pessoal.id, kind: "SCHEDULE", name: "X", daysOfWeek: [], items: [{ title: "A", time: "07:00" }] })).rejects.toThrow("dia da semana");
    await expect(createRoutine(user.id, { workspaceId: pessoal.id, kind: "SCHEDULE", name: "X", daysOfWeek: [1], items: [{ title: "A" }] })).rejects.toThrow("horário");
    await expect(createRoutine(user.id, { workspaceId: pessoal.id, kind: "SCHEDULE", name: "X", daysOfWeek: [1], items: [{ title: "A", time: "25:00" }] })).rejects.toThrow("Horário inválido");
  });

  it("item retirado some dos próximos dias, mas o histórico continua", async () => {
    const { user, pessoal } = await setup();
    const today = todayYmd(TZ);
    const yesterday = addDaysYmd(today, -1);
    const r = await createRoutine(user.id, {
      workspaceId: pessoal.id,
      kind: "SCHEDULE",
      name: "Rotina",
      daysOfWeek: ALL_DAYS,
      items: [{ title: "Água", time: "06:00" }, { title: "Alongar", time: "06:10" }],
    });
    await backdate(r.id, 2);
    const [agua, alongar] = (await listSchedules(user.id))[0]!.items;
    await setRoutineCheck(user.id, alongar!.id, yesterday, true, TZ);

    await updateRoutine(user.id, r.id, {
      workspaceId: pessoal.id,
      kind: "SCHEDULE",
      name: "Rotina da manhã",
      daysOfWeek: ALL_DAYS,
      items: [{ id: agua!.id, title: "Água com limão", time: "06:00" }, { title: "Meditar", time: "06:20" }],
    });

    const schedules = await listSchedules(user.id);
    expect(schedules[0]!.name).toBe("Rotina da manhã");
    expect(schedules[0]!.items.map((i) => i.title)).toEqual(["Água com limão", "Meditar"]);
    expect(schedules[0]!.items[0]!.id).toBe(agua!.id);

    expect((await getRoutineDay(user.id, {}, TZ)).items.map((i) => i.title)).toEqual(["Água com limão", "Meditar"]);
    const past = await getRoutineDay(user.id, { date: yesterday }, TZ);
    expect(past.items.map((i) => [i.title, i.checked])).toEqual([["Água com limão", false], ["Alongar", true]]);
    // O item novo não pode ser marcado antes de existir
    const meditar = schedules[0]!.items[1]!;
    await expect(setRoutineCheck(user.id, meditar.id, yesterday, true, TZ)).rejects.toThrow("não faz parte da rotina");
  });

  it("rotina arquivada sai do dia; excluir apaga tudo", async () => {
    const { user, pessoal } = await setup();
    const r = await createRoutine(user.id, { workspaceId: pessoal.id, kind: "SCHEDULE", name: "Fim de semana", daysOfWeek: ALL_DAYS, items: [{ title: "Feira", time: "09:00" }] });
    await setRoutineActive(user.id, r.id, false);
    expect((await getRoutineDay(user.id, {}, TZ)).items).toEqual([]);
    expect(await listSchedules(user.id)).toEqual([]);
    expect(await listSchedules(user.id, { includeInactive: true })).toHaveLength(1);
    await deleteRoutine(user.id, r.id);
    expect(await db.routineItem.count()).toBe(0);
  });
});

describe("processos", () => {
  it("inicia, marca passos, conclui e guarda o histórico", async () => {
    const { user, pessoal } = await setup();
    const r = await createRoutine(user.id, {
      workspaceId: pessoal.id,
      kind: "CHECKLIST",
      name: "Rotina de gravação",
      items: [{ title: "Roteiro revisado" }, { title: "Luz e microfone" }, { title: "Gravar 3 takes" }],
    });
    // Horário é ignorado em processos
    expect((await db.routineItem.findMany({})).every((i) => i.time === null)).toBe(true);

    const run = await startRun(user.id, r.id);
    expect(run.steps.map((s) => s.title)).toEqual(["Roteiro revisado", "Luz e microfone", "Gravar 3 takes"]);
    await expect(startRun(user.id, r.id)).rejects.toThrow("em andamento");

    await setRunStep(user.id, run.steps[0]!.id, true);
    await setRunStep(user.id, run.steps[1]!.id, true);
    await setRunStep(user.id, run.steps[2]!.id, true);
    // Marcar todos os passos não conclui sozinho
    let [p] = await listProcesses(user.id);
    expect(p!.openRun?.steps.every((s) => s.done)).toBe(true);
    expect(p!.completedRuns).toBe(0);

    await setRunStep(user.id, run.steps[2]!.id, false);
    await completeRun(user.id, run.id, "Faltou um take");
    [p] = await listProcesses(user.id);
    expect(p!.openRun).toBeNull();
    expect(p!.completedRuns).toBe(1);
    expect(p!.recentRuns[0]).toMatchObject({ note: "Faltou um take" });
    expect(p!.recentRuns[0]!.steps.filter((s) => s.done)).toHaveLength(2);
    await expect(setRunStep(user.id, run.steps[2]!.id, true)).rejects.toThrow("já foi concluída");

    // Mudar os passos não altera execuções passadas
    const items = (await listProcesses(user.id))[0]!.items;
    await updateRoutine(user.id, r.id, { workspaceId: pessoal.id, kind: "CHECKLIST", name: "Rotina de gravação", items: [{ id: items[0]!.id, title: "Roteiro aprovado" }] });
    [p] = await listProcesses(user.id);
    expect(p!.items.map((i) => i.title)).toEqual(["Roteiro aprovado"]);
    expect(p!.recentRuns[0]!.steps.map((s) => s.title)).toEqual(["Roteiro revisado", "Luz e microfone", "Gravar 3 takes"]);
    const next = await startRun(user.id, r.id);
    expect(next.steps.map((s) => s.title)).toEqual(["Roteiro aprovado"]);
  });

  it("não deixa mudar o tipo da rotina nem iniciar processo arquivado", async () => {
    const { user, pessoal } = await setup();
    const r = await createRoutine(user.id, { workspaceId: pessoal.id, kind: "CHECKLIST", name: "Fechamento do mês", items: [{ title: "Conciliar contas" }] });
    await expect(updateRoutine(user.id, r.id, { workspaceId: pessoal.id, kind: "SCHEDULE", name: "X", daysOfWeek: [1], items: [{ title: "A", time: "07:00" }] })).rejects.toThrow("tipo");
    await setRoutineActive(user.id, r.id, false);
    await expect(startRun(user.id, r.id)).rejects.toThrow("Reative");
  });
});

describe("permissões da rotina", () => {
  it("outra usuária não vê nem altera; colaboradora só com o módulo liberado", async () => {
    const { user, pessoal } = await setup();
    const today = todayYmd(TZ);
    const r = await createRoutine(user.id, { workspaceId: pessoal.id, kind: "SCHEDULE", name: "Minha rotina", daysOfWeek: ALL_DAYS, items: [{ title: "Devocional", time: "06:30" }] });
    const proc = await createRoutine(user.id, { workspaceId: pessoal.id, kind: "CHECKLIST", name: "Processo", items: [{ title: "Passo" }] });
    const item = await db.routineItem.findFirstOrThrow({ where: { routineId: r.id } });

    const other = await createTestUser({ name: "Outra" });
    expect(await listSchedules(other.id)).toEqual([]);
    expect(await listProcesses(other.id)).toEqual([]);
    expect((await getRoutineDay(other.id, {}, TZ)).items).toEqual([]);
    await expect(setRoutineCheck(other.id, item.id, today, true, TZ)).rejects.toThrow("permissão");
    await expect(startRun(other.id, proc.id)).rejects.toThrow("permissão");
    await expect(deleteRoutine(other.id, r.id)).rejects.toThrow("permissão");
    await expect(createRoutine(other.id, { workspaceId: pessoal.id, kind: "CHECKLIST", name: "Invasão", items: [{ title: "x" }] })).rejects.toThrow("permissão");

    const helper = await createTestUser({ name: "Assistente" });
    const member = await db.workspaceMember.create({ data: { workspaceId: pessoal.id, userId: helper.id, role: "EDITOR", modules: ["tasks"] } });
    expect(await listSchedules(helper.id)).toEqual([]);
    await expect(setRoutineCheck(helper.id, item.id, today, true, TZ)).rejects.toThrow("permissão");

    await db.workspaceMember.update({ where: { id: member.id }, data: { modules: ["tasks", "routines"] } });
    expect((await listSchedules(helper.id)).map((s) => s.name)).toEqual(["Minha rotina"]);
    await setRoutineCheck(helper.id, item.id, today, true, TZ);

    await db.workspaceMember.update({ where: { id: member.id }, data: { role: "VIEWER" } });
    expect((await getRoutineDay(helper.id, {}, TZ)).items[0]!.checked).toBe(true);
    await expect(setRoutineCheck(helper.id, item.id, today, false, TZ)).rejects.toThrow("permissão");
  });
});
