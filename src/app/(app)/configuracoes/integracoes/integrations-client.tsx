"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarDays, CheckCircle2, Instagram, Landmark, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/form-controls";
import { Checkbox, PageHeader } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm";
import { disconnectGoogleAction, disconnectMetaAction, linkProfileAction, refreshCalendarsAction, syncGoogleAction, syncInstagramAction, updateCalendarAction } from "./actions";

type GoogleConn = { id: string; accountEmail: string | null; status: string; lastSyncAt: string | null; lastError: string | null; calendars: { id: string; name: string; color: string | null; isPrimary: boolean; selected: boolean; workspaceId: string | null; lastSyncAt: string | null }[] };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "nunca");
const STATUS: Record<string, { label: string; variant: "success" | "danger" | "outline" | "warning" }> = {
  ACTIVE: { label: "Conectado", variant: "success" },
  ERROR: { label: "Com erro", variant: "danger" },
  REVOKED: { label: "Revogado", variant: "outline" },
  PENDING: { label: "Pendente", variant: "warning" },
};

export function IntegrationsClient({
  googleConfigured, metaConfigured, google, meta, igAccounts, igError, profiles, workspaces, logs, flash,
}: {
  googleConfigured: boolean;
  metaConfigured: boolean;
  google: GoogleConn[];
  meta: { status: string; lastSyncAt: string | null; lastError: string | null; expiresAt: string | null } | null;
  igAccounts: { id: string; username: string; pageName: string; followers: number | null }[];
  igError: string | null;
  profiles: { id: string; name: string; username: string; externalUserId: string | null; connectionId: string | null }[];
  workspaces: { id: string; name: string }[];
  logs: { id: string; provider: string; operation: string; status: string; message: string | null; at: string }[];
  flash: { ok: string | null; error: string | null };
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (flash.ok === "google") toast.success("Google Calendar conectado. Escolha abaixo em qual ambiente cada calendário entra.");
    if (flash.ok === "meta") toast.success("Meta conectada. Ligue seus perfis às contas do Instagram.");
    if (flash.error) toast.error(decodeURIComponent(flash.error).replace(/-/g, " "));
    if (flash.ok || flash.error) window.history.replaceState(null, "", "/configuracoes/integracoes");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async <T,>(key: string, fn: () => Promise<{ ok: boolean; error?: string; message?: string; data?: T }>) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (!r.ok) toast.error(r.error);
    else if (r.message) toast.success(r.message);
    router.refresh();
    return r;
  };

  return (
    <div className="grid gap-5">
      <PageHeader title="Integrações" description="Conecte serviços externos. Cada conexão mostra quando sincronizou pela última vez e o último erro, se houver." />

      <Card data-testid="google-integration">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CalendarDays className="size-5" /> Google Calendar</CardTitle>
          <CardDescription>
            Traz os eventos dos calendários escolhidos para a agenda (60 dias para trás e 12 meses para frente) e envia ao Google os compromissos criados, alterados ou excluídos no app nos ambientes ligados a um calendário.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {!googleConfigured ? (
            <NotConfigured vars={["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "APP_URL"]} doc="Crie um projeto no Google Cloud, ative a Google Calendar API e crie um ID do cliente OAuth (aplicativo da Web) com a URL de redirecionamento APP_URL/api/integrations/google/callback." />
          ) : (
            <div><Button asChild><a href="/api/integrations/google/start">{google.length ? "Conectar outra conta Google" : "Conectar Google Calendar"}</a></Button></div>
          )}
          {google.map((c) => (
            <div key={c.id} className="grid gap-3 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{c.accountEmail ?? "Conta Google"}</p>
                <Badge variant={STATUS[c.status]?.variant ?? "outline"}>{STATUS[c.status]?.label ?? c.status}</Badge>
                <span className="text-xs text-muted-foreground">Última sincronização: {when(c.lastSyncAt)}</span>
                <div className="ml-auto flex gap-1">
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("sync" + c.id, () => syncGoogleAction(c.id))}>
                    <RefreshCw className={busy === "sync" + c.id ? "animate-spin" : undefined} /> Sincronizar agora
                  </Button>
                  <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => run("cal" + c.id, () => refreshCalendarsAction(c.id))}>Atualizar calendários</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (!(await confirm({ title: "Desconectar esta conta Google?", description: "Os compromissos já importados continuam na agenda como compromissos do app; nada é apagado no Google.", danger: true, confirmLabel: "Desconectar" }))) return;
                      await run("dis" + c.id, () => disconnectGoogleAction(c.id));
                    }}
                  >
                    <Unplug /> Desconectar
                  </Button>
                </div>
              </div>
              {c.lastError && <p className="flex items-start gap-1.5 text-sm text-danger"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> {c.lastError}</p>}
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr><th className="py-1 font-medium">Sincronizar</th><th className="py-1 font-medium">Calendário</th><th className="py-1 font-medium">Ambiente no app</th><th className="py-1 font-medium">Última leitura</th></tr>
                </thead>
                <tbody>
                  {c.calendars.map((k) => (
                    <tr key={k.id} className="border-t border-border">
                      <td className="py-1.5"><Checkbox checked={k.selected} aria-label={`Sincronizar ${k.name}`} onChange={(e) => run("k" + k.id, () => updateCalendarAction(k.id, { selected: e.target.checked }))} /></td>
                      <td className="py-1.5">
                        <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: k.color ?? "var(--muted-foreground)" }} aria-hidden />{k.name}{k.isPrimary && <Badge variant="outline">principal</Badge>}</span>
                      </td>
                      <td className="py-1.5">
                        <Select aria-label={`Ambiente de ${k.name}`} value={k.workspaceId ?? ""} className="h-8 w-52" onChange={(e) => run("w" + k.id, () => updateCalendarAction(k.id, { workspaceId: e.target.value || null }))}>
                          <option value="">Não sincronizar</option>
                          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </Select>
                      </td>
                      <td className="py-1.5 text-xs text-muted-foreground">{when(k.lastSyncAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground">
                Um calendário só sincroniza quando está marcado <b>e</b> ligado a um ambiente. Compromissos novos de um ambiente vão para o calendário ligado a ele (o principal, se houver mais de um). O status do compromisso (concluído, cancelado…) fica só no app.
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card data-testid="meta-integration">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Instagram className="size-5" /> Instagram (Meta)</CardTitle>
          <CardDescription>
            Para contas profissionais (Empresa ou Criador de conteúdo) ligadas a uma Página do Facebook. Busca seguidores, alcance e interações do perfil e as métricas das publicações recentes. Publicações que ainda não estão no app são importadas como conteúdo publicado.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {!metaConfigured ? (
            <NotConfigured vars={["META_APP_ID", "META_APP_SECRET", "APP_URL"]} doc="Crie um app em developers.facebook.com com o produto “Login do Facebook para Empresas” e as permissões instagram_basic, instagram_manage_insights, pages_show_list, pages_read_engagement e business_management. URL de redirecionamento: APP_URL/api/integrations/meta/callback." />
          ) : !meta ? (
            <div><Button asChild><a href="/api/integrations/meta/start">Conectar com a Meta</a></Button></div>
          ) : (
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={STATUS[meta.status]?.variant ?? "outline"}>{STATUS[meta.status]?.label ?? meta.status}</Badge>
                <span className="text-xs text-muted-foreground">Última sincronização: {when(meta.lastSyncAt)}{meta.expiresAt ? ` · acesso válido até ${new Date(meta.expiresAt).toLocaleDateString("pt-BR")}` : ""}</span>
                <div className="ml-auto flex gap-1">
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("ig", () => syncInstagramAction())}><RefreshCw className={busy === "ig" ? "animate-spin" : undefined} /> Sincronizar agora</Button>
                  <Button size="sm" variant="ghost" asChild><a href="/api/integrations/meta/start">Reconectar</a></Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (!(await confirm({ title: "Desconectar a Meta?", description: "Os números já registrados continuam no app.", danger: true, confirmLabel: "Desconectar" }))) return;
                      await run("igd", () => disconnectMetaAction());
                    }}
                  >
                    <Unplug /> Desconectar
                  </Button>
                </div>
              </div>
              {(meta.lastError || igError) && <p className="flex items-start gap-1.5 text-sm text-danger"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> {igError ?? meta.lastError}</p>}
              {profiles.length === 0 ? (
                <p className="text-sm text-muted-foreground">Cadastre seus perfis em Conteúdo → Perfis para ligá-los ao Instagram.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1 font-medium">Perfil no app</th><th className="py-1 font-medium">Conta do Instagram</th></tr></thead>
                  <tbody>
                    {profiles.map((p) => (
                      <tr key={p.id} className="border-t border-border">
                        <td className="py-1.5">@{p.username} <span className="text-xs text-muted-foreground">· {p.name}</span></td>
                        <td className="py-1.5">
                          <Select aria-label={`Conta do Instagram de @${p.username}`} value={p.externalUserId ?? ""} className="h-8 w-64" onChange={(e) => run("l" + p.id, () => linkProfileAction(p.id, e.target.value || null))}>
                            <option value="">Não ligado</option>
                            {igAccounts.map((a) => <option key={a.id} value={a.id}>@{a.username} ({a.pageName})</option>)}
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {igAccounts.length === 0 && !igError && <p className="text-sm text-muted-foreground">Nenhuma conta profissional do Instagram encontrada nas Páginas autorizadas.</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Landmark className="size-5" /> Bancos (Open Finance)</CardTitle>
          <CardDescription>
            A conexão direta com bancos pelo Open Finance Brasil só é permitida a instituições autorizadas pelo Banco Central ou por meio de agregadores contratados (ex.: Pluggy, Belvo), que exigem contrato e credenciais próprias. Enquanto isso, use <b>Importar extrato</b> (OFX ou CSV) em Finanças → Contas: lançamentos já importados não duplicam e previstos compatíveis são conciliados.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader><CardTitle>Histórico de sincronizações</CardTitle></CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma sincronização ainda.</p>
          ) : (
            <ul className="grid gap-1.5 text-sm">
              {logs.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-2">
                  {l.status === "SUCCESS" ? <CheckCircle2 className="size-4 text-success" /> : <AlertTriangle className="size-4 text-danger" />}
                  <span className="text-xs text-muted-foreground">{new Date(l.at).toLocaleString("pt-BR")}</span>
                  <span>{l.provider === "google" ? "Google Calendar" : l.provider === "meta" ? "Instagram" : l.provider} · {l.operation}</span>
                  {l.message && <span className="text-muted-foreground">— {l.message}</span>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NotConfigured({ vars, doc }: { vars: string[]; doc: string }) {
  return (
    <div className="grid gap-1 rounded-lg border border-dashed border-border p-3 text-sm">
      <p className="font-medium">Ainda não configurado neste servidor.</p>
      <p className="text-muted-foreground">Defina as variáveis de ambiente {vars.map((v, i) => <React.Fragment key={v}>{i ? ", " : ""}<code className="rounded bg-muted px-1">{v}</code></React.Fragment>)} e reinicie o app.</p>
      <p className="text-xs text-muted-foreground">{doc}</p>
    </div>
  );
}
