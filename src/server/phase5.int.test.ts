import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { listWorkspaces } from "@/server/workspaces";
import { createTestUser } from "../../tests/factories";
import { addDaysYmd, startOfMonthYmd, todayYmd } from "@/lib/dates";
import { createArea, deleteAssessment, listAreas, maasOverview, objectiveFromScore, renameArea, saveAssessment, setAreaActive } from "./maas";
import { getReview, listReviews, saveReview } from "./reviews";
import { consolidatedReport, reportRows } from "./reports";
import { listGoals } from "./goals";
import { createAccount } from "./finance/accounts";
import { createTransaction } from "./finance/transactions";
import { createTask, setTaskDone } from "./tasks";

const TZ = "America/Sao_Paulo";

describe("MAAS", () => {
  it("avaliação por áreas, substituição na mesma data, histórico preservado ao renomear e objetivo a partir do plano", async () => {
    const user = await createTestUser();
    const areas = await listAreas(user.id);
    expect(areas).toHaveLength(12);
    const [saude, financas] = [areas.find((a) => a.name === "Saúde")!, areas.find((a) => a.name === "Finanças")!];

    await saveAssessment(user.id, { date: "2026-09-01", scores: [{ areaId: saude.id, score: 5 }, { areaId: financas.id, score: 7 }] });
    const oct = await saveAssessment(user.id, {
      date: "2026-10-01",
      scores: [{ areaId: saude.id, score: 4 }, { areaId: financas.id, score: 6, goal: "Reserva de 6 meses", actionPlan: "- Cortar assinaturas\n- Investir 20% do salário", comment: "Gastos altos" }],
    });
    // Mesma data: substitui
    const again = await saveAssessment(user.id, { date: "2026-10-01", scores: [{ areaId: saude.id, score: 8 }, { areaId: financas.id, score: 6, goal: "Reserva de 6 meses", actionPlan: "- Cortar assinaturas\n- Investir 20% do salário" }] });
    expect(again.id).toBe(oct.id);
    expect(await db.maasAssessment.count({ where: { userId: user.id } })).toBe(2);
    await expect(saveAssessment(user.id, { date: "2026-10-02", scores: [{ areaId: saude.id, score: 11 }] })).rejects.toThrow(/0 a 10/);

    await renameArea(user.id, saude.id, "Saúde e energia");
    const ov = await maasOverview(user.id);
    expect(ov.latest).toMatchObject({ date: "2026-10-01", average: 7 });
    expect(ov.comparison.find((c) => c.key === saude.id)).toMatchObject({ name: "Saúde e energia", score: 8, delta: 3 });
    expect(ov.assessments[0]!.scores.find((s) => s.areaId === saude.id)!.areaName).toBe("Saúde");

    const score = again.scores.find((s) => s.areaId === financas.id)!;
    const goal = await objectiveFromScore(user.id, score.id);
    expect(goal.isObjective).toBe(true);
    const objectives = await listGoals(user.id, { objectives: true }, TZ);
    expect(objectives[0]).toMatchObject({ title: "Reserva de 6 meses", category: "Finanças", measure: "QUALITATIVE" });
    expect(objectives[0]!.steps.map((s) => s.title)).toEqual(["Cortar assinaturas", "Investir 20% do salário"]);
    // Objetivos não aparecem na lista de metas
    expect((await listGoals(user.id, {}, TZ)).some((g) => g.id === goal.id)).toBe(false);

    await setAreaActive(user.id, saude.id, false);
    expect((await listAreas(user.id)).some((a) => a.id === saude.id)).toBe(false);
    await expect(createArea(user.id, "finanças")).rejects.toThrow(/Já existe/);
    await deleteAssessment(user.id, oct.id);
    expect((await maasOverview(user.id)).latest?.date).toBe("2026-09-01");

    // Outra usuária não enxerga nem altera
    const other = await createTestUser();
    await expect(deleteAssessment(other.id, again.id)).rejects.toThrow();
    await expect(objectiveFromScore(other.id, score.id)).rejects.toThrow();
  });
});

describe("revisões e relatório consolidado", () => {
  it("revisão semanal guarda a reflexão junto dos números do período", async () => {
    const user = await createTestUser();
    const today = todayYmd(TZ);
    const r = await getReview(user.id, "WEEKLY", today, TZ);
    expect(r.saved).toBeNull();
    expect(r.digest.sections.map((s) => s.title)).toContain("Tarefas concluídas");
    await saveReview(user.id, { kind: "WEEKLY", day: today, wins: "Fechei 2 vendas", priorities: "Gravar 3 Reels", rating: 4 }, TZ);
    await saveReview(user.id, { kind: "WEEKLY", day: today, wins: "Fechei 3 vendas", rating: 5 }, TZ);
    const again = await getReview(user.id, "WEEKLY", today, TZ);
    expect(again.saved).toMatchObject({ wins: "Fechei 3 vendas", priorities: null, rating: 5 });
    expect(await listReviews(user.id)).toHaveLength(1);
    await expect(saveReview(user.id, { kind: "MONTHLY", day: addDaysYmd(today, 70), wins: "x" }, TZ)).rejects.toThrow(/ainda não começou/);
    await expect(saveReview(user.id, { kind: "MONTHLY", day: today }, TZ)).rejects.toThrow(/pelo menos um/);
  });

  it("relatório soma dados reais do período e exporta linhas", async () => {
    const user = await createTestUser({ name: "Gabriela" });
    const ws = await listWorkspaces(user.id);
    const pessoal = ws.find((w) => w.kind === "PESSOAL")!;
    const today = todayYmd(TZ);
    const from = startOfMonthYmd(today);
    const conta = await createAccount(user.id, { workspaceId: pessoal.id, name: "Conta", type: "CHECKING", initialBalanceCents: 0 });
    await createTransaction(user.id, { workspaceId: pessoal.id, type: "INCOME", description: "Freela", amountCents: 50_000, competenceDate: today, paid: true, paidAt: today, accountId: conta.id }, TZ);
    await createTransaction(user.id, { workspaceId: pessoal.id, type: "EXPENSE", description: "Mercado", amountCents: 20_000, competenceDate: today }, TZ);
    const t = await createTask(user.id, { workspaceId: pessoal.id, title: "Organizar documentos" });
    await setTaskDone(user.id, t.id, true, TZ);

    const rep = await consolidatedReport(user.id, { from, to: today }, TZ);
    expect(rep.personal).toMatchObject({ incomeCents: 50_000, expenseCents: 20_000, resultCents: 30_000 });
    expect(rep.tasks).toMatchObject({ created: 1, completed: 1 });
    expect(rep.tasks!.completedByWorkspace).toEqual([{ workspace: pessoal.name, count: 1 }]);
    expect(rep.mentoria).toMatchObject({ salesCount: 0, revenueCents: 0 });
    const rows = reportRows(rep);
    expect(rows).toContainEqual(["Pessoal", "Resultado (R$)", "300,00"]);
    await expect(consolidatedReport(user.id, { from: today, to: addDaysYmd(today, -1) }, TZ)).rejects.toThrow(/depois do início/);
  });
});
