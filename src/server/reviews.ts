import { z } from "zod";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { buildMonthlyReview, buildWeeklyReview } from "@/server/notifications";
import { addDaysYmd, dateToYmd, endOfMonthYmd, startOfMonthYmd, startOfWeekYmd, todayYmd, ymdToDate } from "@/lib/dates";

/**
 * Revisões: os números vêm dos módulos (mesmo conteúdo da revisão automática)
 * e a usuária registra a reflexão — conquistas, ajustes, aprendizados e prioridades.
 */

export type ReviewKind = "WEEKLY" | "MONTHLY";

export function periodFor(kind: ReviewKind, anyDay: string) {
  if (kind === "WEEKLY") {
    const start = startOfWeekYmd(anyDay);
    return { start, end: addDaysYmd(start, 6) };
  }
  const start = startOfMonthYmd(anyDay);
  return { start, end: endOfMonthYmd(start) };
}

export async function getReview(userId: string, kind: ReviewKind, anyDay: string, tz: string) {
  const { start, end } = periodFor(kind, anyDay);
  const [saved, digest] = await Promise.all([
    db.review.findUnique({ where: { userId_kind_periodStart: { userId, kind, periodStart: ymdToDate(start) } } }),
    kind === "WEEKLY" ? buildWeeklyReview(userId, start, tz) : buildMonthlyReview(userId, start, tz),
  ]);
  return { kind, start, end, isCurrent: start <= todayYmd(tz) && todayYmd(tz) <= end, saved, digest };
}

export const reviewSchema = z.object({
  kind: z.enum(["WEEKLY", "MONTHLY"]),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  wins: z.string().max(10000).nullable().optional(),
  improvements: z.string().max(10000).nullable().optional(),
  lessons: z.string().max(10000).nullable().optional(),
  priorities: z.string().max(10000).nullable().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
});

export async function saveReview(userId: string, input: z.input<typeof reviewSchema>, tz: string) {
  const data = reviewSchema.parse(input);
  const { start, end } = periodFor(data.kind, data.day);
  if (start > todayYmd(tz)) throw new AppError("Não dá para revisar um período que ainda não começou.");
  const fields = {
    wins: data.wins || null,
    improvements: data.improvements || null,
    lessons: data.lessons || null,
    priorities: data.priorities || null,
    rating: data.rating ?? null,
  };
  if (Object.values(fields).every((v) => v === null)) throw new AppError("Escreva pelo menos um campo da revisão.");
  return db.review.upsert({
    where: { userId_kind_periodStart: { userId, kind: data.kind, periodStart: ymdToDate(start) } },
    create: { userId, kind: data.kind, periodStart: ymdToDate(start), periodEnd: ymdToDate(end), ...fields },
    update: fields,
  });
}

export async function listReviews(userId: string, kind?: ReviewKind) {
  const rows = await db.review.findMany({ where: { userId, ...(kind ? { kind } : {}) }, orderBy: { periodStart: "desc" }, take: 100 });
  return rows.map((r) => ({ ...r, start: dateToYmd(r.periodStart), end: dateToYmd(r.periodEnd) }));
}

export async function deleteReview(userId: string, id: string) {
  const r = await db.review.findFirst({ where: { id, userId } });
  if (!r) throw new AppError("Revisão não encontrada.");
  await db.review.delete({ where: { id } });
}
