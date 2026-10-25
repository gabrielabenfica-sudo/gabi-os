import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/current";
import { requireWorkspaceAccess } from "@/server/workspaces";
import { getMentee } from "@/server/mentees";
import { notesLinkedTo } from "@/server/notes";
import { listPrograms } from "@/server/finance/sales";
import { NotFoundError } from "@/server/errors";
import { todayYmd } from "@/lib/dates";
import { MenteeDetailClient } from "./mentee-detail";

export const metadata = { title: "Mentorado" };

export default async function MenteePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const mentee = await getMentee(user.id, id).catch((e) => {
    if (e instanceof NotFoundError || (e instanceof Error && e.name === "ForbiddenError")) return null;
    throw e;
  });
  if (!mentee) notFound();
  const can = (module: "finance" | "notes" | "calendar" | "tasks") => requireWorkspaceAccess(user.id, mentee.workspaceId, { module }).then(() => true, () => false);
  const [canFinance, canNotes, canCalendar, canTasks] = await Promise.all([can("finance"), can("notes"), can("calendar"), can("tasks")]);
  const [notes, programs] = await Promise.all([
    canNotes ? notesLinkedTo(user.id, "mentee", mentee.id) : Promise.resolve([]),
    canFinance ? listPrograms(user.id, mentee.workspaceId) : Promise.resolve([]),
  ]);
  return (
    <MenteeDetailClient
      mentee={mentee}
      notes={notes}
      programs={programs.map((p) => ({ id: p.id, name: p.name, durationWeeks: p.durationWeeks, priceCents: p.priceCents, active: p.active }))}
      perms={{ finance: canFinance, notes: canNotes, calendar: canCalendar, tasks: canTasks }}
      today={todayYmd(user.timezone)}
      tz={user.timezone}
    />
  );
}
