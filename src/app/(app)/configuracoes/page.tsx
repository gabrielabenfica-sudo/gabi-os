import { requireSession } from "@/server/auth/current";
import { listWorkspaces } from "@/server/workspaces";
import { listSessions, recentAudit } from "@/server/settings";
import { formatDateTimeBR } from "@/lib/dates";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProfileForm } from "./profile-form";
import { WorkspacesForm } from "./workspaces-form";
import { PasswordForm } from "./password-form";
import { SessionsList } from "./sessions-list";

export const metadata = { title: "Configurações" };

const ACTION_LABELS: Record<string, string> = {
  register: "Conta criada",
  login: "Login",
  logout: "Saída",
  revoke: "Sessão encerrada",
  update_profile: "Perfil atualizado",
  change_password: "Senha alterada",
  export: "Dados exportados",
  update: "Atualização",
};

export default async function SettingsPage() {
  const { user, sessionId } = await requireSession();
  const [workspaces, sessions, audit] = await Promise.all([
    listWorkspaces(user.id),
    listSessions(user.id),
    recentAudit(user.id, 15),
  ]);

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Perfil, ambientes, segurança e dados.</p>
      </header>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Perfil e preferências</CardTitle>
            <CardDescription>Nome, fuso horário, tema e nome do aplicativo.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm
              initial={{ name: user.name, timezone: user.timezone, appName: user.appName, theme: user.theme }}
              email={user.email}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ambientes</CardTitle>
            <CardDescription>Renomeie, mude a cor e a ordem dos seus ambientes.</CardDescription>
          </CardHeader>
          <CardContent>
            <WorkspacesForm
              workspaces={workspaces
                .filter((w) => w.role === "OWNER")
                .map((w) => ({ id: w.id, name: w.name, color: w.color, kind: w.kind }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Senha</CardTitle>
            <CardDescription>Ao trocar a senha, as outras sessões são encerradas.</CardDescription>
          </CardHeader>
          <CardContent>
            <PasswordForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sessões ativas</CardTitle>
            <CardDescription>Dispositivos conectados à sua conta.</CardDescription>
          </CardHeader>
          <CardContent>
            <SessionsList
              currentId={sessionId}
              sessions={sessions.map((s) => ({
                id: s.id,
                userAgent: s.userAgent,
                ip: s.ip,
                lastSeen: formatDateTimeBR(s.lastSeenAt, user.timezone),
                created: formatDateTimeBR(s.createdAt, user.timezone),
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Seus dados</CardTitle>
            <CardDescription>
              Baixe uma cópia completa dos seus dados em JSON (sem senhas nem tokens de integração).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <a href="/api/export" download>
                Exportar todos os dados
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Atividade recente</CardTitle>
            <CardDescription>Registro de auditoria das ações relevantes.</CardDescription>
          </CardHeader>
          <CardContent>
            {audit.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma atividade registrada.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {audit.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3">
                    <span>
                      {ACTION_LABELS[a.action] ?? a.action}
                      {a.workspace && <span className="text-muted-foreground"> · {a.workspace.name}</span>}
                    </span>
                    <span className="tabular text-xs text-muted-foreground">{formatDateTimeBR(a.createdAt, user.timezone)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
