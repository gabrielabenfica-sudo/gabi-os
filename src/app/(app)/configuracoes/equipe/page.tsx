import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { listWorkspaces } from "@/server/workspaces";
import { listTeam } from "@/server/team";
import { EmptyState } from "@/components/ui/empty-state";
import { TeamClient } from "./team-client";

export const metadata = { title: "Equipe" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const manageable = (await listWorkspaces(user.id)).filter((w) => w.role === "OWNER" || w.role === "ADMIN");
  if (!manageable.length) return <EmptyState title="Nenhum ambiente para gerenciar" description="Só a dona ou administradores de um ambiente gerenciam a equipe." />;
  const ws = manageable.find((w) => w.id === sp.ws) ?? manageable[0]!;
  const team = await listTeam(user.id, ws.id);
  return (
    <div className="grid gap-5">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Configurações</Link>
      <TeamClient
        workspaces={manageable.map((w) => ({ id: w.id, name: w.name }))}
        workspaceId={ws.id}
        currentUserId={user.id}
        members={team.members.map((m) => ({ id: m.id, role: m.role, modules: m.modules, user: m.user }))}
        invitations={team.invitations.map((i) => ({ id: i.id, email: i.email, role: i.role, modules: i.modules, expiresAt: i.expiresAt.toISOString() }))}
      />
    </div>
  );
}
