import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { listWorkspaces } from "@/server/workspaces";
import { createTestUser } from "../../tests/factories";
import { todayYmd } from "@/lib/dates";
import { convertLead, createLead, getLead } from "./crm";
import { getMentee } from "./mentees";
import { listContent, createContent } from "./content";
import { createGoal, listGoals } from "./goals";
import { listAssessments, saveAssessment, listAreas } from "./maas";
import { listReviews, saveReview } from "./reviews";
import { consolidatedReport } from "./reports";
import { previewImport } from "./finance/imports";
import { createAccount } from "./finance/accounts";
import { searchAll } from "./search";

const TZ = "America/Sao_Paulo";

/**
 * Isolamento entre usuárias e permissões por módulo: cada leitura nova da
 * Fase 4–6 respeita o ambiente e o módulo liberado ao colaborador.
 */
describe("permissões e isolamento", () => {
  it("colaborador com CRM e mentorados, sem financeiro, não vê valores de venda", async () => {
    const owner = await createTestUser({ name: "Gabriela" });
    const mentoria = (await listWorkspaces(owner.id)).find((w) => w.kind === "MENTORIA")!;
    const lead = await createLead(owner.id, { workspaceId: mentoria.id, name: "Paula" });
    const today = todayYmd(TZ);
    const { menteeId } = await convertLead(owner.id, lead.id, { sale: { description: "Mentoria", totalCents: 500_000, saleDate: today, paymentType: "CASH", installmentsCount: 1, firstDueDate: today }, createMentee: true });

    const helper = await createTestUser({ name: "Assistente" });
    await db.workspaceMember.create({ data: { workspaceId: mentoria.id, userId: helper.id, role: "EDITOR", modules: ["crm", "mentees"] } });
    expect((await getLead(owner.id, lead.id)).sales).toHaveLength(1);
    expect((await getLead(helper.id, lead.id)).sales).toEqual([]);
    expect((await getMentee(owner.id, menteeId!)).sales).toHaveLength(1);
    expect((await getMentee(helper.id, menteeId!)).sales).toEqual([]);

    // Relatório do colaborador não traz o financeiro da dona (só o dos próprios ambientes)
    const rep = await consolidatedReport(helper.id, { from: today, to: today }, TZ);
    expect(rep.mentoria?.revenueCents ?? 0).toBe(0);
    expect(rep.personal?.incomeCents ?? 0).toBe(0);
  });

  it("outra usuária não enxerga conteúdo, metas, MAAS, revisões, extratos nem resultados de busca", async () => {
    const a = await createTestUser({ name: "Gabriela" });
    const b = await createTestUser({ name: "Outra" });
    const wsA = await listWorkspaces(a.id);
    const mentoria = wsA.find((w) => w.kind === "MENTORIA")!;
    const pessoal = wsA.find((w) => w.kind === "PESSOAL")!;
    await createContent(a.id, { workspaceId: mentoria.id, title: "Segredo de lançamento" }, TZ);
    await createGoal(a.id, { workspaceId: pessoal.id, type: "PERSONAL", title: "Meta secreta", targetValue: 10 });
    const area = (await listAreas(a.id))[0]!;
    await saveAssessment(a.id, { date: todayYmd(TZ), scores: [{ areaId: area.id, score: 7 }] });
    await saveReview(a.id, { kind: "WEEKLY", day: todayYmd(TZ), wins: "x" }, TZ);
    const conta = await createAccount(a.id, { workspaceId: pessoal.id, name: "Conta", type: "CHECKING", initialBalanceCents: 0 });

    expect(await listContent(b.id, {})).toEqual([]);
    expect(await listGoals(b.id, {}, TZ)).toEqual([]);
    expect(await listAssessments(b.id)).toEqual([]);
    expect(await listReviews(b.id)).toEqual([]);
    await expect(previewImport(b.id, { accountId: conta.id, fileName: "x.csv", content: "Data;Descrição;Valor\n01/10/2026;X;1,00" })).rejects.toThrow();
    expect(await searchAll(b.id, "Segredo", TZ)).toEqual([]);
    expect(await searchAll(b.id, "Meta secreta", TZ)).toEqual([]);
    expect((await searchAll(a.id, "Segredo", TZ)).map((r) => r.type)).toContain("content");
    // Outra usuária não pode criar conteúdo no ambiente da dona
    await expect(createContent(b.id, { workspaceId: mentoria.id, title: "Invasão" }, TZ)).rejects.toThrow();
  });
});
