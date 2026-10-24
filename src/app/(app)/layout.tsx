import { requireUser } from "@/server/auth/current";
import { listWorkspaces } from "@/server/workspaces";
import { getWorkspaceFilter } from "@/server/workspace-filter";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const workspaces = await listWorkspaces(user.id);
  const filter = await getWorkspaceFilter(workspaces);

  return (
    <AppShell
      user={{ name: user.name, email: user.email, appName: user.appName, theme: user.theme }}
      workspaces={workspaces.map((w) => ({ id: w.id, name: w.name, color: w.color, kind: w.kind }))}
      filter={filter}
    >
      {children}
    </AppShell>
  );
}
