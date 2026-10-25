import { requireUser } from "@/server/auth/current";
import { getReview, listReviews, type ReviewKind } from "@/server/reviews";
import { todayYmd } from "@/lib/dates";
import { ReviewsClient } from "./reviews-client";

export const metadata = { title: "Revisões" };

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = todayYmd(user.timezone);
  const kind: ReviewKind = sp.tipo === "mensal" ? "MONTHLY" : "WEEKLY";
  const day = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) && sp.d <= today ? sp.d : today;
  const [review, history] = await Promise.all([getReview(user.id, kind, day, user.timezone), listReviews(user.id)]);
  return <ReviewsClient review={review} history={history} today={today} />;
}
