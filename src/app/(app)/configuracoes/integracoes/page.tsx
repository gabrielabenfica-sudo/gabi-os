import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { accessibleWorkspaceIds, listWorkspaces } from "@/server/workspaces";
import { googleConfig, listGoogleConnections } from "@/server/integrations/google-calendar";
import { getMetaConnection, listInstagramAccounts, metaConfig } from "@/server/integrations/meta";
import { errorMessage } from "@/server/errors";
import { IntegrationsClient } from "./integrations-client";

export const metadata = { title: "Integrações" };

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [workspaces, calIds, contentIds, google, metaConn, logs] = await Promise.all([
    listWorkspaces(user.id),
    accessibleWorkspaceIds(user.id, "calendar"),
    accessibleWorkspaceIds(user.id, "content"),
    listGoogleConnections(user.id),
    getMetaConnection(user.id),
    db.integrationSyncLog.findMany({ where: { userId: user.id }, orderBy: { startedAt: "desc" }, take: 15 }),
  ]);
  let igAccounts: Awaited<ReturnType<typeof listInstagramAccounts>> = [];
  let igError: string | null = null;
  if (metaConn) {
    try {
      igAccounts = await listInstagramAccounts(user.id);
    } catch (e) {
      igError = errorMessage(e);
    }
  }
  const profiles = await db.socialProfile.findMany({ where: { workspaceId: { in: contentIds }, archived: false }, select: { id: true, name: true, username: true, externalUserId: true, connectionId: true }, orderBy: { createdAt: "asc" } });
  return (
    <div className="grid gap-5">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Configurações</Link>
      <IntegrationsClient
        googleConfigured={!!googleConfig()}
        metaConfigured={!!metaConfig()}
        google={google.map((c) => ({
          id: c.id,
          accountEmail: c.accountEmail,
          status: c.status,
          lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
          lastError: c.lastError,
          calendars: c.calendars.map((k) => ({ id: k.id, name: k.name, color: k.color, isPrimary: k.isPrimary, selected: k.selected, workspaceId: k.workspaceId, lastSyncAt: k.lastSyncAt?.toISOString() ?? null })),
        }))}
        meta={metaConn ? { status: metaConn.status, lastSyncAt: metaConn.lastSyncAt?.toISOString() ?? null, lastError: metaConn.lastError, expiresAt: metaConn.expiresAt?.toISOString() ?? null } : null}
        igAccounts={igAccounts.map((a) => ({ id: a.id, username: a.username ?? a.id, pageName: a.pageName, followers: a.followers_count ?? null }))}
        igError={igError}
        profiles={profiles}
        workspaces={workspaces.filter((w) => calIds.includes(w.id)).map((w) => ({ id: w.id, name: w.name }))}
        logs={logs.map((l) => ({ id: l.id, provider: l.provider, operation: l.operation, status: l.status, message: l.message, at: l.startedAt.toISOString() }))}
        flash={{ ok: sp.ok ?? null, error: sp.erro ?? null }}
      />
    </div>
  );
}
