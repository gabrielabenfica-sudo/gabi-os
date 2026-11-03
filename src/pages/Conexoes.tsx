import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertCircle,
  CalendarCheck,
  Check,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { useIntegrationAction, useIntegrations } from "@/lib/queries";
import { PageHeader } from "@/components/common/page-parts";

const PROVIDERS = [
  {
    key: "google_calendar",
    name: "Google Agenda",
    icon: CalendarCheck,
    description:
      "Importa seus eventos e mantém a agenda em sincronia nos dois sentidos, no fuso de São Paulo.",
    consoleUrl: "https://console.cloud.google.com/apis/credentials",
    consoleLabel: "Abrir Google Cloud",
    steps: [
      "Entre no Google Cloud Console e crie um projeto.",
      "Ative a Google Calendar API nesse projeto.",
      "Em Tela de consentimento OAuth, escolha o tipo Externo e adicione seu e-mail como usuário de teste.",
      "Em Credenciais, crie um ID de cliente OAuth do tipo Aplicativo da Web.",
      "Cole a URL de redirecionamento exibida abaixo nas URIs de redirecionamento autorizadas.",
      "Copie o Client ID e o Client Secret e salve aqui no Gabi OS.",
    ],
  },
];

function CredentialForm({
  provider,
  redirectUri,
  onSaved,
}: {
  provider: string;
  redirectUri: string;
  onSaved: () => void;
}) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const save = useIntegrationAction();

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-secondary/30 p-4">
      <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
        <span>
          As chaves ficam guardadas no servidor do app e nunca aparecem no navegador depois de salvas.
        </span>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">URL de redirecionamento</Label>
        <div className="flex gap-2">
          <Input readOnly value={redirectUri} className="bg-card font-mono text-[11px]" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(redirectUri);
              toast.success("URL copiada.");
            }}
          >
            Copiar
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor={`${provider}-id`}>
            Client ID / App ID
          </Label>
          <Input
            id={`${provider}-id`}
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            placeholder="cole aqui"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor={`${provider}-secret`}>
            Client Secret / App Secret
          </Label>
          <Input
            id={`${provider}-secret`}
            type="password"
            value={clientSecret}
            onChange={(event) => setClientSecret(event.target.value)}
            placeholder="cole aqui"
          />
        </div>
      </div>

      <Button
        type="button"
        size="sm"
        disabled={!clientId.trim() || !clientSecret.trim() || save.isPending}
        onClick={() =>
          save.mutate(
            { action: "save_config", provider, client_id: clientId, client_secret: clientSecret },
            {
              onSuccess: () => {
                toast.success("Credenciais salvas. Agora você pode conectar.");
                setClientId("");
                setClientSecret("");
                onSaved();
              },
              onError: (error) =>
                toast.error(error instanceof Error ? error.message : "Não foi possível salvar."),
            },
          )
        }
      >
        <KeyRound className="size-3.5" /> Salvar credenciais
      </Button>
    </div>
  );
}

export default function Conexoes() {
  const [params, setParams] = useSearchParams();
  const { data, isLoading, refetch } = useIntegrations();
  const action = useIntegrationAction();
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    const connected = params.get("conectado");
    const error = params.get("erro");
    if (connected) {
      toast.success(
        connected === "google_calendar"
          ? "Google Agenda conectado."
          : "Instagram conectado.",
      );
    }
    if (error) toast.error(error);
    if (connected || error) {
      params.delete("conectado");
      params.delete("erro");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const redirectUri = data?.redirect_uri ?? "";

  const connect = (provider: string) =>
    action.mutate(
      { action: "connect", provider, origin: window.location.origin },
      {
        onSuccess: (payload) => {
          const url = payload?.url as string | undefined;
          if (url) window.location.href = url;
        },
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : "Não foi possível conectar."),
      },
    );

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Conexões"
        title="Sua agenda, ligada ao sistema"
        description="Google Agenda com autorização oficial: você conecta, o app sincroniza e você desconecta quando quiser. O Instagram agora é manual, na própria área do Instagram."
      />

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {PROVIDERS.map((provider) => {
            const integration = data?.integrations?.find((item) => item.provider === provider.key);
            const connected = integration?.status === "connected";
            const configured = Boolean(integration?.configured);
            const Icon = provider.icon;
            const metadata = (integration?.metadata ?? {}) as Record<string, unknown>;
            const metadataError = typeof metadata.error === "string" ? metadata.error : null;

            return (
              <Card key={provider.key} className="flex flex-col border-border/70 shadow-card">
                <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Icon className="size-5" />
                    </span>
                    <div>
                      <CardTitle className="font-display text-lg">{provider.name}</CardTitle>
                      <p className="text-[11px] text-muted-foreground">
                        {connected
                          ? integration?.account_label ?? "conectado"
                          : configured
                            ? "credenciais salvas"
                            : "configuração pendente"}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={connected ? "secondary" : "outline"}
                    className={
                      connected ? "gap-1 text-[10px] text-primary" : "gap-1 text-[10px] text-muted-foreground"
                    }
                  >
                    {connected ? <CheckCircle2 className="size-2.5" /> : <AlertCircle className="size-2.5" />}
                    {connected ? "conectado" : "não conectado"}
                  </Badge>
                </CardHeader>

                <CardContent className="flex flex-1 flex-col gap-4">
                  <p className="text-sm leading-relaxed text-muted-foreground">{provider.description}</p>

                  {metadataError ? (
                    <p className="rounded-lg bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
                      {metadataError}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2">
                    {connected ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={action.isPending}
                          onClick={() =>
                            action.mutate(
                              { action: "sync", provider: provider.key },
                              {
                                onSuccess: () => {
                                  toast.success("Sincronização concluída.");
                                  void refetch();
                                },
                                onError: (error) =>
                                  toast.error(
                                    error instanceof Error ? error.message : "Falha ao sincronizar.",
                                  ),
                              },
                            )
                          }
                        >
                          <RefreshCw
                            className={action.isPending ? "size-3.5 animate-spin" : "size-3.5"}
                          />
                          Sincronizar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            action.mutate(
                              { action: "disconnect", provider: provider.key },
                              {
                                onSuccess: () => {
                                  toast.success("Conexão removida.");
                                  void refetch();
                                },
                              },
                            )
                          }
                        >
                          <Unplug className="size-3.5" /> Desconectar
                        </Button>
                      </>
                    ) : configured ? (
                      <Button
                        size="sm"
                        onClick={() => connect(provider.key)}
                        disabled={action.isPending}
                      >
                        {action.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}
                        Conectar agora
                      </Button>
                    ) : null}

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setEditing(editing === provider.key ? null : provider.key)
                      }
                    >
                      <KeyRound className="size-3.5" />
                      {configured ? "Trocar credenciais" : "Inserir credenciais"}
                    </Button>

                    {!connected ? (
                      <Button asChild size="sm" variant="ghost">
                        <a href={provider.consoleUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="size-3.5" /> {provider.consoleLabel}
                        </a>
                      </Button>
                    ) : null}
                  </div>

                  {connected ? (
                    <p className="text-[11px] text-muted-foreground">
                      Última sincronização:{" "}
                      {integration?.last_synced_at
                        ? format(parseISO(integration.last_synced_at), "dd/MM 'às' HH:mm", {
                            locale: ptBR,
                          })
                        : "ainda não sincronizado"}
                    </p>
                  ) : null}

                  {editing === provider.key || (!configured && !connected) ? (
                    <CredentialForm
                      provider={provider.key}
                      redirectUri={redirectUri}
                      onSaved={() => {
                        void refetch();
                        setEditing(null);
                      }}
                    />
                  ) : null}

                  <Accordion type="single" collapsible className="mt-auto">
                    <AccordionItem value="steps" className="border-b-0">
                      <AccordionTrigger className="py-1 text-xs text-muted-foreground hover:no-underline">
                        Como conseguir essas credenciais
                      </AccordionTrigger>
                      <AccordionContent>
                        <ol className="space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
                          {provider.steps.map((step, index) => (
                            <li key={step} className="flex gap-2">
                              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-secondary text-[9px] text-foreground">
                                {index + 1}
                              </span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="border-border/70 bg-accent/25 shadow-card">
        <CardContent className="space-y-2 p-5">
          <p className="flex items-center gap-2 font-display text-lg text-foreground">
            <ShieldCheck className="size-4 text-primary" /> O que acontece com seus dados
          </p>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              Os tokens de acesso ficam no servidor e não são enviados ao navegador.
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              Desconectar apaga os tokens guardados e interrompe a sincronização.
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              Sem credenciais, o app continua funcionando com os dados já importados.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
