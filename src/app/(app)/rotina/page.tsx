import { requireUser } from "@/server/auth/current";
import { listWorkspaces } from "@/server/workspaces";
import { listRoutineDay, listRoutineTemplate, routineDayContext } from "@/server/routine";
import { todayYmd } from "@/lib/dates";
import { RoutineClient } from "./routine-client";

export const metadata = { title: "Rotina do dia" };

const isYmd = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export default async function RoutinePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = todayYmd(user.timezone);
  const date = isYmd(sp.dia) ? sp.dia! : today;

  const [workspaces, items, template, context] = await Promise.all([
    listWorkspaces(user.id),
    listRoutineDay(user.id, date),
    listRoutineTemplate(user.id),
    routineDayContext(user.id, date, user.timezone),
  ]);

  return (
    <RoutineClient
      date={date}
      today={today}
      items={items}
      template={template}
      context={context}
      workspaces={workspaces.map((w) => ({ id: w.id, name: w.name, color: w.color }))}
    />
  );
}
