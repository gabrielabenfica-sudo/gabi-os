"use client";

import * as React from "react";
import { Archive, ArchiveRestore } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form-controls";
import { Segmented } from "@/components/ui/misc";
import { archiveCategoryAction, createCategoryAction, updateCategoryAction } from "../actions";
import { COST_TYPE_LABEL, type FinanceBase } from "./types";

const COLORS = ["#A66F7C", "#3069A8", "#3F7D5C", "#B7822F", "#7A5C99", "#B4474F", "#4E6F8F", "#B8AAA4"];

export function CategoriesTab(base: FinanceBase) {
  const [kind, setKind] = React.useState<"EXPENSE" | "INCOME">("EXPENSE");
  const [name, setName] = React.useState("");
  const [costType, setCostType] = React.useState("");
  const isMentoria = base.workspace.kind === "MENTORIA";
  const list = base.categories.filter((c) => c.kind === kind);

  const act = async (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    const r = await fn();
    if (!r.ok) toast.error(r.error);
    else if (r.message) toast.success(r.message);
    return r.ok;
  };

  return (
    <div className="grid max-w-3xl gap-4">
      <Segmented ariaLabel="Tipo de categoria" value={kind} options={[{ value: "EXPENSE", label: "Despesas" }, { value: "INCOME", label: "Receitas" }]} onChange={setKind} />
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await act(() =>
            createCategoryAction(base.workspace.id, {
              name,
              kind,
              color: COLORS[list.length % COLORS.length],
              costType: kind === "EXPENSE" && costType ? (costType as "FIXED") : null,
            }),
          );
          if (ok) setName("");
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "EXPENSE" ? "Nova categoria de despesa" : "Nova categoria de receita"} aria-label="Nome da categoria" className="max-w-xs" />
        {isMentoria && kind === "EXPENSE" && (
          <Select value={costType} onChange={(e) => setCostType(e.target.value)} className="w-44" aria-label="Tipo de custo">
            <option value="">Tipo de custo</option>
            {Object.entries(COST_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        )}
        <Button type="submit" disabled={!name.trim()}>Adicionar</Button>
      </form>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {list.map((c) => (
          <CategoryRow key={c.id} cat={c} isMentoria={isMentoria} act={act} />
        ))}
        {list.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma categoria.</li>}
      </ul>
      {isMentoria && <p className="text-xs text-muted-foreground">O tipo de custo separa custos fixos, variáveis, comissões e reembolsos no lucro da Mentoria.</p>}
    </div>
  );
}

function CategoryRow({ cat, isMentoria, act }: { cat: FinanceBase["categories"][number]; isMentoria: boolean; act: (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => Promise<boolean> }) {
  const [name, setName] = React.useState(cat.name);
  return (
    <li className="flex items-center gap-3 px-4 py-2" data-category={cat.name}>
      <input
        type="color"
        value={cat.color ?? "#B8AAA4"}
        onChange={(e) => void act(() => updateCategoryAction(cat.id, { color: e.target.value }))}
        className="size-7 cursor-pointer rounded border border-input bg-card p-0.5"
        aria-label={`Cor de ${cat.name}`}
        disabled={cat.archived}
      />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== cat.name && void act(() => updateCategoryAction(cat.id, { name }))}
        className="h-8 max-w-xs"
        aria-label="Nome da categoria"
        disabled={cat.archived}
      />
      {isMentoria && cat.kind === "EXPENSE" && (
        <Select value={cat.costType ?? ""} onChange={(e) => void act(() => updateCategoryAction(cat.id, { costType: e.target.value || null }))} className="h-8 w-40" aria-label="Tipo de custo" disabled={cat.archived}>
          <option value="">Sem tipo</option>
          {Object.entries(COST_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      )}
      <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void act(() => archiveCategoryAction(cat.id, !cat.archived))}>
        {cat.archived ? <><ArchiveRestore /> Reativar</> : <><Archive /> Arquivar</>}
      </Button>
    </li>
  );
}
