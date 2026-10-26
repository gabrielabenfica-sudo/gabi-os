import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { AppError, NotFoundError } from "@/server/errors";
import { accessibleWorkspaceIds, requireWorkspaceAccess } from "@/server/workspaces";
import { audit } from "@/server/audit";
import { addDaysYmd, dateToYmd, ymdToDate, zonedToUtc } from "@/lib/dates";
import { positionAt, POSITION_GAP } from "@/lib/positions";
import { compareFormats, CONTENT_FORMATS, engagementRate, interactions, latestMetric } from "@/lib/content";

const access = (userId: string, workspaceId: string, write = false) => requireWorkspaceAccess(userId, workspaceId, { module: "content", write });

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido.");
const optInt = z.number().int().min(0).max(2_000_000_000).nullable().optional();

// ═══════════════════════════════════════════════════════════════
// Etapas do fluxo de produção
// ═══════════════════════════════════════════════════════════════

export async function listContentStatuses(userId: string, workspaceId: string) {
  await access(userId, workspaceId);
  return db.contentStatus.findMany({ where: { workspaceId }, orderBy: { position: "asc" }, include: { _count: { select: { items: { where: { deletedAt: null } } } } } });
}

export async function createContentStatus(userId: string, workspaceId: string, name: string) {
  await access(userId, workspaceId, true);
  const clean = z.string().trim().min(1, "Informe o nome.").max(60).parse(name);
  const statuses = await db.contentStatus.findMany({ where: { workspaceId }, orderBy: { position: "asc" } });
  // Nova etapa entra antes de "Publicado" (a etapa final)
  const publishedIdx = statuses.findIndex((s) => s.isPublished);
  const idx = publishedIdx === -1 ? statuses.length : publishedIdx;
  return db.$transaction(async (tx) => {
    for (const [i, s] of statuses.entries()) if (i >= idx) await tx.contentStatus.update({ where: { id: s.id }, data: { position: i + 1 } });
    return tx.contentStatus.create({ data: { workspaceId, name: clean, position: idx } });
  });
}

export async function renameContentStatus(userId: string, statusId: string, name: string) {
  const s = await db.contentStatus.findUnique({ where: { id: statusId } });
  if (!s) throw new NotFoundError("Etapa");
  await access(userId, s.workspaceId, true);
  return db.contentStatus.update({ where: { id: statusId }, data: { name: z.string().trim().min(1, "Informe o nome.").max(60).parse(name) } });
}

export async function reorderContentStatuses(userId: string, workspaceId: string, orderedIds: string[]) {
  await access(userId, workspaceId, true);
  const existing = await db.contentStatus.findMany({ where: { workspaceId }, select: { id: true } });
  if (existing.length !== orderedIds.length || !existing.every((e) => orderedIds.includes(e.id))) throw new AppError("Lista de etapas inválida.");
  await db.$transaction(orderedIds.map((id, position) => db.contentStatus.update({ where: { id }, data: { position } })));
}

export async function deleteContentStatus(userId: string, statusId: string, moveToId: string) {
  const s = await db.contentStatus.findUnique({ where: { id: statusId } });
  if (!s) throw new NotFoundError("Etapa");
  await access(userId, s.workspaceId, true);
  if (s.isPublished || s.isScheduled || s.isRecordingScheduled) throw new AppError("Esta etapa é usada nos indicadores e não pode ser excluída (você pode renomeá-la).");
  const target = await db.contentStatus.findFirst({ where: { id: moveToId, workspaceId: s.workspaceId, NOT: { id: statusId } } });
  if (!target) throw new AppError("Escolha para qual etapa mover os conteúdos.");
  await db.$transaction([
    db.contentItem.updateMany({ where: { statusId }, data: { statusId: target.id } }),
    db.contentStatus.delete({ where: { id: statusId } }),
  ]);
}

// ═══════════════════════════════════════════════════════════════
// Conteúdos
// ═══════════════════════════════════════════════════════════════

const formatValues = CONTENT_FORMATS.map((f) => f.value) as [string, ...string[]];

export const contentSchema = z.object({
  workspaceId: z.string().min(1, "Escolha o ambiente."),
  title: z.string().trim().min(1, "Informe o título.").max(300),
  profileId: z.string().nullable().optional(),
  statusId: z.string().optional(),
  platform: z.string().trim().max(30).default("instagram"),
  format: z.enum(formatValues).nullable().optional(),
  objective: z.string().trim().max(300).nullable().optional(),
  audience: z.string().trim().max(300).nullable().optional(),
  hook: z.string().max(1000).nullable().optional(),
  script: z.string().max(30000).nullable().optional(),
  cta: z.string().max(500).nullable().optional(),
  owner: z.string().trim().max(100).nullable().optional(),
  participants: z.string().trim().max(300).nullable().optional(),
  recordingDate: ymd.nullable().optional(),
  recordingTime: hhmm.nullable().optional(),
  publishDate: ymd.nullable().optional(),
  publishTime: hhmm.nullable().optional(),
  publishedUrl: z.string().trim().url("Link inválido.").max(2000).or(z.literal("")).nullable().optional(),
  references: z.string().max(5000).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
});
export type ContentInput = z.input<typeof contentSchema>;

/** Data + hora opcional no fuso da usuária. Sem hora, guarda 12:00 locais (não muda de dia em nenhum fuso do Brasil). */
function at(date: string | null | undefined, time: string | null | undefined, tz: string) {
  return date ? zonedToUtc(date, time || "12:00", tz) : null;
}

function contentData(d: z.output<typeof contentSchema>, tz: string) {
  return {
    title: d.title,
    profileId: d.profileId || null,
    platform: d.platform || "instagram",
    format: d.format || null,
    objective: d.objective || null,
    audience: d.audience || null,
    hook: d.hook || null,
    script: d.script || null,
    cta: d.cta || null,
    owner: d.owner || null,
    participants: d.participants || null,
    recordingDate: at(d.recordingDate, d.recordingTime, tz),
    publishDate: at(d.publishDate, d.publishTime, tz),
    publishedUrl: d.publishedUrl || null,
    references: d.references || null,
    notes: d.notes || null,
  };
}

export const contentInclude = {
  status: { select: { id: true, name: true, isPublished: true, isScheduled: true, isRecordingScheduled: true } },
  profile: { select: { id: true, name: true, username: true } },
  workspace: { select: { id: true, name: true, color: true } },
  metrics: { orderBy: { date: "desc" as const }, take: 1 },
} satisfies Prisma.ContentItemInclude;
export type ContentCard = Prisma.ContentItemGetPayload<{ include: typeof contentInclude }>;

async function assertProfile(workspaceId: string, profileId?: string | null) {
  if (profileId && !(await db.socialProfile.findFirst({ where: { id: profileId, workspaceId } }))) throw new AppError("Perfil inválido para este ambiente.");
}

async function endPosition(statusId: string) {
  const last = await db.contentItem.findFirst({ where: { statusId, deletedAt: null }, orderBy: { position: "desc" }, select: { position: true } });
  return (last?.position ?? 0) + POSITION_GAP;
}

export type ContentFilters = { workspace?: string | "all"; profileId?: string; format?: string; search?: string; from?: string; to?: string };

export async function listContent(userId: string, filters: ContentFilters = {}, tz = "America/Sao_Paulo") {
  const ids = await accessibleWorkspaceIds(userId, "content", filters.workspace ?? "all");
  const where: Prisma.ContentItemWhereInput = { workspaceId: { in: ids }, deletedAt: null };
  if (filters.profileId) where.profileId = filters.profileId;
  if (filters.format) where.format = filters.format;
  if (filters.search?.trim()) {
    const q = { contains: filters.search.trim(), mode: "insensitive" as const };
    where.OR = [{ title: q }, { hook: q }, { script: q }, { notes: q }];
  }
  if (filters.from && filters.to) {
    const range = { gte: zonedToUtc(filters.from, "00:00", tz), lt: zonedToUtc(addDaysYmd(filters.to, 1), "00:00", tz) };
    where.AND = [{ OR: [{ publishDate: range }, { recordingDate: range }, { publishedAt: range }] }];
  }
  return db.contentItem.findMany({ where, include: contentInclude, orderBy: [{ position: "asc" }, { createdAt: "asc" }], take: 3000 });
}

export async function getContent(userId: string, id: string) {
  const item = await db.contentItem.findFirst({ where: { id, deletedAt: null }, include: { ...contentInclude, metrics: { orderBy: { date: "desc" } } } });
  if (!item) throw new NotFoundError("Conteúdo");
  await access(userId, item.workspaceId);
  return item;
}

/**
 * Conteúdos escolhidos para exportar os roteiros (PDF), na ordem em que foram pedidos.
 * Ignora o que não existe mais ou de ambientes sem acesso ao módulo.
 */
export async function contentForExport(userId: string, ids: string[]) {
  const wanted = [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0 && id.length <= 64))].slice(0, 300);
  if (!wanted.length) return [];
  const workspaceIds = await accessibleWorkspaceIds(userId, "content");
  const items = await db.contentItem.findMany({
    where: { id: { in: wanted }, deletedAt: null, workspaceId: { in: workspaceIds } },
    include: { status: { select: { name: true } }, profile: { select: { username: true } }, workspace: { select: { name: true, color: true } } },
  });
  const byId = new Map(items.map((i) => [i.id, i]));
  return wanted.map((id) => byId.get(id)).filter((i): i is NonNullable<typeof i> => Boolean(i));
}

export async function createContent(userId: string, input: ContentInput, tz: string) {
  const data = contentSchema.parse(input);
  await access(userId, data.workspaceId, true);
  await assertProfile(data.workspaceId, data.profileId);
  const status = data.statusId
    ? await db.contentStatus.findFirst({ where: { id: data.statusId, workspaceId: data.workspaceId } })
    : await db.contentStatus.findFirst({ where: { workspaceId: data.workspaceId }, orderBy: { position: "asc" } });
  if (!status) throw new AppError("Etapa inválida para este ambiente.");
  const fields = contentData(data, tz);
  const item = await db.contentItem.create({
    data: {
      workspaceId: data.workspaceId,
      statusId: status.id,
      ...fields,
      position: await endPosition(status.id),
      publishedAt: status.isPublished ? fields.publishDate ?? new Date() : null,
    },
    include: contentInclude,
  });
  await audit({ userId, workspaceId: data.workspaceId, entity: "ContentItem", entityId: item.id, action: "create" });
  return item;
}

async function loadForWrite(userId: string, id: string) {
  const item = await db.contentItem.findFirst({ where: { id, deletedAt: null }, include: { status: true } });
  if (!item) throw new NotFoundError("Conteúdo");
  await access(userId, item.workspaceId, true);
  return item;
}

/**
 * Data de publicação ao entrar em "Publicado": a data programada, se já passou;
 * senão, agora. Sair de "Publicado" limpa a data. Só acontece por ação explícita.
 */
function publishedStamp(to: { isPublished: boolean }, from: { isPublished: boolean }, publishDate: Date | null, current: Date | null) {
  if (to.isPublished && !from.isPublished) return publishDate && publishDate <= new Date() ? publishDate : new Date();
  if (!to.isPublished) return null;
  return current;
}

export async function updateContent(userId: string, id: string, input: Omit<ContentInput, "workspaceId">, tz: string) {
  const before = await loadForWrite(userId, id);
  const data = contentSchema.parse({ ...input, workspaceId: before.workspaceId });
  await assertProfile(before.workspaceId, data.profileId);
  const fields = contentData(data, tz);
  let statusPatch = {};
  if (data.statusId && data.statusId !== before.statusId) {
    const to = await db.contentStatus.findFirst({ where: { id: data.statusId, workspaceId: before.workspaceId } });
    if (!to) throw new AppError("Etapa inválida.");
    statusPatch = { statusId: to.id, position: await endPosition(to.id), publishedAt: publishedStamp(to, before.status, fields.publishDate, before.publishedAt) };
  }
  return db.contentItem.update({ where: { id }, data: { ...fields, ...statusPatch }, include: contentInclude });
}

/** Arrastar no Kanban de produção. */
export async function moveContent(userId: string, id: string, statusId: string, index: number) {
  const item = await loadForWrite(userId, id);
  const to = await db.contentStatus.findFirst({ where: { id: statusId, workspaceId: item.workspaceId } });
  if (!to) throw new AppError("Etapa inválida.");
  return db.$transaction(async (tx) => {
    const siblings = await tx.contentItem.findMany({
      where: { statusId, deletedAt: null, NOT: { id } },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true, position: true },
    });
    let position = positionAt(siblings.map((s) => s.position), index);
    if (position === null) {
      const i = Math.max(0, Math.min(index, siblings.length));
      const ordered = [...siblings.slice(0, i).map((s) => s.id), id, ...siblings.slice(i).map((s) => s.id)];
      for (const [k, sid] of ordered.entries()) await tx.contentItem.update({ where: { id: sid }, data: { position: (k + 1) * POSITION_GAP } });
      position = (i + 1) * POSITION_GAP;
    }
    return tx.contentItem.update({
      where: { id },
      data: { statusId, position, publishedAt: publishedStamp(to, item.status, item.publishDate, item.publishedAt) },
      include: contentInclude,
    });
  });
}

/** Reagendar no calendário editorial (arrastar a data de gravação ou publicação). */
export async function rescheduleContent(userId: string, id: string, field: "recordingDate" | "publishDate", date: string, tz: string) {
  const item = await loadForWrite(userId, id);
  const day = ymd.parse(date);
  const current = item[field];
  // Mantém o horário que já existia
  const time = current ? new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(current) : "12:00";
  return db.contentItem.update({ where: { id }, data: { [field]: zonedToUtc(day, time, tz) }, include: contentInclude });
}

export async function duplicateContent(userId: string, id: string) {
  const item = await loadForWrite(userId, id);
  const first = await db.contentStatus.findFirst({ where: { workspaceId: item.workspaceId }, orderBy: { position: "asc" } });
  const statusId = item.status.isPublished && first ? first.id : item.statusId;
  const { id: _id, createdAt: _c, updatedAt: _u, status: _s, links, ...rest } = item;
  return db.contentItem.create({
    data: {
      ...rest,
      links: links ?? undefined,
      title: `${item.title} (cópia)`,
      statusId,
      position: await endPosition(statusId),
      publishedAt: null,
      publishedUrl: null,
      externalMediaId: null,
      recordingDate: null,
      publishDate: null,
    },
    include: contentInclude,
  });
}

export async function deleteContent(userId: string, id: string) {
  const item = await loadForWrite(userId, id);
  await db.contentItem.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({ userId, workspaceId: item.workspaceId, entity: "ContentItem", entityId: id, action: "delete" });
}

// ─── Métricas por conteúdo (manual; a integração Meta entra na Fase 6) ───

export const metricSchema = z.object({
  date: ymd,
  reach: optInt,
  views: optInt,
  likes: optInt,
  comments: optInt,
  shares: optInt,
  saves: optInt,
  followsGained: optInt,
});

export async function saveContentMetric(userId: string, contentId: string, input: z.input<typeof metricSchema>) {
  await loadForWrite(userId, contentId);
  const { date, ...values } = metricSchema.parse(input);
  if (Object.values(values).every((v) => v == null)) throw new AppError("Preencha pelo menos um número.");
  const clean = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v ?? null]));
  return db.contentMetric.upsert({
    where: { contentItemId_date_source: { contentItemId: contentId, date: ymdToDate(date), source: "MANUAL" } },
    create: { contentItemId: contentId, date: ymdToDate(date), source: "MANUAL", ...clean },
    update: { ...clean, fetchedAt: new Date() },
  });
}

export async function deleteContentMetric(userId: string, metricId: string) {
  const m = await db.contentMetric.findUnique({ where: { id: metricId } });
  if (!m) throw new NotFoundError("Métrica");
  await loadForWrite(userId, m.contentItemId);
  await db.contentMetric.delete({ where: { id: metricId } });
}

// ═══════════════════════════════════════════════════════════════
// Relatório e indicadores
// ═══════════════════════════════════════════════════════════════

/** Publicados no período (pela data em que foram publicados), com a última leitura de métricas. */
export async function contentReport(userId: string, filters: { workspace?: string | "all"; profileId?: string; from: string; to: string }, tz: string) {
  const ids = await accessibleWorkspaceIds(userId, "content", filters.workspace ?? "all");
  const range = { gte: zonedToUtc(filters.from, "00:00", tz), lt: zonedToUtc(addDaysYmd(filters.to, 1), "00:00", tz) };
  const base: Prisma.ContentItemWhereInput = { workspaceId: { in: ids }, deletedAt: null, ...(filters.profileId ? { profileId: filters.profileId } : {}) };
  const [published, planned, recordings] = await Promise.all([
    db.contentItem.findMany({
      where: { ...base, status: { isPublished: true }, publishedAt: range },
      include: { metrics: true, profile: { select: { id: true, name: true, username: true } } },
      orderBy: { publishedAt: "asc" },
    }),
    db.contentItem.count({ where: { ...base, publishDate: range } }),
    db.contentItem.count({ where: { ...base, recordingDate: range } }),
  ]);
  const rows = published.map((p) => {
    const metric = latestMetric(p.metrics);
    return {
      id: p.id,
      title: p.title,
      format: p.format,
      platform: p.platform,
      profile: p.profile,
      publishedAt: p.publishedAt!,
      publishedUrl: p.publishedUrl,
      metric: metric ? { ...metric, interactions: interactions(metric), engagement: engagementRate(metric) } : null,
    };
  });
  const withMetric = rows.filter((r) => r.metric);
  const sum = (k: "reach" | "views" | "followsGained") => withMetric.reduce((a, r) => a + (r.metric![k] ?? 0), 0);
  const engagements = withMetric.map((r) => r.metric!.engagement).filter((v): v is number => v !== null);
  return {
    publishedCount: rows.length,
    plannedCount: planned,
    recordingsCount: recordings,
    withMetricsCount: withMetric.length,
    totalReach: sum("reach"),
    totalViews: sum("views"),
    totalInteractions: withMetric.reduce((a, r) => a + r.metric!.interactions, 0),
    followsGained: sum("followsGained"),
    avgEngagement: engagements.length ? Math.round((engagements.reduce((a, b) => a + b, 0) / engagements.length) * 100) / 100 : null,
    byFormat: compareFormats(rows.map((r) => ({ format: r.format, metric: r.metric }))),
    top: [...withMetric].sort((a, b) => (b.metric!.engagement ?? -1) - (a.metric!.engagement ?? -1)).slice(0, 5),
    rows,
  };
}

/** Próximas gravações e publicações (dashboard e resumos). */
export async function upcomingContent(userId: string, workspaceIds: string[] | "all", from: Date, to: Date) {
  const ids = await accessibleWorkspaceIds(userId, "content");
  const allowed = workspaceIds === "all" ? ids : ids.filter((id) => workspaceIds.includes(id));
  const items = await db.contentItem.findMany({
    where: {
      workspaceId: { in: allowed },
      deletedAt: null,
      status: { isPublished: false },
      OR: [{ recordingDate: { gte: from, lte: to } }, { publishDate: { gte: from, lte: to } }],
    },
    include: { workspace: { select: { name: true, color: true } }, status: { select: { name: true } } },
    take: 50,
  });
  const out: { id: string; title: string; kind: "RECORDING" | "PUBLISH"; at: Date; format: string | null; status: string; workspace: { name: string; color: string } }[] = [];
  for (const i of items) {
    if (i.recordingDate && i.recordingDate >= from && i.recordingDate <= to) out.push({ id: i.id, title: i.title, kind: "RECORDING", at: i.recordingDate, format: i.format, status: i.status.name, workspace: i.workspace });
    if (i.publishDate && i.publishDate >= from && i.publishDate <= to) out.push({ id: i.id, title: i.title, kind: "PUBLISH", at: i.publishDate, format: i.format, status: i.status.name, workspace: i.workspace });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, 20);
}

// ═══════════════════════════════════════════════════════════════
// Banco de referências
// ═══════════════════════════════════════════════════════════════

export const referenceSchema = z.object({
  workspaceId: z.string().min(1),
  url: z.string().trim().url("Link inválido.").max(2000),
  profileId: z.string().nullable().optional(),
  platform: z.string().trim().max(30).nullable().optional(),
  creator: z.string().trim().max(100).nullable().optional(),
  theme: z.string().trim().max(200).nullable().optional(),
  format: z.enum(formatValues).nullable().optional(),
  hook: z.string().max(1000).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  adaptationIdeas: z.string().max(5000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});
export type ReferenceInput = z.input<typeof referenceSchema>;

function referenceData(d: z.output<typeof referenceSchema>) {
  return {
    url: d.url,
    profileId: d.profileId || null,
    platform: d.platform || null,
    creator: d.creator ? d.creator.replace(/^@/, "") : null,
    theme: d.theme || null,
    format: d.format || null,
    hook: d.hook || null,
    notes: d.notes || null,
    adaptationIdeas: d.adaptationIdeas || null,
    tags: [...new Set((d.tags ?? []).map((t) => t.toLowerCase()))],
  };
}

export async function listReferences(userId: string, filters: { workspace?: string | "all"; search?: string; tag?: string; format?: string } = {}) {
  const ids = await accessibleWorkspaceIds(userId, "content", filters.workspace ?? "all");
  const where: Prisma.ContentReferenceWhereInput = { workspaceId: { in: ids } };
  if (filters.tag) where.tags = { has: filters.tag.toLowerCase() };
  if (filters.format) where.format = filters.format;
  if (filters.search?.trim()) {
    const q = { contains: filters.search.trim(), mode: "insensitive" as const };
    where.OR = [{ theme: q }, { creator: q }, { hook: q }, { notes: q }, { adaptationIdeas: q }];
  }
  return db.contentReference.findMany({ where, include: { workspace: { select: { name: true, color: true } }, profile: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 1000 });
}

export async function createReference(userId: string, input: ReferenceInput) {
  const data = referenceSchema.parse(input);
  await access(userId, data.workspaceId, true);
  await assertProfile(data.workspaceId, data.profileId);
  return db.contentReference.create({ data: { workspaceId: data.workspaceId, ...referenceData(data) } });
}

export async function updateReference(userId: string, id: string, input: Omit<ReferenceInput, "workspaceId">) {
  const r = await db.contentReference.findUnique({ where: { id } });
  if (!r) throw new NotFoundError("Referência");
  await access(userId, r.workspaceId, true);
  const data = referenceSchema.parse({ ...input, workspaceId: r.workspaceId });
  await assertProfile(r.workspaceId, data.profileId);
  return db.contentReference.update({ where: { id }, data: referenceData(data) });
}

export async function deleteReference(userId: string, id: string) {
  const r = await db.contentReference.findUnique({ where: { id } });
  if (!r) throw new NotFoundError("Referência");
  await access(userId, r.workspaceId, true);
  await db.contentReference.delete({ where: { id } });
}

/** Cria um conteúdo (na etapa inicial) a partir de uma referência. */
export async function contentFromReference(userId: string, id: string, tz: string) {
  const r = await db.contentReference.findUnique({ where: { id } });
  if (!r) throw new NotFoundError("Referência");
  return createContent(
    userId,
    {
      workspaceId: r.workspaceId,
      title: r.theme || `Ideia a partir de ${r.creator ? `@${r.creator}` : "referência"}`,
      profileId: r.profileId,
      format: r.format,
      hook: r.hook,
      references: r.url,
      notes: r.adaptationIdeas,
    },
    tz,
  );
}

// ═══════════════════════════════════════════════════════════════
// Perfis e métricas do perfil
// ═══════════════════════════════════════════════════════════════

export const profileSchema = z.object({
  workspaceId: z.string().min(1, "Escolha o ambiente."),
  name: z.string().trim().min(1, "Informe o nome.").max(100),
  username: z.string().trim().min(1, "Informe o @.").max(60),
  platform: z.string().trim().max(30).default("instagram"),
  audience: z.string().max(2000).nullable().optional(),
  positioning: z.string().max(2000).nullable().optional(),
  objectives: z.string().max(2000).nullable().optional(),
  editorialLine: z.string().max(5000).nullable().optional(),
  postingGoalPerWeek: z.number().int().min(0).max(100).nullable().optional(),
});
export type ProfileInput = z.input<typeof profileSchema>;

function profileData(d: z.output<typeof profileSchema>) {
  return {
    name: d.name,
    username: d.username.replace(/^@/, ""),
    platform: d.platform || "instagram",
    audience: d.audience || null,
    positioning: d.positioning || null,
    objectives: d.objectives || null,
    editorialLine: d.editorialLine || null,
    postingGoalPerWeek: d.postingGoalPerWeek ?? null,
  };
}

export async function listProfiles(userId: string, filters: { workspace?: string | "all"; includeArchived?: boolean } = {}) {
  const ids = await accessibleWorkspaceIds(userId, "content", filters.workspace ?? "all");
  return db.socialProfile.findMany({
    where: { workspaceId: { in: ids }, ...(filters.includeArchived ? {} : { archived: false }) },
    include: { workspace: { select: { id: true, name: true, color: true } }, snapshots: { orderBy: { date: "desc" }, take: 1 } },
    orderBy: [{ archived: "asc" }, { createdAt: "asc" }],
  });
}

export async function createProfile(userId: string, input: ProfileInput) {
  const data = profileSchema.parse(input);
  await access(userId, data.workspaceId, true);
  return db.socialProfile.create({ data: { workspaceId: data.workspaceId, ...profileData(data) } });
}

async function loadProfile(userId: string, id: string, write = true) {
  const p = await db.socialProfile.findUnique({ where: { id } });
  if (!p) throw new NotFoundError("Perfil");
  await access(userId, p.workspaceId, write);
  return p;
}

export async function updateProfile(userId: string, id: string, input: Omit<ProfileInput, "workspaceId">) {
  const p = await loadProfile(userId, id);
  const data = profileSchema.parse({ ...input, workspaceId: p.workspaceId });
  return db.socialProfile.update({ where: { id }, data: profileData(data) });
}

export async function setProfileArchived(userId: string, id: string, archived: boolean) {
  await loadProfile(userId, id);
  return db.socialProfile.update({ where: { id }, data: { archived } });
}

export const snapshotSchema = z.object({
  date: ymd,
  followers: optInt,
  reach: optInt,
  views: optInt,
  likes: optInt,
  comments: optInt,
  shares: optInt,
  saves: optInt,
  posts: optInt,
});

export async function saveProfileSnapshot(userId: string, profileId: string, input: z.input<typeof snapshotSchema>) {
  await loadProfile(userId, profileId);
  const { date, ...values } = snapshotSchema.parse(input);
  if (Object.values(values).every((v) => v == null)) throw new AppError("Preencha pelo menos um número.");
  const clean = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v ?? null]));
  return db.profileMetricSnapshot.upsert({
    where: { profileId_date_source: { profileId, date: ymdToDate(date), source: "MANUAL" } },
    create: { profileId, date: ymdToDate(date), source: "MANUAL", ...clean },
    update: { ...clean, fetchedAt: new Date() },
  });
}

export async function deleteProfileSnapshot(userId: string, snapshotId: string) {
  const s = await db.profileMetricSnapshot.findUnique({ where: { id: snapshotId } });
  if (!s) throw new NotFoundError("Registro");
  await loadProfile(userId, s.profileId);
  await db.profileMetricSnapshot.delete({ where: { id: snapshotId } });
}

/**
 * Painel de um perfil: série de seguidores e alcance, crescimento no período
 * e frequência de postagem real × meta semanal.
 */
export async function profileOverview(userId: string, profileId: string, range: { from: string; to: string }, tz: string) {
  const p = await loadProfile(userId, profileId, false);
  const [snapshots, publishedCount] = await Promise.all([
    db.profileMetricSnapshot.findMany({ where: { profileId }, orderBy: { date: "asc" } }),
    db.contentItem.count({
      where: { profileId, deletedAt: null, status: { isPublished: true }, publishedAt: { gte: zonedToUtc(range.from, "00:00", tz), lt: zonedToUtc(addDaysYmd(range.to, 1), "00:00", tz) } },
    }),
  ]);
  const inRange = snapshots.filter((s) => {
    const d = dateToYmd(s.date);
    return d >= range.from && d <= range.to;
  });
  const withFollowers = snapshots.filter((s) => s.followers != null);
  const beforeOrAt = (ymdLimit: string) => [...withFollowers].reverse().find((s) => dateToYmd(s.date) <= ymdLimit) ?? null;
  const start = beforeOrAt(addDaysYmd(range.from, -1)) ?? withFollowers.find((s) => dateToYmd(s.date) >= range.from) ?? null;
  const end = beforeOrAt(range.to);
  const days = Math.round((ymdToDate(range.to).getTime() - ymdToDate(range.from).getTime()) / 86_400_000) + 1;
  return {
    profile: p,
    snapshots,
    inRange,
    followersStart: start?.followers ?? null,
    followersEnd: end?.followers ?? null,
    followersGrowth: start && end && start.id !== end.id ? end.followers! - start.followers! : null,
    publishedCount,
    postsPerWeek: Math.round((publishedCount / (days / 7)) * 10) / 10,
  };
}
