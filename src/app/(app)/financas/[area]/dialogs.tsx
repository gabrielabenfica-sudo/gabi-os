"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Checkbox, Segmented } from "@/components/ui/misc";
import { MoneyInput } from "@/components/finance/money-input";
import { formatBRL } from "@/lib/money";
import type { TransactionRow } from "@/server/finance/transactions";
import { NATURE_LABEL } from "@/lib/finance/labels";
import { createAccountAction, createTransactionAction, createTransferAction, setTransactionPaidAction, updateAccountAction, updateTransactionAction } from "../actions";
import { ACCOUNT_TYPE_LABEL, dateYmd, type FinanceBase, type TransferTarget } from "./types";

type Result = { ok: boolean; error?: string; message?: string };
function done(r: Result, onClose: () => void) {
  if (!r.ok) {
    toast.error(r.error ?? "Erro.");
    return false;
  }
  if (r.message) toast.success(r.message);
  onClose();
  return true;
}

function Footer({ saving, label, onCancel, disabled }: { saving: boolean; label: string; onCancel: () => void; disabled?: boolean }) {
  return (
    <div className="flex justify-end gap-2 border-t border-border pt-4">
      <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
      <Button type="submit" disabled={saving || disabled}>{saving ? "Salvando…" : label}</Button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Lançamento (receita/despesa)
// ═══════════════════════════════════════════════════════════════

export function TransactionDialog({
  base,
  initialType = "EXPENSE",
  edit,
  onClose,
}: {
  base: FinanceBase;
  initialType?: "INCOME" | "EXPENSE";
  edit?: TransactionRow;
  onClose: () => void;
}) {
  const activeAccounts = base.accounts.filter((a) => !a.archived);
  const defaultDate = base.month === base.today.slice(0, 7) ? base.today : `${base.month}-01`;
  const [type, setType] = React.useState<"INCOME" | "EXPENSE">(edit?.type ?? initialType);
  const [v, setV] = React.useState({
    description: edit?.description ?? "",
    amountCents: edit?.amountCents ?? (null as number | null),
    categoryId: edit?.categoryId ?? "",
    accountId: edit?.accountId ?? activeAccounts[0]?.id ?? "",
    competenceDate: edit ? dateYmd(edit.competenceDate) : defaultDate,
    dueDate: edit ? dateYmd(edit.dueDate) : "",
    nature: (edit?.nature ?? "ONE_OFF") as keyof typeof NATURE_LABEL,
    paid: false,
    paidAt: base.today,
    mode: "single" as "single" | "repeat" | "installments",
    times: 12,
    notes: edit?.notes ?? "",
  });
  const [scope, setScope] = React.useState<"one" | "following">("one");
  const [saving, setSaving] = React.useState(false);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));
  const cats = base.categories.filter((c) => c.kind === type && !c.archived);
  const isSeries = Boolean(edit?.recurrenceGroupId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.amountCents) return toast.error("Informe o valor.");
    setSaving(true);
    let r: Result;
    if (edit) {
      r = await updateTransactionAction(
        edit.id,
        {
          description: v.description,
          amountCents: v.amountCents,
          categoryId: v.categoryId || null,
          accountId: v.accountId || (edit.status === "REALIZED" ? edit.accountId : null),
          competenceDate: v.competenceDate,
          dueDate: v.dueDate || null,
          nature: v.nature,
          notes: v.notes || null,
        },
        scope,
      );
    } else {
      r = await createTransactionAction({
        workspaceId: base.workspace.id,
        type,
        description: v.description,
        amountCents: v.amountCents,
        categoryId: v.categoryId || null,
        accountId: v.accountId || null,
        competenceDate: v.competenceDate,
        dueDate: v.dueDate || null,
        paid: v.paid,
        paidAt: v.paid ? v.paidAt : null,
        nature: v.mode === "installments" ? "INSTALLMENT" : v.nature,
        repeatMonths: v.mode === "repeat" ? v.times : null,
        installments: v.mode === "installments" ? v.times : null,
        notes: v.notes || null,
      });
    }
    setSaving(false);
    done(r, onClose);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{edit ? "Editar lançamento" : type === "INCOME" ? "Nova receita" : "Nova despesa"}</DialogTitle>
          <DialogDescription>{base.workspace.name} · competência é o mês ao qual o valor pertence.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          {!edit && (
            <Segmented
              ariaLabel="Tipo"
              value={type}
              options={[{ value: "EXPENSE", label: "Despesa" }, { value: "INCOME", label: "Receita" }]}
              onChange={(t) => {
                setType(t);
                set("categoryId", "");
              }}
            />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Descrição" htmlFor="tx-desc" className="sm:col-span-2">
              <Input id="tx-desc" value={v.description} onChange={(e) => set("description", e.target.value)} required autoFocus maxLength={200} />
            </Field>
            <Field label={v.mode === "installments" ? "Valor total" : "Valor"} htmlFor="tx-amount" hint={v.mode === "installments" && v.amountCents ? `${v.times}x de aprox. ${formatBRL(Math.floor(v.amountCents / v.times))}` : undefined}>
              <MoneyInput id="tx-amount" value={v.amountCents} onChange={(c) => set("amountCents", c)} required />
            </Field>
            <Field label="Categoria" htmlFor="tx-cat">
              <Select id="tx-cat" value={v.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                <option value="">Sem categoria</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Competência" htmlFor="tx-comp">
              <Input id="tx-comp" type="date" value={v.competenceDate} onChange={(e) => set("competenceDate", e.target.value)} required />
            </Field>
            <Field label="Vencimento" htmlFor="tx-due" hint="Opcional. Usado em contas a pagar/receber.">
              <Input id="tx-due" type="date" value={v.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
            </Field>
            <Field label="Conta" htmlFor="tx-acc">
              <Select id="tx-acc" value={v.accountId} onChange={(e) => set("accountId", e.target.value)}>
                <option value="">Definir ao pagar</option>
                {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
            {v.mode !== "installments" && (
              <Field label="Natureza" htmlFor="tx-nature">
                <Select id="tx-nature" value={v.nature} onChange={(e) => set("nature", e.target.value as typeof v.nature)} disabled={edit?.nature === "INSTALLMENT"}>
                  {(["ONE_OFF", "FIXED", "VARIABLE", "RECURRING"] as const).map((n) => <option key={n} value={n}>{NATURE_LABEL[n]}</option>)}
                  {edit?.nature === "INSTALLMENT" && <option value="INSTALLMENT">Parcelada</option>}
                </Select>
              </Field>
            )}
          </div>

          {!edit && (
            <div className="grid gap-3 rounded-lg border border-border p-3">
              <Segmented
                ariaLabel="Repetição"
                size="sm"
                value={v.mode}
                options={[{ value: "single", label: "Uma vez" }, { value: "repeat", label: "Repetir todo mês" }, { value: "installments", label: "Parcelar" }]}
                onChange={(m) => setV((p) => ({ ...p, mode: m, times: m === "installments" ? 3 : 12 }))}
              />
              {v.mode !== "single" && (
                <label className="flex items-center gap-2 text-sm">
                  {v.mode === "repeat" ? "Por" : "Em"}
                  <Input type="number" min={2} max={60} value={v.times} onChange={(e) => set("times", Math.min(60, Math.max(2, Number(e.target.value) || 2)))} className="w-20" aria-label={v.mode === "repeat" ? "Meses" : "Parcelas"} />
                  {v.mode === "repeat" ? "meses (cria um lançamento previsto por mês)" : "parcelas mensais"}
                </label>
              )}
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={v.paid} onChange={(e) => set("paid", e.target.checked)} />
                {type === "INCOME" ? "Já recebido" : "Já pago"}
                {v.mode !== "single" && <span className="text-xs text-muted-foreground">(só o primeiro)</span>}
              </label>
              {v.paid && (
                <Field label="Data do pagamento" htmlFor="tx-paidat">
                  <Input id="tx-paidat" type="date" value={v.paidAt} onChange={(e) => set("paidAt", e.target.value)} className="w-44" />
                </Field>
              )}
            </div>
          )}

          <Field label="Observações" htmlFor="tx-notes">
            <Textarea id="tx-notes" value={v.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </Field>

          {edit && isSeries && (
            <fieldset className="grid gap-1.5 rounded-lg border border-border p-3 text-sm">
              <legend className="px-1 text-xs text-muted-foreground">Este lançamento faz parte de uma série ({edit.seriesIndex}/{edit.seriesTotal})</legend>
              <label className="flex items-center gap-2"><input type="radio" name="scope" checked={scope === "one"} onChange={() => setScope("one")} /> Alterar só este</label>
              <label className="flex items-center gap-2"><input type="radio" name="scope" checked={scope === "following"} onChange={() => setScope("following")} /> Este e os próximos ainda não pagos</label>
            </fieldset>
          )}
          <Footer saving={saving} label={edit ? "Salvar" : "Lançar"} onCancel={onClose} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════
// Marcar como pago / recebido
// ═══════════════════════════════════════════════════════════════

export function PayDialog({ base, row, onClose }: { base: FinanceBase; row: TransactionRow; onClose: () => void }) {
  const accounts = base.accounts.filter((a) => !a.archived);
  const [accountId, setAccountId] = React.useState(row.accountId ?? accounts[0]?.id ?? "");
  const [paidAt, setPaidAt] = React.useState(base.today);
  const [saving, setSaving] = React.useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{row.type === "INCOME" ? "Confirmar recebimento" : "Confirmar pagamento"}</DialogTitle>
          <DialogDescription>{row.label} · {formatBRL(row.amountCents)}</DialogDescription>
        </DialogHeader>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Cadastre uma conta na aba Contas para registrar pagamentos.</p>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              const r = await setTransactionPaidAction(row.id, { paid: true, accountId, paidAt });
              setSaving(false);
              done(r, onClose);
            }}
          >
            <Field label="Conta" htmlFor="pay-acc">
              <Select id="pay-acc" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
            <Field label="Data" htmlFor="pay-date">
              <Input id="pay-date" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} required />
            </Field>
            <Footer saving={saving} label="Confirmar" onCancel={onClose} />
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════
// Conta
// ═══════════════════════════════════════════════════════════════

export function AccountDialog({ base, edit, onClose }: { base: FinanceBase; edit?: FinanceBase["accounts"][number]; onClose: () => void }) {
  const [v, setV] = React.useState({
    name: edit?.name ?? "",
    type: edit?.type ?? "CHECKING",
    institution: edit?.institution ?? "",
    initialBalanceCents: edit?.initialBalanceCents ?? 0,
    initialBalanceDate: dateYmd(edit?.initialBalanceDate),
  });
  const [saving, setSaving] = React.useState(false);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{edit ? "Editar conta" : "Nova conta"}</DialogTitle>
          <DialogDescription>O saldo é calculado a partir do saldo inicial e das movimentações registradas.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            const input = { ...v, institution: v.institution || null, initialBalanceDate: v.initialBalanceDate || null };
            const r = edit ? await updateAccountAction(edit.id, input) : await createAccountAction({ ...input, workspaceId: base.workspace.id });
            setSaving(false);
            done(r, onClose);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" htmlFor="acc-name"><Input id="acc-name" value={v.name} onChange={(e) => set("name", e.target.value)} required autoFocus maxLength={80} placeholder="Ex.: Nubank" /></Field>
            <Field label="Tipo" htmlFor="acc-type">
              <Select id="acc-type" value={v.type} onChange={(e) => set("type", e.target.value as typeof v.type)}>
                {Object.entries(ACCOUNT_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Instituição" htmlFor="acc-inst"><Input id="acc-inst" value={v.institution} onChange={(e) => set("institution", e.target.value)} maxLength={80} /></Field>
            <Field label="Saldo inicial" htmlFor="acc-initial" hint="Pode ser negativo (cheque especial).">
              <MoneyInput id="acc-initial" value={v.initialBalanceCents} onChange={(c) => set("initialBalanceCents", c ?? 0)} allowNegative />
            </Field>
            <Field label="Data do saldo inicial" htmlFor="acc-date" hint="Opcional. Movimentos anteriores a ela não devem ser lançados.">
              <Input id="acc-date" type="date" value={v.initialBalanceDate} onChange={(e) => set("initialBalanceDate", e.target.value)} />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">Poupança e investimentos contam como reserva financeira. Nunca guardamos senhas bancárias.</p>
          <Footer saving={saving} label="Salvar" onCancel={onClose} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════
// Transferência
// ═══════════════════════════════════════════════════════════════

export function TransferDialog({ base, targets, onClose, defaultFrom }: { base: FinanceBase; targets: TransferTarget[]; onClose: () => void; defaultFrom?: string }) {
  const own = base.accounts.filter((a) => !a.archived);
  const [v, setV] = React.useState({
    fromAccountId: defaultFrom ?? own[0]?.id ?? "",
    toAccountId: "",
    amountCents: null as number | null,
    date: base.today,
    description: "",
  });
  const [saving, setSaving] = React.useState(false);
  const from = targets.find((t) => t.id === v.fromAccountId);
  const to = targets.find((t) => t.id === v.toAccountId);
  const isDistribution = from?.workspace.kind === "MENTORIA" && to?.workspace.kind === "PESSOAL";
  const crossWs = from && to && from.workspaceId !== to.workspaceId;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Transferência</DialogTitle>
          <DialogDescription>Transferências não são receita nem despesa: só movem dinheiro entre contas.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!v.amountCents) return toast.error("Informe o valor.");
            setSaving(true);
            const r = await createTransferAction({ ...v, amountCents: v.amountCents, description: v.description || null });
            setSaving(false);
            done(r, onClose);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="De" htmlFor="tr-from">
              <Select id="tr-from" value={v.fromAccountId} onChange={(e) => setV({ ...v, fromAccountId: e.target.value })}>
                {own.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
            <Field label="Para" htmlFor="tr-to">
              <Select id="tr-to" value={v.toAccountId} onChange={(e) => setV({ ...v, toAccountId: e.target.value })} required>
                <option value="">Escolha…</option>
                {targets.filter((t) => t.id !== v.fromAccountId).map((t) => (
                  <option key={t.id} value={t.id}>{t.workspaceId === base.workspace.id ? t.name : `${t.name} (${t.workspace.name})`}</option>
                ))}
              </Select>
            </Field>
            <Field label="Valor" htmlFor="tr-amount"><MoneyInput id="tr-amount" value={v.amountCents} onChange={(c) => setV({ ...v, amountCents: c })} required /></Field>
            <Field label="Data" htmlFor="tr-date"><Input id="tr-date" type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} required /></Field>
            <Field label="Descrição" htmlFor="tr-desc" className="sm:col-span-2"><Input id="tr-desc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} maxLength={200} /></Field>
          </div>
          {isDistribution && (
            <p className="rounded-md bg-info-soft px-3 py-2 text-sm text-info">
              Retirada da Mentoria: entra como receita no financeiro pessoal (“Retiradas da Mentoria”) e sai do caixa da Mentoria, sem ser contada como despesa nem como faturamento.
            </p>
          )}
          {crossWs && !isDistribution && <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">Transferência entre ambientes: fica registrada nos dois, sem virar receita ou despesa.</p>}
          <Footer saving={saving} label="Transferir" onCancel={onClose} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
