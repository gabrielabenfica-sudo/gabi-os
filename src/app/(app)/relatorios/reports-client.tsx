"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form-controls";
import { PageHeader } from "@/components/ui/misc";
import { formatGoalValue, SITUATION_LABEL } from "@/lib/goals";
import { cn } from "@/lib/utils";
import type { ConsolidatedReport } from "@/server/reports";

export type Preset = "mes" | "mes-anterior" | "trimestre" | "ano" | "personalizado";

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hours = (m: number) => `${(m / 60).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
const br = (s: string) => s.split("-").reverse().join("/");
const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

export function ReportsClient({ report: r, preset }: { report: ConsolidatedReport; preset: Preset }) {
  const router = useRouter();
  const pathname = usePathname();
  const [custom, setCustom] = React.useState(r.range);
  const empty = !r.tasks && !r.agenda && !r.habits && !r.personal && !r.mentoria && !r.crm && !r.content && !r.goals;

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Relatórios"
        description={`Consolidado de ${br(r.range.from)} a ${br(r.range.to)} (${r.days} dias), calculado a partir dos seus registros.`}
        actions={
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" asChild><a href={`/api/relatorios?de=${r.range.from}&ate=${r.range.to}`}><Download /> CSV</a></Button>
            <Button variant="outline" onClick={() => window.print()}><Printer /> Imprimir / PDF</Button>
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Select aria-label="Período" value={preset} className="w-48" onChange={(e) => (e.target.value === "personalizado" ? undefined : router.replace(`${pathname}?periodo=${e.target.value}`))}>
          <option value="mes">Mês atual</option>
          <option value="mes-anterior">Mês anterior</option>
          <option value="trimestre">Trimestre atual</option>
          <option value="ano">Ano até hoje</option>
          <option value="personalizado">Personalizado</option>
        </Select>
        <Input type="date" aria-label="De" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="w-40" />
        <span className="text-muted-foreground">a</span>
        <Input type="date" aria-label="Até" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="w-40" />
        <Button variant="secondary" onClick={() => router.replace(`${pathname}?de=${custom.from}&ate=${custom.to}`)}>Aplicar</Button>
      </div>

      {empty && <p className="text-sm text-muted-foreground">Você não tem acesso a nenhum módulo com dados para relatório.</p>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="report">
        {r.personal && (
          <Section title="Finanças pessoais" href="/financas/pessoal">
            <Row label="Receitas" value={brl(r.personal.incomeCents)} tone="in" />
            <Row label="Despesas" value={brl(r.personal.expenseCents)} tone="out" />
            <Row label="Resultado" value={brl(r.personal.resultCents)} tone={r.personal.resultCents < 0 ? "out" : "in"} strong />
            <Row label="Resultado realizado" value={brl(r.personal.resultRealizedCents)} />
            <Row label="Retiradas da Mentoria" value={brl(r.personal.distributionsCents)} />
          </Section>
        )}
        {r.mentoria && (
          <Section title="Mentoria" href="/financas/mentoria">
            <Row label="Vendas" value={String(r.mentoria.salesCount)} />
            <Row label="Faturamento" value={brl(r.mentoria.revenueCents)} tone="in" />
            <Row label="Despesas" value={brl(r.mentoria.expensesCents)} tone="out" />
            <Row label="Lucro" value={brl(r.mentoria.profitCents)} tone={r.mentoria.profitCents < 0 ? "out" : "in"} strong />
            <Row label="Recebido no caixa" value={brl(r.mentoria.receiptsCents)} />
          </Section>
        )}
        {r.turbo && (
          <Section title="Remuneração TURBO" href="/turbo/remuneracao">
            <Row label="Prevista" value={brl(r.turbo.expectedCents)} />
            <Row label="Recebida" value={brl(r.turbo.receivedCents)} strong />
          </Section>
        )}
        {r.tasks && (
          <Section title="Tarefas" href="/tarefas">
            <Row label="Criadas" value={String(r.tasks.created)} />
            <Row label="Concluídas" value={String(r.tasks.completed)} strong />
            <Row label="Atrasadas no fim do período" value={String(r.tasks.overdueAtEnd)} tone={r.tasks.overdueAtEnd ? "out" : undefined} />
            <Row label="Tempo registrado" value={hours(r.tasks.minutesLogged)} />
            {r.tasks.completedByWorkspace.map((w) => <Row key={w.workspace} label={`· ${w.workspace}`} value={`${w.count} concluída(s)`} muted />)}
          </Section>
        )}
        {r.agenda && (
          <Section title="Agenda" href="/agenda">
            <Row label="Compromissos" value={String(r.agenda.events)} />
            <Row label="Marcados como concluídos" value={String(r.agenda.done)} />
            <Row label="Horas ocupadas" value={hours(r.agenda.busyMinutes)} strong />
            {r.agenda.minutesByWorkspace.map((w) => <Row key={w.workspace} label={`· ${w.workspace}`} value={hours(w.minutes)} muted />)}
          </Section>
        )}
        {r.habits && (
          <Section title="Hábitos" href="/habitos">
            <Row label="Realização geral" value={r.habits.rate === null ? "—" : `${r.habits.rate}%`} strong />
            {r.habits.items.map((h) => <Row key={h.name} label={`· ${h.name}`} value={`${h.rate}% (${h.done}/${h.expected})`} muted />)}
          </Section>
        )}
        {r.crm && (
          <Section title="CRM" href="/mentoria/crm">
            <Row label="Novos leads" value={String(r.crm.newLeads)} />
            <Row label="Vendas" value={String(r.crm.won)} />
            <Row label="Perdidos" value={String(r.crm.lost)} />
            <Row label="Conversão" value={pct(r.crm.conversionRate)} strong />
            <Row label="Em negociação hoje" value={brl(r.crm.pipelineCents)} />
          </Section>
        )}
        {r.mentees && (
          <Section title="Mentorados" href="/mentoria/mentorados">
            <Row label="Ativos hoje" value={String(r.mentees.active)} />
            <Row label="Iniciados no período" value={String(r.mentees.started)} />
            <Row label="Encontros realizados" value={String(r.mentees.sessionsDone)} strong />
          </Section>
        )}
        {r.content && (
          <Section title="Conteúdo" href="/conteudo?aba=relatorio">
            <Row label="Publicados" value={String(r.content.publishedCount)} strong />
            <Row label="Alcance somado" value={r.content.totalReach.toLocaleString("pt-BR")} />
            <Row label="Engajamento médio" value={pct(r.content.avgEngagement)} />
            {r.content.byFormat.filter((f) => f.count).map((f) => <Row key={f.format} label={`· ${f.label}`} value={`${f.count} post(s) · ${pct(f.avgEngagement)}`} muted />)}
          </Section>
        )}
        {r.goals && (
          <Section title="Metas" href="/metas" wide>
            <Row label="Ativas" value={String(r.goals.active)} />
            <Row label="No ritmo ou atingidas" value={String(r.goals.onTrack)} />
            <Row label="Pedem atenção" value={String(r.goals.attention)} tone={r.goals.attention ? "out" : undefined} />
            <Row label="Fechadas no período" value={`${r.goals.achievedInPeriod} atingida(s) · ${r.goals.missedInPeriod} não atingida(s)`} />
            {r.goals.items.slice(0, 10).map((g) => (
              <Row key={g.id} label={`· ${g.title}`} value={`${SITUATION_LABEL[g.situation]} · ${g.measure === "QUALITATIVE" ? `${g.progress}%` : `${formatGoalValue(g.current, g.unit)} de ${formatGoalValue(g.target, g.unit)}`}`} muted />
            ))}
          </Section>
        )}
        <Section title="MAAS" href="/maas">
          {r.maas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma avaliação no período.</p> : r.maas.map((m) => <Row key={m.date} label={`Média em ${br(m.date)}`} value={m.average.toLocaleString("pt-BR")} />)}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, href, children, wide }: { title: string; href: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <Card className={cn("break-inside-avoid", wide && "md:col-span-2")}>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle>{title}</CardTitle>
        <Link href={href} className="text-xs text-primary hover:underline print:hidden">Abrir</Link>
      </CardHeader>
      <CardContent><dl className="grid gap-1.5">{children}</dl></CardContent>
    </Card>
  );
}

function Row({ label, value, tone, strong, muted }: { label: string; value: string; tone?: "in" | "out"; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 text-sm", muted && "text-xs text-muted-foreground")}>
      <dt className="truncate">{label}</dt>
      <dd className={cn("shrink-0 tabular", strong && "font-semibold", tone === "in" && "text-success", tone === "out" && "text-danger")}>{value}</dd>
    </div>
  );
}
