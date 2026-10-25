"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WsDot } from "@/components/ui/misc";
import { addMonthsYm, formatYm } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type FinanceTab = "visao" | "vendas" | "lancamentos" | "contas" | "cartoes" | "categorias";

const TAB_LABEL: Record<FinanceTab, string> = {
  visao: "Visão geral",
  vendas: "Vendas",
  lancamentos: "Lançamentos",
  contas: "Contas",
  cartoes: "Cartões",
  categorias: "Categorias",
};
const MONTHLY_TABS: FinanceTab[] = ["visao", "lancamentos", "contas", "vendas"];

export function useFinanceHref() {
  const pathname = usePathname();
  const params = useSearchParams();
  return React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const q = next.toString();
      return q ? `${pathname}?${q}` : pathname;
    },
    [pathname, params],
  );
}

export function FinanceShell({
  area,
  title,
  workspace,
  tabs,
  tab,
  month,
  today,
  children,
}: {
  area: "pessoal" | "mentoria";
  title: string;
  workspace: { id: string; name: string; color: string };
  tabs: FinanceTab[];
  tab: FinanceTab;
  month: string;
  today: string;
  children: React.ReactNode;
}) {
  const href = useFinanceHref();
  const monthly = MONTHLY_TABS.includes(tab);
  const tabHref = (t: FinanceTab) => href({ aba: t === "visao" ? null : t, cartao: null, fatura: null, venda: null, categoria: null, conta: null, situacao: null, tipo: null, q: null });
  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><WsDot color={workspace.color} /> {workspace.name}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {monthly && (
            <div className="flex items-center gap-1" aria-label="Mês">
              <Button variant="outline" size="icon" asChild><Link href={href({ mes: addMonthsYm(month, -1) })} aria-label="Mês anterior" scroll={false}><ChevronLeft /></Link></Button>
              <span className="min-w-36 text-center text-sm font-medium capitalize" aria-live="polite">{formatYm(month)}</span>
              <Button variant="outline" size="icon" asChild><Link href={href({ mes: addMonthsYm(month, 1) })} aria-label="Próximo mês" scroll={false}><ChevronRight /></Link></Button>
              {month !== today.slice(0, 7) && <Button variant="ghost" size="sm" asChild><Link href={href({ mes: null })} scroll={false}>Mês atual</Link></Button>}
            </div>
          )}
          {tab === "lancamentos" && (
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/export/financeiro?ws=${workspace.id}&mes=${month}`} download><Download /> CSV</a>
            </Button>
          )}
        </div>
      </header>
      <nav className="flex gap-1 overflow-x-auto border-b border-border" aria-label="Seções do financeiro">
        {tabs.map((t) => (
          <Link
            key={t}
            href={tabHref(t)}
            scroll={false}
            aria-current={t === tab ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              t === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {TAB_LABEL[t]}
          </Link>
        ))}
      </nav>
      <div data-area={area}>{children}</div>
    </div>
  );
}
