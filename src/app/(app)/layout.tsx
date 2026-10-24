import { requireUser } from "@/server/auth/current";
import { listWorkspaces } from "@/server/workspaces";
import { getWorkspaceFilter } from "@/server/workspace-filter";
import { AppShell } from "@/components/shell/app-shell";
import { maybeGenerateNotifications, unreadCount } from "@/server/notifications";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const workspaces = await listWorkspaces(user.id);
  const filter = await getWorkspaceFilter(workspaces);
  // Gera resumos e lembretes devidos (com limite de frequência) ao abrir o app
  await maybeGenerateNotifications(user.id, user.timezone);
  const unread = await unreadCount(user.id);

  return (
    <AppShell
      user={{ name: user.name, email: user.email, appName: user.appName, theme: user.theme }}
      workspaces={workspaces.map((w) => ({ id: w.id, name: w.name, color: w.color, kind: w.kind }))}
      filter={filter}
      unread={unread}
    >
      {children}
    </AppShell>
  );
}
