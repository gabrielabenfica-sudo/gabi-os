import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { AppError, NotFoundError } from "@/server/errors";
import { requireWorkspaceAccess } from "@/server/workspaces";
import { audit } from "@/server/audit";
import { positionAt, POSITION_GAP } from "@/lib/positions";
import { ymdToDate, zonedToUtc, addDaysYmd, todayYmd } from "@/lib/dates";
import { createSale, type SaleInput } from "@/server/finance/sales";

const access = (userId: string, workspaceId: string, write = false) => requireWorkspaceAccess(userId, workspaceId, { module: "crm", write });

// ═══════════════════════════════════════════════════════════════
// Etapas do funil
// ═══════════════════════════════════════════════════════════════

export async function listStages(userId: string, workspaceId: string) {
  await access(userId, workspaceId);
  return db.pipelineStage.findMany({ where: { workspaceId }, orderBy: { position: "asc" } });
}

export async function createStage(userId: string, workspaceId: string, name: string) {
  await access(userId, workspaceId, true);
  const clean = z.string().trim().min(1, "Informe o nome da etapa.").max(60).parse(name);
  const stages = await db.pipelineStage.findMany({ where: { workspaceId }, orderBy: { position: "asc" } });
  // Novas etapas entram antes das etapas finais (venda realizada / perdido)
  const firstFinal = stages.findIndex((s) => s.isWon || s.isLost);
  const insertAt = firstFinal === -1 ? stages.length : firstFinal;
  return db.$transaction(async (tx) => {
    for (const [i, s] of stages.entries()) {
      const pos = i >= insertAt ? i + 1 : i;
      if (pos !== s.position) await tx.pipelineStage.update({ where: { id: s.id }, data: { position: pos } });
    }
    return tx.pipelineStage.create({ data: { workspaceId, name: clean, position: insertAt } });
  });
}

export async function renameStage(userId: string, stageId: string, name: string) {
  const stage = await db.pipelineStage.findUnique({ where: { id: stageId } });
  if (!stage) throw new NotFoundError("Etapa");
  await access(userId, stage.workspaceId, true);
  return db.pipelineStage.update({ where: { id: stageId }, data: { name: z.string().trim().min(1).max(60).parse(name) } });
}

export async function reorderStages(userId: string, workspaceId: string, orderedIds: string[]) {
  await access(userId, workspaceId, true);
  const stages = await db.pipelineStage.findMany({ where: { workspaceId } });
  if (orderedIds.length !== stages.length || !stages.every((s) => orderedIds.includes(s.id))) throw new AppError("Lista de etapas inválida.");
  await db.$transaction(orderedIds.map((id, position) => db.pipelineStage.update({ where: { id }, data: { position } })));
}

export async function deleteStage(userId: string, stageId: string, moveToId: string) {
  const stage = await db.pipelineStage.findUnique({ where: { id: stageId } });
  if (!stage) throw new NotFoundError("Etapa");
  await access(userId, stage.workspaceId, true);
  if (stage.isWon || stage.isLost) throw new AppError("As etapas “venda realizada” e “perdido” não podem ser excluídas.");
  const target = await db.pipelineStage.findFirst({ where: { id: moveToId, workspaceId: stage.workspaceId, NOT: { id: stageId } } });
  if (!target) throw new AppError("Escolha outra etapa para receber os leads.");
  await db.$transaction([
    db.lead.updateMany({ where: { stageId }, data: { stageId: target.id } }),
    db.pipelineStage.delete({ where: { id: stageId } }),
  ]);
}

// ═══════════════════════════════════════════════════════════════
// Leads
// ═══════════════════════════════════════════════════════════════

export const leadSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(1, "Informe o nome.").max(120),
  email: z.string().trim().email("E-mail inválido.").max(200).or(z.literal("")).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  instagram: z.string().trim().max(60).nullable().optional(),
  source: z.string().trim().max(60).nullable().optional(),
  interest: z.string().trim().max(500).nullable().optional(),
  programId: z.string().nullable().optional(),
  potentialCents: z.number().int().min(0).max(100_000_000_000).nullable().optional(),
  stageId: z.string().optional(),
  nextAction: z.string().trim().max(300).nullable().optional(),
  nextActionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  owner: z.string().trim().max(100).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});
export type LeadInput = z.input<typeof leadSchema>;

export const leadInclude = {
  stage: { select: { id: true, name: true, isWon: true, isLost: true } },
  program: { select: { id: true, name: true } },
  mentee: { select: { id: true, name: true } },
  _count: { select: { activities: true, sales: true } },
} satisfies Prisma.LeadInclude;

export type LeadCard = Prisma.LeadGetPayload<{ include: typeof leadInclude }>;

function leadData(d: z.output<typeof leadSchema>) {
  return {
    name: d.name,
    email: d.email || null,
    phone: d.phone || null,
    instagram: d.instagram ? d.instagram.replace(/^@/, "") : null,
    source: d.source || null,
    interest: d.interest || null,
    programId: d.programId || null,
    potentialCents: d.potentialCents ?? null,
    nextAction: d.nextAction || null,
    // Próxima ação guardada ao meio-dia UTC (data sem hora)
    nextActionDate: d.nextActionDate ? new Date(`${d.nextActionDate}T12:00:00Z`) : null,
    owner: d.owner || null,
    notes: d.notes || null,
  };
}

async function assertProgram(workspaceId: string, programId?: string | null) {
  if (programId && !(await db.mentorshipProgram.findFirst({ where: { id: programId, workspaceId } }))) throw new AppError("Produto inválido para este ambiente.");
}

export async function listLeads(userId: string, workspaceId: string, filters: { search?: string; source?: string; includeClosed?: boolean } = {}) {
  await access(userId, workspaceId);
  const where: Prisma.LeadWhereInput = { workspaceId, deletedAt: null };
  if (filters.source) where.source = filters.source;
  if (filters.search?.trim()) {
    const q = { contains: filters.search.trim(), mode: "insensitive" as const };
    where.OR = [{ name: q }, { email: q }, { instagram: q }, { phone: q }, { interest: q }];
  }
  if (!filters.includeClosed) {
    // Fechados há mais de 60 dias saem do quadro (continuam nos relatórios)
    const cutoff = new Date(Date.now() - 60 * 86_400_000);
    where.AND = [{ OR: [{ stage: { isWon: false, isLost: false } }, { updatedAt: { gte: cutoff } }] }];
  }
  return db.lead.findMany({ where, include: leadInclude, orderBy: [{ position: "asc" }, { createdAt: "asc" }], take: 2000 });
}

export async function getLead(userId: string, leadId: string) {
  const lead = await db.lead.findFirst({
    where: { id: leadId, deletedAt: null },
    include: { ...leadInclude, activities: { orderBy: { createdAt: "desc" }, take: 200 }, sales: { where: { deletedAt: null }, select: { id: true, totalCents: true, saleDate: true, status: true } } },
  });
  if (!lead) throw new NotFoundError("Lead");
  await access(userId, lead.workspaceId);
  // Valores de venda são dados do financeiro: só aparecem com essa permissão
  const canFinance = await requireWorkspaceAccess(userId, lead.workspaceId, { module: "finance" }).then(() => true, () => false);
  return canFinance ? lead : { ...lead, sales: [] };
}

async function endPosition(stageId: string) {
  const last = await db.lead.findFirst({ where: { stageId, deletedAt: null }, orderBy: { position: "desc" }, select: { position: true } });
  return (last?.position ?? 0) + POSITION_GAP;
}

function closingStamps(to: { isWon: boolean; isLost: boolean }, now = new Date()) {
  return { wonAt: to.isWon ? now : null, lostAt: to.isLost ? now : null };
}

export async function createLead(userId: string, input: LeadInput) {
  const data = leadSchema.parse(input);
  await access(userId, data.workspaceId, true);
  await assertProgram(data.workspaceId, data.programId);
  const stage = data.stageId
    ? await db.pipelineStage.findFirst({ where: { id: data.stageId, workspaceId: data.workspaceId } })
    : await db.pipelineStage.findFirst({ where: { workspaceId: data.workspaceId }, orderBy: { position: "asc" } });
  if (!stage) throw new AppError("Configure as etapas do funil primeiro.");
  const lead = await db.lead.create({
    data: {
      workspaceId: data.workspaceId,
      stageId: stage.id,
      ...leadData(data),
      position: await endPosition(stage.id),
      ...closingStamps(stage),
      activities: { create: { type: "STAGE_CHANGE", content: `Lead criado em “${stage.name}”` } },
    },
    include: leadInclude,
  });
  await audit({ userId, workspaceId: data.workspaceId, entity: "Lead", entityId: lead.id, action: "create" });
  return lead;
}

async function loadForWrite(userId: string, leadId: string) {
  const lead = await db.lead.findFirst({ where: { id: leadId, deletedAt: null }, include: { stage: true } });
  if (!lead) throw new NotFoundError("Lead");
  await access(userId, lead.workspaceId, true);
  return lead;
}

export async function updateLead(userId: string, leadId: string, input: Omit<LeadInput, "workspaceId">) {
  const before = await loadForWrite(userId, leadId);
  const data = leadSchema.parse({ ...input, workspaceId: before.workspaceId });
  await assertProgram(before.workspaceId, data.programId);
  return db.$transaction(async (tx) => {
    await tx.lead.update({ where: { id: leadId }, data: leadData(data) });
    if (data.stageId && data.stageId !== before.stageId) await changeStageTx(tx, before, data.stageId);
    return tx.lead.findUniqueOrThrow({ where: { id: leadId }, include: leadInclude });
  });
}

type LeadWithStage = Prisma.LeadGetPayload<{ include: { stage: true } }>;

async function changeStageTx(tx: Prisma.TransactionClient, lead: LeadWithStage, stageId: string, position?: number, note?: string) {
  const to = await tx.pipelineStage.findFirst({ where: { id: stageId, workspaceId: lead.workspaceId } });
  if (!to) throw new AppError("Etapa inválida.");
  const keep = to.isWon === lead.stage.isWon && to.isLost === lead.stage.isLost;
  await tx.lead.update({
    where: { id: lead.id },
    data: { stageId: to.id, ...(position !== undefined ? { position } : {}), ...(keep ? {} : closingStamps(to)), ...(to.isLost ? {} : { lostReason: null }) },
  });
  if (to.id !== lead.stageId) {
    await tx.leadActivity.create({ data: { leadId: lead.id, type: "STAGE_CHANGE", content: note ?? `${lead.stage.name} → ${to.name}` } });
  }
  return to;
}

/** Arrastar no Kanban do funil. */
export async function moveLead(userId: string, leadId: string, stageId: string, index: number) {
  const lead = await loadForWrite(userId, leadId);
  return db.$transaction(async (tx) => {
    const siblings = await tx.lead.findMany({
      where: { stageId, deletedAt: null, NOT: { id: leadId } },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true, position: true },
    });
    let position = positionAt(siblings.map((s) => s.position), index);
    if (position === null) {
      const i = Math.max(0, Math.min(index, siblings.length));
      const ordered = [...siblings.slice(0, i).map((s) => s.id), leadId, ...siblings.slice(i).map((s) => s.id)];
      for (const [k, id] of ordered.entries()) await tx.lead.update({ where: { id }, data: { position: (k + 1) * POSITION_GAP } });
      position = (i + 1) * POSITION_GAP;
    }
    if (stageId !== lead.stageId) await changeStageTx(tx, lead, stageId, position);
    else await tx.lead.update({ where: { id: leadId }, data: { position } });
    return tx.lead.findUniqueOrThrow({ where: { id: leadId }, include: leadInclude });
  });
}

export async function markLeadLost(userId: string, leadId: string, reason: string) {
  const lead = await loadForWrite(userId, leadId);
  const lost = await db.pipelineStage.findFirst({ where: { workspaceId: lead.workspaceId, isLost: true } });
  if (!lost) throw new AppError("Não há etapa de perdidos no funil.");
  const clean = z.string().trim().max(300).parse(reason);
  return db.$transaction(async (tx) => {
    await changeStageTx(tx, lead, lost.id, await endPosition(lost.id), `Perdido${clean ? `: ${clean}` : ""}`);
    await tx.lead.update({ where: { id: leadId }, data: { lostReason: clean || null } });
  });
}

export async function addLeadActivity(userId: string, leadId: string, input: { type: string; content: string }) {
  await loadForWrite(userId, leadId);
  const data = z.object({ type: z.enum(["NOTE", "CALL", "MESSAGE", "MEETING"]), content: z.string().trim().min(1, "Escreva o registro.").max(5000) }).parse(input);
  await db.lead.update({ where: { id: leadId }, data: { updatedAt: new Date() } });
  return db.leadActivity.create({ data: { leadId, ...data } });
}

export async function deleteLeadActivity(userId: string, activityId: string) {
  const a = await db.leadActivity.findUnique({ where: { id: activityId } });
  if (!a) throw new NotFoundError("Registro");
  await loadForWrite(userId, a.leadId);
  if (a.type === "STAGE_CHANGE") throw new AppError("Mudanças de etapa fazem parte do histórico e não podem ser apagadas.");
  await db.leadActivity.delete({ where: { id: activityId } });
}

export async function deleteLead(userId: string, leadId: string) {
  const lead = await loadForWrite(userId, leadId);
  await db.lead.update({ where: { id: leadId }, data: { deletedAt: new Date() } });
  await audit({ userId, workspaceId: lead.workspaceId, entity: "Lead", entityId: leadId, action: "delete" });
}

/**
 * Converte o lead em venda (e, opcionalmente, em mentorado).
 * A venda segue as regras do financeiro: faturamento na data da venda,
 * recebimento por parcela. O lead vai para “venda realizada”.
 */
export async function convertLead(
  userId: string,
  leadId: string,
  input: { sale: Omit<SaleInput, "workspaceId" | "customerName" | "leadId" | "menteeId">; createMentee: boolean; menteeStartDate?: string | null; paymentTerms?: string | null },
) {
  const lead = await loadForWrite(userId, leadId);
  if (await db.sale.count({ where: { leadId, deletedAt: null, status: "ACTIVE" } })) throw new AppError("Este lead já tem uma venda registrada.");
  await requireWorkspaceAccess(userId, lead.workspaceId, { module: "finance", write: true });
  const won = await db.pipelineStage.findFirst({ where: { workspaceId: lead.workspaceId, isWon: true } });
  if (!won) throw new AppError("Não há etapa de venda realizada no funil.");

  let menteeId: string | null = lead.menteeId;
  if (input.createMentee && !menteeId) {
    await requireWorkspaceAccess(userId, lead.workspaceId, { module: "mentees", write: true });
    const program = input.sale.programId ? await db.mentorshipProgram.findFirst({ where: { id: input.sale.programId, workspaceId: lead.workspaceId } }) : null;
    const start = input.menteeStartDate || input.sale.saleDate;
    const mentee = await db.mentee.create({
      data: {
        workspaceId: lead.workspaceId,
        programId: program?.id ?? null,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        instagram: lead.instagram,
        startDate: ymdToDate(start),
        expectedEndDate: program?.durationWeeks ? ymdToDate(addDaysYmd(start, program.durationWeeks * 7)) : null,
        contractedCents: input.sale.totalCents,
        paymentTerms: input.paymentTerms || (input.sale.paymentType === "CASH" ? "À vista" : `${input.sale.installmentsCount}x`),
        timeline: { create: { date: ymdToDate(start), title: "Início da mentoria", content: program?.name ?? input.sale.description } },
      },
    });
    menteeId = mentee.id;
  }

  const sale = await createSale(userId, { ...input.sale, workspaceId: lead.workspaceId, customerName: lead.name, leadId, menteeId });
  await db.$transaction(async (tx) => {
    await changeStageTx(tx, lead, won.id, await endPosition(won.id), "Venda realizada");
    await tx.lead.update({ where: { id: leadId }, data: { menteeId, wonAt: new Date() } });
  });
  await audit({ userId, workspaceId: lead.workspaceId, entity: "Lead", entityId: leadId, action: "convert", after: { saleId: sale.id, menteeId } });
  return { saleId: sale.id, menteeId };
}

// ═══════════════════════════════════════════════════════════════
// Métricas
// ═══════════════════════════════════════════════════════════════

export async function crmMetrics(userId: string, workspaceId: string, range: { from: string; to: string }, tz: string) {
  await access(userId, workspaceId);
  const start = zonedToUtc(range.from, "00:00", tz);
  const end = zonedToUtc(addDaysYmd(range.to, 1), "00:00", tz);
  const base = { workspaceId, deletedAt: null };
  const [created, won, lost, open, stages, overdue] = await Promise.all([
    db.lead.findMany({ where: { ...base, createdAt: { gte: start, lt: end } }, select: { source: true } }),
    db.lead.findMany({ where: { ...base, wonAt: { gte: start, lt: end } }, select: { createdAt: true, wonAt: true } }),
    db.lead.count({ where: { ...base, lostAt: { gte: start, lt: end } } }),
    db.lead.findMany({ where: { ...base, stage: { isWon: false, isLost: false } }, select: { stageId: true, potentialCents: true } }),
    db.pipelineStage.findMany({ where: { workspaceId }, orderBy: { position: "asc" } }),
    db.lead.count({ where: { ...base, stage: { isWon: false, isLost: false }, nextActionDate: { lt: new Date(`${todayYmd(tz)}T00:00:00Z`) } } }),
  ]);
  const closed = won.length + lost;
  const cycle = won.length ? Math.round(won.reduce((s, l) => s + (l.wonAt!.getTime() - l.createdAt.getTime()), 0) / won.length / 86_400_000) : null;
  const sources = new Map<string, number>();
  for (const c of created) sources.set(c.source || "Não informado", (sources.get(c.source || "Não informado") ?? 0) + 1);
  return {
    newLeads: created.length,
    won: won.length,
    lost,
    // Conversão = ganhos ÷ (ganhos + perdidos) no período
    conversionRate: closed ? Math.round((won.length / closed) * 1000) / 10 : null,
    openLeads: open.length,
    pipelineCents: open.reduce((s, l) => s + (l.potentialCents ?? 0), 0),
    avgCycleDays: cycle,
    overdueActions: overdue,
    byStage: stages.filter((s) => !s.isWon && !s.isLost).map((s) => ({ id: s.id, name: s.name, count: open.filter((l) => l.stageId === s.id).length })),
    sources: [...sources.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  };
}

export async function listSources(userId: string, workspaceId: string) {
  await access(userId, workspaceId);
  const rows = await db.lead.findMany({ where: { workspaceId, source: { not: null } }, distinct: ["source"], select: { source: true } });
  return rows.map((r) => r.source!).sort((a, b) => a.localeCompare(b, "pt-BR"));
}
