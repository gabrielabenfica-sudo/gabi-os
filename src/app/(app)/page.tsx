import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { listWorkspaces } from "@/server/workspaces";
import { getWorkspaceFilter } from "@/server/workspace-filter";
import { getDashboard, parseDashboardPrefs, resolvePeriod, type DashboardPeriod } from "@/server/dashboard";
import { formatLongDateBR, greetingFor } from "@/lib/dates";
import { firstName } from "@/lib/utils";
import { DashboardClient } from "./dashboard-client";

export const metadata = { title: "Dashboard" };

const PERIODS: DashboardPeriod[] = ["today", "week", "month", "custom"];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const period: DashboardPeriod = PERIODS.includes(sp.periodo as DashboardPeriod) ? (sp.periodo as DashboardPeriod) : "today";
  const workspaces = await listWorkspaces(user.id);
  const filter = await getWorkspaceFilter(workspaces);
  const range = resolvePeriod(period, user.timezone, { from: sp.de, to: sp.ate });
  const [data, prefsRow] = await Promise.all([
    getDashboard(user.id, user.timezone, filter, range),
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { dashboardPrefs: true } }),
  ]);
  const now = new Date();

  return (
    <DashboardClient
      greeting={`${greetingFor(now, user.timezone)}, ${firstName(user.name)}.`}
      dateLabel={formatLongDateBR(now, user.timezone)}
      period={period}
      data={data}
      prefs={parseDashboardPrefs(prefsRow.dashboardPrefs)}
      tz={user.timezone}
      workspaceLabel={filter === "all" ? "Todos os ambientes" : workspaces.find((w) => w.id === filter)?.name ?? ""}
    />
  );
}
