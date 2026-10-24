import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { listWorkspaces } from "@/server/workspaces";
import { getWorkspaceFilter } from "@/server/workspace-filter";
import { formatLongDateBR, greetingFor } from "@/lib/dates";
import { firstName } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Dashboard" };

const KIND_LABEL = { TURBO: "Profissional", PESSOAL: "Pessoal", MENTORIA: "Negócio" } as const;

export default async function DashboardPage() {
  const user = await requireUser();
  const workspaces = await listWorkspaces(user.id);
  const filter = await getWorkspaceFilter(workspaces);
  const visible = filter === "all" ? workspaces : workspaces.filter((w) => w.id === filter);
  const now = new Date();

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm capitalize text-muted-foreground">{formatLongDateBR(now, user.timezone)}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {greetingFor(now, user.timezone)}, {firstName(user.name)}.
          </h1>
        </div>
      </header>

      <section aria-labelledby="ambientes-title" className="grid gap-3">
        <h2 id="ambientes-title" className="text-sm font-medium text-muted-foreground">
          {filter === "all" ? "Seus ambientes" : "Ambiente selecionado"}
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {visible.map((w) => (
            <Card key={w.id} className="relative overflow-hidden">
              <span className="absolute inset-x-0 top-0 h-1" style={{ background: w.color }} aria-hidden />
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{w.name}</CardTitle>
                  <Badge variant="outline">{KIND_LABEL[w.kind]}</Badge>
                </div>
                <CardDescription>
                  {w.kind === "TURBO" && "Demandas, conteúdo, remuneração e metas profissionais."}
                  {w.kind === "PESSOAL" && "Rotina, hábitos, finanças pessoais e objetivos."}
                  {w.kind === "MENTORIA" && "Vendas, mentorados, faturamento e lucro."}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Seu painel ainda está vazio</CardTitle>
          <CardDescription>
            Os indicadores do dia (compromissos, tarefas, metas, hábitos e finanças) aparecem aqui assim que os
            módulos correspondentes recebem dados. Nada é exibido sem informação real registrada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/configuracoes"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Personalizar nomes e cores dos ambientes <ArrowRight className="size-4" />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
