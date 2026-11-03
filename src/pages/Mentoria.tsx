import { useMemo } from "react";
import { ArrowRight, CircleDollarSign, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/lib/workspace";
import { usePipelineStages } from "@/lib/queries";
import { PageHeader, StatCard } from "@/components/common/page-parts";

export default function Mentoria() {
  const { active, workspaces } = useWorkspace();
  const { data: stages = [] } = usePipelineStages();

  const mentoriaWorkspace =
    active?.kind === "MENTORIA"
      ? active
      : workspaces.find((workspace) => workspace.kind === "MENTORIA") ?? active;

  const workspaceStages = useMemo(
    () =>
      stages
        .filter((stage) => stage.workspace_id === mentoriaWorkspace?.id)
        .sort((a, b) => a.position - b.position),
    [stages, mentoriaWorkspace],
  );

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Mentoria"
        title="O funil da sua mentoria"
        description="As oito etapas do processo comercial. O arquivo exportado não tinha leads, programas ou vendas — por isso o funil aparece pronto, porém vazio."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Etapas" value={workspaceStages.length} hint="do primeiro contato à venda" icon={<ArrowRight className="size-4" />} accent />
        <StatCard label="Leads" value={0} hint="nenhum no arquivo" icon={<Users className="size-4" />} />
        <StatCard label="Vendas" value={0} hint="nenhuma no arquivo" icon={<CircleDollarSign className="size-4" />} />
      </div>

      <Card className="border-border/70 shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-lg">Etapas do funil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {workspaceStages.map((stage, index) => (
            <div
              key={stage.id}
              className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2.5"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <span className="flex-1 text-sm text-foreground">{stage.name}</span>
              {stage.is_won ? (
                <Badge variant="secondary" className="text-[10px] text-primary">
                  ganho
                </Badge>
              ) : stage.is_lost ? (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  perdido
                </Badge>
              ) : null}
              <span className="w-16 text-right text-[11px] text-muted-foreground">0 leads</span>
            </div>
          ))}
          {workspaceStages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma etapa configurada.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-accent/25 shadow-card">
        <CardContent className="space-y-1.5 p-5">
          <p className="font-display text-lg text-foreground">Programas e mentorados</p>
          <p className="text-sm text-muted-foreground">
            Este módulo está pronto para receber seus mentorados, programas e vendas. Assim que você
            cadastrar o primeiro lead, ele aparece aqui e no funil.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
