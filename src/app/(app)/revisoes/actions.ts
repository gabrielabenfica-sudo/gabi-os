"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/current";
import { run } from "@/server/errors";
import * as reviews from "@/server/reviews";

export async function saveReviewAction(input: Parameters<typeof reviews.saveReview>[1]) {
  const u = await requireUser();
  const r = await run(() => reviews.saveReview(u.id, input, u.timezone).then(() => null), "Revisão salva.");
  if (r.ok) revalidatePath("/revisoes");
  return r;
}

export async function deleteReviewAction(id: string) {
  const u = await requireUser();
  const r = await run(() => reviews.deleteReview(u.id, id), "Revisão excluída.");
  if (r.ok) revalidatePath("/revisoes");
  return r;
}
