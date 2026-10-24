import { requireUser } from "@/server/auth/current";
import { accessibleWorkspaceIds, listWorkspaces } from "@/server/workspaces";
import { getWorkspaceFilter } from "@/server/workspace-filter";
import { listFolders } from "@/server/notes";
import { NotesClient } from "./notes-client";

export const metadata = { title: "Anotações" };

export default async function NotesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const all = await listWorkspaces(user.id);
  const ids = new Set(await accessibleWorkspaceIds(user.id, "notes"));
  const workspaces = all.filter((w) => ids.has(w.id));
  const filter = await getWorkspaceFilter(all);
  const folders = await listFolders(user.id);

  return (
    <NotesClient
      workspaces={workspaces.map((w) => ({ id: w.id, name: w.name, color: w.color }))}
      folders={folders.map((f) => ({ id: f.id, workspaceId: f.workspaceId, parentId: f.parentId, name: f.name }))}
      initialWorkspace={filter}
      initialNoteId={sp.n ?? null}
      openNew={sp.nova === "1"}
      tz={user.timezone}
    />
  );
}
