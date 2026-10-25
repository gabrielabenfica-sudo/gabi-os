import { z } from "zod";
import { db } from "@/server/db";
import { AppError, NotFoundError } from "@/server/errors";
import { findModuleWorkspace } from "@/server/workspaces";
import { createGoal } from "@/server/goals";
import { dateToYmd, ymdToDate } from "@/lib/dates";
import { maasStats } from "@/lib/maas";

/**
 * MAAS — Mapa de Autoavaliação Sistêmica. É pessoal: pertence à usuária,
 * não a um ambiente, e nunca é compartilhado com colaboradores.
 */

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const areaName = z.string().trim().min(1, "Informe o nome da área.").max(60);

export async function listAreas(userId: string, opts: { includeInactive?: boolean } = {}) {
  return db.maasArea.findMany({ where: { userId, ...(opts.includeInactive ? {} : { active: true }) }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
}

async function ownArea(userId: string, id: string) {
  const a = await db.maasArea.findFirst({ where: { id, userId } });
  if (!a) throw new NotFoundError("Área");
  return a;
}

export async function createArea(userId: string, name: string) {
  const clean = areaName.parse(name);
  if (await db.maasArea.findFirst({ where: { userId, name: { equals: clean, mode: "insensitive" } } })) throw new AppError("Já existe uma área com esse nome.");
  const last = await db.maasArea.findFirst({ where: { userId }, orderBy: { position: "desc" } });
  return db.maasArea.create({ data: { userId, name: clean, position: (last?.position ?? -1) + 1 } });
}

export async function renameArea(userId: string, id: string, name: string) {
  await ownArea(userId, id);
  const clean = areaName.parse(name);
  if (await db.maasArea.findFirst({ where: { userId, NOT: { id }, name: { equals: clean, mode: "insensitive" } } })) throw new AppError("Já existe uma área com esse nome.");
  // O nome antigo continua nas avaliações já feitas (histórico preservado)
  return db.maasArea.update({ where: { id }, data: { name: clean } });
}

export async function setAreaActive(userId: string, id: string, active: boolean) {
  await ownArea(userId, id);
  return db.maasArea.update({ where: { id }, data: { active } });
}

export async function reorderAreas(userId: string, orderedIds: string[]) {
  const areas = await db.maasArea.findMany({ where: { userId }, select: { id: true } });
  if (areas.length !== orderedIds.length || !areas.every((a) => orderedIds.includes(a.id))) throw new AppError("Lista de áreas inválida.");
  await db.$transaction(orderedIds.map((id, position) => db.maasArea.update({ where: { id }, data: { position } })));
}

// ─── Avaliações ────────────────────────────────────────────────

export const assessmentSchema = z.object({
  date: ymd,
  notes: z.string().max(10000).nullable().optional(),
  scores: z
    .array(
      z.object({
        areaId: z.string().min(1),
        score: z.number().int().min(0, "Nota de 0 a 10.").max(10, "Nota de 0 a 10."),
        comment: z.string().max(2000).nullable().optional(),
        actionPlan: z.string().max(3000).nullable().optional(),
        goal: z.string().max(300).nullable().optional(),
      }),
    )
    .min(1, "Dê nota a pelo menos uma área."),
});
export type AssessmentInput = z.input<typeof assessmentSchema>;

const assessmentInclude = { scores: { orderBy: { areaName: "asc" as const } } };

/** Uma avaliação por data: salvar de novo na mesma data substitui as notas. */
export async function saveAssessment(userId: string, input: AssessmentInput) {
  const data = assessmentSchema.parse(input);
  const ids = [...new Set(data.scores.map((s) => s.areaId))];
  if (ids.length !== data.scores.length) throw new AppError("Área repetida na avaliação.");
  const areas = await db.maasArea.findMany({ where: { userId, id: { in: ids } } });
  if (areas.length !== ids.length) throw new AppError("Área inválida.");
  const nameOf = new Map(areas.map((a) => [a.id, a.name]));
  const date = ymdToDate(data.date);
  return db.$transaction(async (tx) => {
    const existing = await tx.maasAssessment.findFirst({ where: { userId, date } });
    const a = existing
      ? await tx.maasAssessment.update({ where: { id: existing.id }, data: { notes: data.notes || null } })
      : await tx.maasAssessment.create({ data: { userId, date, notes: data.notes || null } });
    if (existing) await tx.maasScore.deleteMany({ where: { assessmentId: a.id } });
    await tx.maasScore.createMany({
      data: data.scores.map((s) => ({
        assessmentId: a.id,
        areaId: s.areaId,
        areaName: nameOf.get(s.areaId)!,
        score: s.score,
        comment: s.comment || null,
        actionPlan: s.actionPlan || null,
        goal: s.goal || null,
      })),
    });
    return tx.maasAssessment.findUniqueOrThrow({ where: { id: a.id }, include: assessmentInclude });
  });
}

export async function deleteAssessment(userId: string, id: string) {
  const a = await db.maasAssessment.findFirst({ where: { id, userId } });
  if (!a) throw new NotFoundError("Avaliação");
  await db.maasAssessment.delete({ where: { id } });
}

export async function listAssessments(userId: string) {
  return db.maasAssessment.findMany({ where: { userId }, include: assessmentInclude, orderBy: { date: "desc" }, take: 200 });
}

export type AssessmentRow = Awaited<ReturnType<typeof listAssessments>>[number];

/**
 * Visão geral: última avaliação, comparação com a anterior, média e a série
 * por área (pelo areaId quando existe; senão pelo nome gravado).
 */
export async function maasOverview(userId: string) {
  const [areas, assessments] = await Promise.all([listAreas(userId, { includeInactive: true }), listAssessments(userId)]);
  const chronological = [...assessments].reverse().map((a) => ({
    id: a.id,
    date: dateToYmd(a.date),
    scores: a.scores.map((s) => ({ key: s.areaId ?? `nome:${s.areaName}`, name: s.areaName, score: s.score })),
  }));
  const labels = new Map<string, string>();
  for (const a of areas) labels.set(a.id, a.name);
  return { areas, assessments, ...maasStats(chronological, labels) };
}

/** Transforma o plano de ação de uma área em um objetivo pessoal (com etapas). */
export async function objectiveFromScore(userId: string, scoreId: string) {
  const s = await db.maasScore.findFirst({ where: { id: scoreId, assessment: { userId } }, include: { assessment: true } });
  if (!s) throw new NotFoundError("Nota");
  const ws = await findModuleWorkspace(userId, "PESSOAL", "goals");
  if (!ws) throw new AppError("Sem acesso às metas do ambiente Pessoal.");
  const steps = (s.actionPlan ?? "")
    .split(/\n|;/)
    .map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 30);
  return createGoal(userId, {
    workspaceId: ws.id,
    type: "DEVELOPMENT",
    title: (s.goal || `Evoluir em ${s.areaName}`).slice(0, 200),
    description: s.comment ? `MAAS ${dateToYmd(s.assessment.date).split("-").reverse().join("/")} · nota ${s.score}/10. ${s.comment}` : `MAAS · nota ${s.score}/10`,
    category: s.areaName,
    measure: "QUALITATIVE",
    horizon: "CUSTOM",
    isObjective: true,
    steps,
  });
}
