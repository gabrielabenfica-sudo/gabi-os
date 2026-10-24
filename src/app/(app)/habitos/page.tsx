import { requireUser } from "@/server/auth/current";
import { accessibleWorkspaceIds, listWorkspaces } from "@/server/workspaces";
import { getWorkspaceFilter } from "@/server/workspace-filter";
import { listHabits } from "@/server/habits";
import { addDaysYmd, todayYmd } from "@/lib/dates";
import { HabitsClient } from "./habits-client";

export const metadata = { title: "Hábitos" };

const PERIODS = [7, 30, 90] as const;

export default async function HabitsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const period = PERIODS.find((p) => String(p) === sp.periodo) ?? 30;
  const showArchived = sp.arquivados === "1";
  const today = todayYmd(user.timezone);
  const from = addDaysYmd(today, -(period - 1));

  const all = await listWorkspaces(user.id);
  const ids = new Set(await accessibleWorkspaceIds(user.id, "habits"));
  const workspaces = all.filter((w) => ids.has(w.id));
  const filter = await getWorkspaceFilter(all);
  const habits = await listHabits(user.id, { workspaceId: filter, from, to: today, includeInactive: showArchived }, user.timezone);

  return (
    <HabitsClient
      habits={showArchived ? habits.filter((h) => !h.active) : habits}
      workspaces={workspaces.map((w) => ({ id: w.id, name: w.name, color: w.color, kind: w.kind }))}
      period={period}
      from={from}
      today={today}
      showArchived={showArchived}
      openNew={sp.novo === "1"}
    />
  );
}
