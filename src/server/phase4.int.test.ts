import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { listWorkspaces, ForbiddenError } from "@/server/workspaces";
import { createTestUser } from "../../tests/factories";
import { addDaysYmd, todayYmd } from "@/lib/dates";
import { createAccount } from "./finance/accounts";
import { createProgram, listSales } from "./finance/sales";
import { mentoriaMonthly } from "./finance/summary";
import {
  addLeadActivity, convertLead, createLead, createStage, crmMetrics, deleteLeadActivity, deleteStage, getLead, listLeads, listStages, markLeadLost, moveLead,
} from "./crm";
import {
  addMaterial, addMenteeGoal, addMenteeTask, createMentee, getMentee, listMentees, scheduleSession, updateMentee, updateMenteeGoal, updateSession,
} from "./mentees";
import {
  contentFromReference, contentReport, createContent, createProfile, createReference, listContent, listContentStatuses, moveContent, profileOverview,
  saveContentMetric, saveProfileSnapshot, upcomingContent,
} from "./content";
import { createEvent } from "./calendar";
import { addGoalStep, createGoal, getGoal, listGoals, recordGoalValue, updateGoalStep } from "./goals";
import { setTaskDone } from "./tasks";

const TZ = "America/Sao_Paulo";

async function setup() {
  const user = await createTestUser({ name: "Gabriela" });
  const ws = await listWorkspaces(user.id);
  const mentoria = ws.find((w) => w.kind === "MENTORIA")!;
  const pessoal = ws.find((w) => w.kind === "PESSOAL")!;
  return { user, mentoria, pessoal };
}

describe("CRM", () => {
  it("lead percorre o funil, registra histórico e é convertido em venda + mentorado sem duplicar", async () => {
    const { user, mentoria } = await setup();
    const today = todayYmd(TZ);
    const stages = await listStages(user.id, mentoria.id);
    const conta = await createAccount(user.id, { workspaceId: mentoria.id, name: "PJ", type: "CHECKING", initialBalanceCents: 0 });
    const program = await createProgram(user.id, mentoria.id, { name: "Mentoria 12 semanas", durationWeeks: 12, priceCents: 300_000 });

    const lead = await createLead(user.id, { workspaceId: mentoria.id, name: "Carla", source: "Instagram", potentialCents: 300_000, programId: program.id });
    expect(lead.stage.name).toBe("Novo lead");
    const reuniao = stages.find((s) => s.name === "Reunião agendada")!;
    await moveLead(user.id, lead.id, reuniao.id, 0);
    await addLeadActivity(user.id, lead.id, { type: "CALL", content: "Ligação de qualificação" });

    const detail = await getLead(user.id, lead.id);
    expect(detail.stage.id).toBe(reuniao.id);
    expect(detail.activities.map((a) => a.type)).toEqual(expect.arrayContaining(["STAGE_CHANGE", "CALL"]));
    const stageChange = detail.activities.find((a) => a.type === "STAGE_CHANGE")!;
    await expect(deleteLeadActivity(user.id, stageChange.id)).rejects.toThrow(/histórico/);

    const res = await convertLead(user.id, lead.id, {
      sale: { programId: program.id, description: "Mentoria 12 semanas", totalCents: 300_000, saleDate: today, paymentType: "INSTALLMENTS", installmentsCount: 3, firstDueDate: today, commissionCents: 0 },
      createMentee: true,
    });
    expect(res.menteeId).toBeTruthy();
    const mentee = await getMentee(user.id, res.menteeId!);
    expect(mentee.name).toBe("Carla");
    expect(mentee.contractedCents).toBe(300_000);
    expect(mentee.paymentTerms).toBe("3x");
    expect(mentee.expectedEndDate).not.toBeNull();
    expect(mentee.sales).toHaveLength(1);
    expect(mentee.sales[0]!.receivables).toHaveLength(3);
    expect(mentee.lead?.id).toBe(lead.id);

    const won = await getLead(user.id, lead.id);
    expect(won.stage.isWon).toBe(true);
    expect(won.wonAt).not.toBeNull();
    // Não converte duas vezes
    await expect(convertLead(user.id, lead.id, { sale: { description: "x", totalCents: 100, saleDate: today, paymentType: "CASH", installmentsCount: 1, firstDueDate: today }, createMentee: false })).rejects.toThrow(/venda/);

    // Faturamento da Mentoria = valor da venda (uma vez só)
    const [month] = await mentoriaMonthly(mentoria.id, today.slice(0, 7), today.slice(0, 7));
    expect(month!.salesCents).toBe(300_000);
    expect((await listSales(user.id, mentoria.id)).length).toBe(1);
    void conta;

    // Perdido + métricas
    const l2 = await createLead(user.id, { workspaceId: mentoria.id, name: "Bruno", source: "Indicação" });
    await markLeadLost(user.id, l2.id, "Sem orçamento");
    const l3 = await createLead(user.id, { workspaceId: mentoria.id, name: "Dani", potentialCents: 150_000, nextActionDate: addDaysYmd(today, -2) });
    const m = await crmMetrics(user.id, mentoria.id, { from: today, to: today }, TZ);
    expect(m).toMatchObject({ newLeads: 3, won: 1, lost: 1, conversionRate: 50, openLeads: 1, pipelineCents: 150_000, overdueActions: 1 });
    expect(m.sources).toEqual(expect.arrayContaining([{ name: "Indicação", count: 1 }, { name: "Não informado", count: 1 }]));
    expect((await getLead(user.id, l2.id)).lostReason).toBe("Sem orçamento");
    void l3;
  });

  it("etapas: nova etapa entra antes das finais; exclusão move os leads; finais protegidas", async () => {
    const { user, mentoria } = await setup();
    const created = await createStage(user.id, mentoria.id, "Follow-up");
    const stages = await listStages(user.id, mentoria.id);
    const names = stages.map((s) => s.name);
    expect(names.indexOf("Follow-up")).toBe(names.indexOf("Venda realizada") - 1);
    const lead = await createLead(user.id, { workspaceId: mentoria.id, name: "Eva", stageId: created.id });
    const first = stages[0]!;
    await deleteStage(user.id, created.id, first.id);
    expect((await getLead(user.id, lead.id)).stage.id).toBe(first.id);
    const wonStage = stages.find((s) => s.isWon)!;
    await expect(deleteStage(user.id, wonStage.id, first.id)).rejects.toThrow();
  });

  it("ordenação por arrastar mantém a posição pedida", async () => {
    const { user, mentoria } = await setup();
    const a = await createLead(user.id, { workspaceId: mentoria.id, name: "A" });
    const b = await createLead(user.id, { workspaceId: mentoria.id, name: "B" });
    const c = await createLead(user.id, { workspaceId: mentoria.id, name: "C" });
    await moveLead(user.id, c.id, c.stageId, 0);
    await moveLead(user.id, a.id, a.stageId, 1);
    const order = (await listLeads(user.id, mentoria.id)).map((l) => l.name);
    expect(order).toEqual(["C", "A", "B"]);
    void b;
  });

  it("colaborador sem o módulo CRM não acessa leads nem mentorados", async () => {
    const { user, mentoria } = await setup();
    const other = await createTestUser({ name: "Assistente" });
    await db.workspaceMember.create({ data: { workspaceId: mentoria.id, userId: other.id, role: "EDITOR", modules: ["tasks"] } });
    await expect(listLeads(other.id, mentoria.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listMentees(other.id, mentoria.id)).rejects.toBeInstanceOf(ForbiddenError);
    await createLead(user.id, { workspaceId: mentoria.id, name: "Privado" });
  });
});

describe("mentorados", () => {
  it("encontro com agenda verifica conflito em todos os ambientes; ficha reúne tudo", async () => {
    const { user, mentoria, pessoal } = await setup();
    const day = addDaysYmd(todayYmd(TZ), 3);
    const mentee = await createMentee(user.id, { workspaceId: mentoria.id, name: "Fernanda", email: "fe@exemplo.com", startDate: todayYmd(TZ) });

    // Compromisso pessoal no mesmo horário
    await createEvent(user.id, { workspaceId: pessoal.id, title: "Dentista", startDate: day, startTime: "10:00", endDate: day, endTime: "11:00" }, TZ);
    const blocked = await scheduleSession(user.id, mentee.id, { date: day, time: "10:30", durationMinutes: 60, addToCalendar: true }, TZ);
    expect(blocked.saved).toBe(false);
    if (!blocked.saved) expect(blocked.conflicts[0]!.title).toBe("Dentista");
    expect(await db.mentoringSession.count({ where: { menteeId: mentee.id } })).toBe(0);

    const ok = await scheduleSession(user.id, mentee.id, { date: day, time: "10:30", durationMinutes: 60, addToCalendar: true }, TZ, { allowConflict: true });
    expect(ok.saved).toBe(true);
    const session = await db.mentoringSession.findFirstOrThrow({ where: { menteeId: mentee.id } });
    const event = await db.calendarEvent.findUniqueOrThrow({ where: { id: session.eventId! } });
    expect(event.title).toBe("Mentoria · Fernanda");
    expect(event.workspaceId).toBe(mentoria.id);

    await updateSession(user.id, session.id, { status: "DONE", summary: "Definimos o plano de conteúdo" });
    expect((await db.calendarEvent.findUniqueOrThrow({ where: { id: event.id } })).status).toBe("DONE");

    const goal = await addMenteeGoal(user.id, mentee.id, { title: "Lançar oferta" });
    await updateMenteeGoal(user.id, goal.id, { progress: 100 });
    await addMaterial(user.id, mentee.id, { title: "Planilha", url: "https://exemplo.com/planilha" });
    const task = await addMenteeTask(user.id, mentee.id, { title: "Enviar feedback" });
    await updateMentee(user.id, mentee.id, { name: "Fernanda", status: "PAUSED" });

    const detail = await getMentee(user.id, mentee.id);
    expect(detail.tasks.map((t) => t.id)).toContain(task.id);
    expect(detail.goals[0]!.done).toBe(true);
    expect(detail.materials).toHaveLength(1);
    expect(detail.timeline.map((t) => t.title)).toEqual(expect.arrayContaining(["Início da mentoria", "Encontro realizado", "Meta atingida", "Status: Pausado"]));

    const list = await listMentees(user.id, mentoria.id, {}, TZ);
    expect(list[0]).toMatchObject({ sessionsDone: 1, goalsTotal: 1, goalsDone: 1 });
  });
});

describe("conteúdo", () => {
  it("fluxo de produção, publicação explícita, métricas e relatório por formato", async () => {
    const { user, mentoria } = await setup();
    const today = todayYmd(TZ);
    const statuses = await listContentStatuses(user.id, mentoria.id);
    const profile = await createProfile(user.id, { workspaceId: mentoria.id, name: "Perfil Mentoria", username: "@gabi.mentora", postingGoalPerWeek: 3 });
    expect(profile.username).toBe("gabi.mentora");

    const reel = await createContent(user.id, { workspaceId: mentoria.id, title: "3 erros de quem começa", format: "REELS", profileId: profile.id, recordingDate: addDaysYmd(today, 1), recordingTime: "09:00", publishDate: addDaysYmd(today, 2) }, TZ);
    expect(reel.status.name).toBe("Ideia");
    expect(reel.publishedAt).toBeNull();

    const upcoming = await upcomingContent(user.id, "all", new Date(), new Date(Date.now() + 7 * 86_400_000));
    expect(upcoming.map((u) => u.kind)).toEqual(["RECORDING", "PUBLISH"]);

    const published = statuses.find((s) => s.isPublished)!;
    const moved = await moveContent(user.id, reel.id, published.id, 0);
    expect(moved.publishedAt).not.toBeNull();
    // Sair de "Publicado" limpa a data; voltar marca de novo
    const back = await moveContent(user.id, reel.id, statuses[0]!.id, 0);
    expect(back.publishedAt).toBeNull();
    await moveContent(user.id, reel.id, published.id, 0);

    const carousel = await createContent(user.id, { workspaceId: mentoria.id, title: "Checklist", format: "CAROUSEL", statusId: published.id }, TZ);
    await saveContentMetric(user.id, reel.id, { date: today, reach: 1000, likes: 80, comments: 10, shares: 5, saves: 5 });
    await saveContentMetric(user.id, reel.id, { date: today, reach: 2000, likes: 150, comments: 20, shares: 10, saves: 20 }); // mesma data: atualiza
    await saveContentMetric(user.id, carousel.id, { date: today, reach: 500, saves: 50 });
    expect(await db.contentMetric.count({ where: { contentItemId: reel.id } })).toBe(1);

    const rep = await contentReport(user.id, { from: today, to: today }, TZ);
    expect(rep.publishedCount).toBe(2);
    expect(rep.totalReach).toBe(2500);
    expect(rep.byFormat).toHaveLength(2);
    expect(rep.byFormat.map((f) => [f.format, f.avgEngagement])).toEqual(expect.arrayContaining([["REELS", 10], ["CAROUSEL", 10]]));
    expect(rep.avgEngagement).toBe(10);

    // Referência → conteúdo
    const ref = await createReference(user.id, { workspaceId: mentoria.id, url: "https://instagram.com/p/abc", creator: "@outra", theme: "Rotina de estudos", format: "REELS", tags: ["Rotina"] });
    expect(ref.tags).toEqual(["rotina"]);
    const fromRef = await contentFromReference(user.id, ref.id, TZ);
    expect(fromRef.title).toBe("Rotina de estudos");
    expect(fromRef.references).toBe("https://instagram.com/p/abc");

    // Perfil: crescimento de seguidores e frequência
    await saveProfileSnapshot(user.id, profile.id, { date: addDaysYmd(today, -10), followers: 1000 });
    await saveProfileSnapshot(user.id, profile.id, { date: today, followers: 1100 });
    const ov = await profileOverview(user.id, profile.id, { from: addDaysYmd(today, -6), to: today }, TZ);
    expect(ov.followersStart).toBe(1000);
    expect(ov.followersEnd).toBe(1100);
    expect(ov.followersGrowth).toBe(100);
    expect(ov.publishedCount).toBe(1);

    expect((await listContent(user.id, { format: "CAROUSEL" })).map((c) => c.title)).toEqual(["Checklist"]);
  });
});

describe("metas", () => {
  it("meta automática de faturamento usa as vendas reais; manual guarda histórico; qualitativa usa etapas", async () => {
    const { user, mentoria, pessoal } = await setup();
    const today = todayYmd(TZ);
    const start = `${today.slice(0, 7)}-01`;
    const end = addDaysYmd(start, 27);

    const auto = await createGoal(user.id, { workspaceId: mentoria.id, type: "FINANCIAL", title: "Faturar 10 mil", targetValue: 10_000, autoMetric: "mentoria.revenue", horizon: "CUSTOM", startDate: start, dueDate: end });
    await expect(createGoal(user.id, { workspaceId: pessoal.id, type: "FINANCIAL", title: "X", targetValue: 1, autoMetric: "mentoria.revenue", startDate: start, dueDate: end })).rejects.toThrow(/Mentoria/);

    const lead = await createLead(user.id, { workspaceId: mentoria.id, name: "Gi" });
    await convertLead(user.id, lead.id, { sale: { description: "Mentoria", totalCents: 250_000, saleDate: today, paymentType: "CASH", installmentsCount: 1, firstDueDate: today }, createMentee: false });

    const view = await getGoal(user.id, auto.id, TZ);
    expect(view.currentValue).toBe(2500);
    expect(view.unit).toBe("BRL");
    expect(view.progress).toBe(25);
    expect(view.history.filter((h) => h.auto)).toHaveLength(1);
    await listGoals(user.id, {}, TZ); // segunda leitura no mesmo dia não duplica
    expect(await db.goalProgress.count({ where: { goalId: auto.id } })).toBe(1);
    await expect(recordGoalValue(user.id, auto.id, { value: 1, date: today })).rejects.toThrow(/automaticamente/);

    const manual = await createGoal(user.id, { workspaceId: pessoal.id, type: "PERSONAL", title: "Ler 12 livros", targetValue: 12, startValue: 0, unit: "livros" });
    await recordGoalValue(user.id, manual.id, { value: 3, date: addDaysYmd(today, -1) });
    await recordGoalValue(user.id, manual.id, { value: 2, date: addDaysYmd(today, -5) }); // registro antigo não volta o valor atual
    const mv = await getGoal(user.id, manual.id, TZ);
    expect(mv.currentValue).toBe(3);
    expect(mv.progress).toBe(25);
    expect(mv.history.map((h) => h.value)).toEqual([2, 3]);

    const qual = await createGoal(user.id, { workspaceId: pessoal.id, type: "DEVELOPMENT", title: "Curso de oratória", measure: "QUALITATIVE", steps: ["Inscrever", "Assistir módulos"] });
    const step = await addGoalStep(user.id, qual.id, { title: "Apresentar" });
    await updateGoalStep(user.id, step.id, { done: true });
    expect((await getGoal(user.id, qual.id, TZ)).progress).toBe(33);
  });

  it("tarefas concluídas e conteúdos publicados contam pelo período", async () => {
    const { user, mentoria } = await setup();
    const today = todayYmd(TZ);
    const goal = await createGoal(user.id, { workspaceId: mentoria.id, type: "PROFESSIONAL", title: "Entregas", targetValue: 4, autoMetric: "tasks.done", startDate: today, dueDate: addDaysYmd(today, 30) });
    const mentee = await createMentee(user.id, { workspaceId: mentoria.id, name: "Hel" });
    const t = await addMenteeTask(user.id, mentee.id, { title: "Revisar" });
    await setTaskDone(user.id, t.id, true, TZ);
    expect((await getGoal(user.id, goal.id, TZ)).currentValue).toBe(1);
  });
});
