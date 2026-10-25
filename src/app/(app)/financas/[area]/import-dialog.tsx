"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { Checkbox } from "@/components/ui/misc";
import { Money } from "@/components/finance/money-input";
import type { PreviewRow } from "@/server/finance/imports";
import type { CsvMapping } from "@/lib/finance/import-parsers";
import { confirmImportAction, previewImportAction } from "../actions";
import { ymdBR, type FinanceBase } from "./types";

const STATUS = {
  NEW: { label: "Novo", variant: "default" },
  MATCH: { label: "Conciliar", variant: "info" },
  DUPLICATE: { label: "Possível duplicado", variant: "warning" },
  IMPORTED: { label: "Já importado", variant: "outline" },
} as const;

/**
 * Lê o arquivo como texto. Muitos bancos brasileiros geram OFX/CSV em
 * Windows-1252: se o conteúdo não for UTF-8 válido, decodifica nessa codificação.
 */
async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

type Preview = Awaited<ReturnType<typeof previewImportAction>> extends infer R ? (R extends { ok: true; data: infer D } ? D : never) : never;

export function ImportDialog({ base, defaultAccountId, onClose }: { base: FinanceBase; defaultAccountId?: string; onClose: () => void }) {
  const router = useRouter();
  const accounts = base.accounts.filter((a) => !a.archived);
  const [accountId, setAccountId] = React.useState(defaultAccountId ?? accounts[0]?.id ?? "");
  const [file, setFile] = React.useState<{ name: string; content: string } | null>(null);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [mapping, setMapping] = React.useState<CsvMapping | null>(null);
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const [categories, setCategories] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);

  const load = async (f: { name: string; content: string }, m: CsvMapping | null, acc = accountId) => {
    setBusy(true);
    const r = await previewImportAction({ accountId: acc, fileName: f.name, content: f.content, mapping: m });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    setPreview(r.data);
    setMapping(r.data.mapping ?? m ?? (r.data.headers ? { date: 0, description: 1, amount: 2, header: true } : null));
    setSelected(Object.fromEntries(r.data.rows.map((row) => [row.externalId, row.status === "NEW" || row.status === "MATCH"])));
    setCategories({});
  };

  const rows: PreviewRow[] = preview?.rows ?? [];
  const chosen = rows.filter((r) => selected[r.externalId] && r.status !== "IMPORTED");
  const sum = chosen.reduce((a, r) => a + r.amountCents, 0);
  const cats = (type: "INCOME" | "EXPENSE") => base.categories.filter((c) => c.kind === type && !c.archived);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar extrato</DialogTitle>
          <DialogDescription>
            Arquivo OFX ou CSV exportado pelo banco. Nada é gravado até você confirmar. Linhas já importadas são reconhecidas e não duplicam; lançamentos previstos com mesmo valor e data próxima são conciliados (viram pagos).
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Conta" htmlFor="im-account">
            <Select
              id="im-account"
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                if (file) void load(file, mapping, e.target.value);
              }}
              className="w-56"
            >
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="Arquivo (OFX ou CSV, até 2 MB)" htmlFor="im-file">
            <Input
              id="im-file"
              type="file"
              accept=".ofx,.qfx,.csv,.txt,text/csv"
              className="w-72 py-1.5"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 2 * 1024 * 1024) return toast.error("Arquivo grande demais (máximo 2 MB).");
                const loaded = { name: f.name, content: await readText(f) };
                setFile(loaded);
                setMapping(null);
                await load(loaded, null);
              }}
            />
          </Field>
          {!accounts.length && <p className="text-sm text-danger">Cadastre uma conta primeiro.</p>}
        </div>

        {preview && preview.format === "CSV" && preview.headers && mapping && (
          <div className="grid gap-2 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">{preview.needsMapping ? "Não reconheci as colunas. Indique quais são:" : "Colunas do CSV"}</p>
            <div className="flex flex-wrap items-end gap-2">
              {(["date", "description", "amount", "debit", "credit"] as const).map((k) => (
                <Field key={k} label={{ date: "Data", description: "Descrição", amount: "Valor", debit: "Débito", credit: "Crédito" }[k]} htmlFor={`im-col-${k}`}>
                  <Select
                    id={`im-col-${k}`}
                    value={mapping[k] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m!, [k]: e.target.value === "" ? null : Number(e.target.value) }))}
                    className="h-8 w-36"
                  >
                    {k !== "date" && k !== "description" && <option value="">—</option>}
                    {preview.headers!.map((h, i) => <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>)}
                  </Select>
                </Field>
              ))}
              <label className="flex items-center gap-2 pb-1.5 text-sm"><Checkbox checked={mapping.header} onChange={(e) => setMapping((m) => ({ ...m!, header: e.target.checked }))} /> 1ª linha é cabeçalho</label>
              <label className="flex items-center gap-2 pb-1.5 text-sm"><Checkbox checked={!!mapping.invert} onChange={(e) => setMapping((m) => ({ ...m!, invert: e.target.checked }))} /> Inverter sinal</label>
              <Button size="sm" variant="secondary" disabled={busy || !file} onClick={() => file && load(file, mapping)}>Aplicar colunas</Button>
            </div>
          </div>
        )}

        {preview && !preview.needsMapping && (
          <>
            {preview.errors.length > 0 && (
              <details className="rounded-lg border border-warning/40 bg-warning-soft/30 p-3 text-sm">
                <summary className="cursor-pointer">{preview.errors.length} linha(s) não puderam ser lidas</summary>
                <ul className="mt-2 grid gap-0.5 text-xs">{preview.errors.slice(0, 50).map((e, i) => <li key={i}>Linha {e.line}: {e.message}</li>)}</ul>
              </details>
            )}
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum lançamento encontrado no arquivo.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[760px] text-sm" data-testid="import-preview">
                  <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="w-8 px-2 py-2">
                        <Checkbox
                          aria-label="Selecionar todas"
                          checked={rows.filter((r) => r.status !== "IMPORTED").every((r) => selected[r.externalId])}
                          onChange={(e) => setSelected(Object.fromEntries(rows.map((r) => [r.externalId, e.target.checked && r.status !== "IMPORTED"])))}
                        />
                      </th>
                      <th className="px-2 py-2 font-medium">Data</th>
                      <th className="px-2 py-2 font-medium">Descrição</th>
                      <th className="px-2 py-2 text-right font-medium">Valor</th>
                      <th className="px-2 py-2 font-medium">Situação</th>
                      <th className="px-2 py-2 font-medium">Categoria</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const type = r.amountCents > 0 ? "INCOME" : "EXPENSE";
                      const st = STATUS[r.status];
                      return (
                        <tr key={r.externalId} className="border-t border-border" data-import-row={r.description}>
                          <td className="px-2 py-1.5">
                            <Checkbox
                              aria-label={`Importar ${r.description}`}
                              disabled={r.status === "IMPORTED"}
                              checked={!!selected[r.externalId] && r.status !== "IMPORTED"}
                              onChange={(e) => setSelected((s) => ({ ...s, [r.externalId]: e.target.checked }))}
                            />
                          </td>
                          <td className="px-2 py-1.5 tabular">{ymdBR(r.date)}</td>
                          <td className="max-w-72 truncate px-2 py-1.5" title={r.description}>{r.description}</td>
                          <td className="px-2 py-1.5 text-right"><Money cents={r.amountCents} tone="auto" signed /></td>
                          <td className="px-2 py-1.5">
                            <Badge variant={st.variant}>{st.label}</Badge>
                            {r.match && <p className="mt-0.5 text-xs text-muted-foreground">{r.status === "MATCH" ? "com" : "parece"} “{r.match.description}” ({ymdBR(r.match.date)})</p>}
                          </td>
                          <td className="px-2 py-1.5">
                            {r.status !== "IMPORTED" && (
                              <Select aria-label={`Categoria de ${r.description}`} value={categories[r.externalId] ?? ""} onChange={(e) => setCategories((c) => ({ ...c, [r.externalId]: e.target.value }))} className="h-8 w-44">
                                <option value="">{r.status === "MATCH" ? "Manter" : "Sem categoria"}</option>
                                {cats(type).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </Select>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        <DialogFooter className="items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {preview && !preview.needsMapping ? <>{chosen.length} de {rows.length} selecionada(s) · saldo das selecionadas <Money cents={sum} tone="auto" signed /></> : <><FileUp className="mr-1 inline size-4" />Escolha um arquivo</>}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button
              disabled={busy || !file || !chosen.length}
              onClick={async () => {
                if (!file) return;
                setBusy(true);
                const r = await confirmImportAction({
                  accountId,
                  fileName: file.name,
                  content: file.content,
                  mapping: preview?.format === "CSV" ? mapping : null,
                  selections: chosen.map((x) => ({ externalId: x.externalId, categoryId: categories[x.externalId] || null })),
                });
                setBusy(false);
                if (!r.ok) return toast.error(r.error);
                toast.success(`Importado: ${r.data.created} novo(s), ${r.data.reconciled} conciliado(s).`);
                onClose();
                router.refresh();
              }}
            >
              Importar {chosen.length || ""}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
