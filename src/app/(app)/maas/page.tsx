import { requireUser } from "@/server/auth/current";
import { maasOverview } from "@/server/maas";
import { todayYmd } from "@/lib/dates";
import { MaasClient } from "./maas-client";

export const metadata = { title: "MAAS" };

export default async function MaasPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const overview = await maasOverview(user.id);
  return <MaasClient overview={overview} today={todayYmd(user.timezone)} openNew={sp.nova === "1"} />;
}
