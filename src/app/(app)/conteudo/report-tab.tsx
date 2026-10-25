"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BarChart3, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form-controls";
import { EmptyState } from "@/components/ui/misc";
import { formatLabel } from "@/lib/content";
import type { contentReport } from "@/server/content";
import { br, num, partsInTz, type Href, type ProfileRow } from "./shared";

type Report = Awaited<ReturnType<typeof contentReport>>;
const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`);

export function ReportTab({ report, profiles, range, href, tz }: { report: Report; profiles: ProfileRow[]; range: { from: string; to: string }; href: Href; tz: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const maxEng = Math.max(0, ...report.byFormat.map((f) => f.avgEngagement ?? 0));
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Publicados de</span>
        <Input type="date" aria-label="De" value={range.from} className="h-8 w-40" onChange={(e) => e.target.value && router.replace(href({ de: e.target.value }))} />
        <span className="text-muted-foreground">a</span>
        <Input type="date" aria-label="Até" value={range.to} className="h-8 w-40" onChange={(e) => e.target.value && router.replace(href({ ate: e.target.value }))} />
        <Select aria-label="Perfil" value={params.get("perfil") ?? ""} onChange={(e) => router.replace(href({ perfil: e.target.value || null }))} className="h-8 w-44">
          <option value="">Todos os perfis</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>@{p.username}</option>)}
        </Select>
      </div>

      <section aria-label="Resumo do período" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Publicados" value={String(report.publishedCount)} hint={`${report.plannedCount} com publicação programada no período`} />
        <Stat label="Gravações no período" value={String(report.recordingsCount)} />
        <Stat label="Alcance somado" value={num(report.totalReach)} hint={`${report.withMetricsCount} de ${report.publishedCount} com métricas`} />
        <Stat label="Interações" value={num(report.totalInteractions)} />
        <Stat label="Engajamento médio" value={pct(report.avgEngagement)} />
        <Stat label="Novos seguidores" value={num(report.followsGained)} hint="atribuídos aos posts" />
      </section>

      {report.publishedCount === 0 ? (
        <EmptyState icon={BarChart3} title="Nenhum conteúdo publicado no período" description="Conteúdos entram no relatório quando chegam à etapa “Publicado”. Registre as métricas de cada post para comparar formatos." />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Comparação de formatos</CardTitle>
              <CardDescription>Médias por post, só entre os que têm métricas registradas.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-3" data-testid="format-comparison">
                {report.byFormat.map((f) => (
                  <li key={f.format} className="grid gap-1 text-sm" data-format={f.format}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{f.label}</span>
                      <span className="tabular">{pct(f.avgEngagement)} <span className="text-xs text-muted-foreground">engaj.</span></span>
                    </div>
                    <div className="h-2 rounded-full bg-muted" aria-hidden>
                      <div className="h-2 rounded-full bg-[var(--chart-in)]" style={{ width: `${maxEng ? ((f.avgEngagement ?? 0) / maxEng) * 100 : 0}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {f.count} post(s) · {f.withMetrics} com métricas · alcance médio {num(f.avgReach)} · interações médias {num(f.avgInteractions)}
                    </p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Melhores conteúdos</CardTitle>
              <CardDescription>Maior taxa de engajamento no período.</CardDescription>
            </CardHeader>
            <CardContent>
              {report.top.length === 0 ? (
                <p className="text-sm text-muted-foreground">Registre as métricas dos posts para ver o ranking.</p>
              ) : (
                <ol className="grid gap-2">
                  {report.top.map((r, i) => (
                    <li key={r.id} className="flex items-center gap-3 text-sm">
                      <span className="w-5 text-right text-muted-foreground">{i + 1}.</span>
                      <Link href={`/conteudo?aba=lista&c=${r.id}`} className="flex-1 truncate hover:underline">{r.title}</Link>
                      <span className="text-xs text-muted-foreground">{formatLabel(r.format)}</span>
                      <span className="w-16 text-right tabular">{pct(r.metric!.engagement)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Publicados no período</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1.5 pr-3 font-medium">Data</th>
                    <th className="py-1.5 pr-3 font-medium">Título</th>
                    <th className="py-1.5 pr-3 font-medium">Formato</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Alcance</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Visualizações</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Interações</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Engaj.</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="py-1.5 pr-3 tabular">{br(partsInTz(r.publishedAt, tz).ymd)}</td>
                      <td className="py-1.5 pr-3"><Link href={`/conteudo?aba=lista&c=${r.id}`} className="hover:underline">{r.title}</Link></td>
                      <td className="py-1.5 pr-3">{formatLabel(r.format)}</td>
                      <td className="py-1.5 pr-3 text-right tabular">{num(r.metric?.reach)}</td>
                      <td className="py-1.5 pr-3 text-right tabular">{num(r.metric?.views)}</td>
                      <td className="py-1.5 pr-3 text-right tabular">{r.metric ? num(r.metric.interactions) : "—"}</td>
                      <td className="py-1.5 pr-3 text-right tabular">{pct(r.metric?.engagement ?? null)}</td>
                      <td className="py-1.5 text-right">{r.publishedUrl && <a href={r.publishedUrl} target="_blank" rel="noreferrer" aria-label="Abrir post" className="text-muted-foreground hover:text-foreground"><ExternalLink className="size-3.5" /></a>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}
