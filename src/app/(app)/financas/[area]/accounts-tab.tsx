"use client";

import * as React from "react";
import { Archive, ArchiveRestore, ArrowLeftRight, Landmark, MoreHorizontal, Pencil, PiggyBank, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm";
import { Money } from "@/components/finance/money-input";
import { archiveAccountAction, deleteAccountAction, deleteTransferAction } from "../actions";
import { AccountDialog, TransferDialog } from "./dialogs";
import { ACCOUNT_TYPE_LABEL, dateYmd, ymdBR, type FinanceBase, type TransferTarget } from "./types";

type TransferRow = {
  id: string;
  kind: string;
  amountCents: number;
  date: Date | string;
  description: string | null;
  fromWorkspaceId: string;
  toWorkspaceId: string;
  fromAccount: { name: string } | null;
  toAccount: { name: string } | null;
  fromWorkspace: { name: string };
  toWorkspace: { name: string };
  cardInvoice: { card: { name: string } } | null;
};

const KIND_LABEL: Record<string, string> = { INTERNAL: "Transferência", DISTRIBUTION: "Retirada da Mentoria", CARD_PAYMENT: "Pagamento de fatura", INVESTMENT: "Aplicação/resgate" };

export function AccountsTab({ transfers, targets, ...base }: FinanceBase & { transfers: TransferRow[]; targets: TransferTarget[] }) {
  const confirm = useConfirm();
  const [dialog, setDialog] = React.useState<{ kind: "account"; edit?: FinanceBase["accounts"][number] } | { kind: "transfer"; from?: string } | null>(null);
  const active = base.accounts.filter((a) => !a.archived);
  const archived = base.accounts.filter((a) => a.archived);
  const total = active.reduce((s, a) => s + a.balanceCents, 0);
  const reserves = active.filter((a) => a.isReserve).reduce((s, a) => s + a.balanceCents, 0);

  const act = async (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    const r = await fn();
    if (!r.ok) toast.error(r.error);
    else if (r.message) toast.success(r.message);
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <p className="text-xs text-muted-foreground">Saldo total</p>
          <Money cents={total} tone="auto" className="text-2xl font-semibold" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Reservas (poupança e investimentos)</p>
          <Money cents={reserves} className="text-lg font-semibold" />
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => setDialog({ kind: "transfer" })} disabled={!active.length}><ArrowLeftRight /> Transferir</Button>
          <Button onClick={() => setDialog({ kind: "account" })}><Plus /> Nova conta</Button>
        </div>
      </div>

      {active.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="Nenhuma conta cadastrada"
          description="Cadastre suas contas (corrente, poupança, investimentos, dinheiro) com o saldo atual. Os saldos passam a ser calculados pelas movimentações."
          action={<Button onClick={() => setDialog({ kind: "account" })}><Plus /> Cadastrar conta</Button>}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="accounts">
          {active.map((a) => (
            <li key={a.id} className="grid gap-2 rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-secondary">{a.isReserve ? <PiggyBank className="size-4" /> : <Landmark className="size-4" />}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{a.name}</p>
                  <p className="text-xs text-muted-foreground">{ACCOUNT_TYPE_LABEL[a.type]}{a.institution ? ` · ${a.institution}` : ""}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger className="grid size-8 place-items-center rounded-md hover:bg-accent" aria-label={`Ações de ${a.name}`}><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setDialog({ kind: "account", edit: a })}><Pencil /> Editar</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setDialog({ kind: "transfer", from: a.id })}><ArrowLeftRight /> Transferir daqui</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => act(() => archiveAccountAction(a.id, true))}><Archive /> Arquivar</DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-danger"
                      onSelect={async () => {
                        if (await confirm({ title: `Excluir a conta “${a.name}”?`, description: "Só é possível excluir contas sem movimentações.", confirmLabel: "Excluir", danger: true })) await act(() => deleteAccountAction(a.id));
                      }}
                    >
                      <Trash2 /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Money cents={a.balanceCents} tone="auto" className="text-xl font-semibold" />
              {a.isReserve && <Badge variant="info" className="w-fit">Reserva</Badge>}
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Arquivadas</h2>
          <ul className="grid gap-2">
            {archived.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-lg border border-dashed border-border px-4 py-2 text-sm">
                <span className="flex-1">{a.name}</span>
                <Money cents={a.balanceCents} tone="muted" />
                <Button size="sm" variant="ghost" onClick={() => act(() => archiveAccountAction(a.id, false))}><ArchiveRestore /> Reativar</Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-2">
        <h2 className="text-sm font-semibold">Transferências do mês</h2>
        {transfers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma transferência neste mês.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {transfers.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t.kind === "CARD_PAYMENT" ? `Pagamento da fatura ${t.cardInvoice?.card.name ?? ""}` : t.description || KIND_LABEL[t.kind]}</p>
                  <p className="text-xs text-muted-foreground">
                    {ymdBR(dateYmd(t.date))} · {t.fromAccount?.name ?? "—"}{t.fromWorkspaceId !== base.workspace.id ? ` (${t.fromWorkspace.name})` : ""} → {t.kind === "CARD_PAYMENT" ? "cartão" : `${t.toAccount?.name ?? "—"}${t.toWorkspaceId !== base.workspace.id ? ` (${t.toWorkspace.name})` : ""}`}
                  </p>
                </div>
                <Badge variant="outline">{KIND_LABEL[t.kind]}</Badge>
                <Money cents={t.amountCents} />
                <Button size="icon" variant="ghost" aria-label="Excluir transferência" onClick={async () => { if (await confirm({ title: "Excluir transferência?", confirmLabel: "Excluir", danger: true })) await act(() => deleteTransferAction(t.id)); }}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {dialog?.kind === "account" && <AccountDialog base={base} edit={dialog.edit} onClose={() => setDialog(null)} />}
      {dialog?.kind === "transfer" && <TransferDialog base={base} targets={targets} defaultFrom={dialog.from} onClose={() => setDialog(null)} />}
    </div>
  );
}
