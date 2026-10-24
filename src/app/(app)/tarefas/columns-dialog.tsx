"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/form-controls";
import { WsDot } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm";
import { STATUS_CATEGORY_LABEL, type StatusOption, type WsOption } from "./types";
import { createStatusAction, deleteStatusAction, reorderStatusesAction, updateStatusAction } from "./actions";

/** Personalização das colunas do Kanban de um ambiente. */
export function ColumnsDialog({ workspace, statuses, onClose }: { workspace: WsOption; statuses: StatusOption[]; onClose: () => void }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [items, setItems] = React.useState(statuses);
  const [newName, setNewName] = React.useState("");
  const [newCat, setNewCat] = React.useState("TODO");
  React.useEffect(() => setItems(statuses), [statuses]);

  const done = async (r: { ok: boolean; error?: string; message?: string }) => {
    if (!r.ok) toast.error(r.error ?? "Erro.");
    else if (r.message) toast.success(r.message);
    router.refresh();
    return r.ok;
  };

  const move = async (i: number, d: number) => {
    const next = [...items];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    setItems(next);
    await done(await reorderStatusesAction(workspace.id, next.map((s) => s.id)));
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Colunas do quadro</DialogTitle>
          <DialogDescription className="inline-flex items-center gap-1.5">
            <WsDot color={workspace.color} /> {workspace.name}. O tipo define como a coluna conta nos indicadores.
          </DialogDescription>
        </DialogHeader>
        <ul className="grid gap-2">
          {items.map((s, i) => (
            <ColumnRow
              key={s.id}
              status={s}
              others={items.filter((x) => x.id !== s.id)}
              canUp={i > 0}
              canDown={i < items.length - 1}
              onUp={() => move(i, -1)}
              onDown={() => move(i, 1)}
              onSave={async (patch) => done(await updateStatusAction(s.id, patch))}
              onDelete={async (moveTo) => {
                const ok = await confirm({
                  title: `Excluir a coluna “${s.name}”?`,
                  description: `As tarefas dela irão para “${items.find((x) => x.id === moveTo)?.name}”.`,
                  confirmLabel: "Excluir coluna",
                  danger: true,
                });
                if (ok) await done(await deleteStatusAction(s.id, moveTo));
              }}
            />
          ))}
        </ul>
        <form
          className="flex gap-2 border-t border-border pt-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await done(await createStatusAction(workspace.id, { name: newName, category: newCat }))) setNewName("");
          }}
        >
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nova coluna" aria-label="Nome da nova coluna" />
          <Select value={newCat} onChange={(e) => setNewCat(e.target.value)} className="w-44" aria-label="Tipo da nova coluna">
            {Object.entries(STATUS_CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Button type="submit" disabled={!newName.trim()}>Adicionar</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ColumnRow({
  status, others, canUp, canDown, onUp, onDown, onSave, onDelete,
}: {
  status: StatusOption;
  others: StatusOption[];
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
  onSave: (patch: { name?: string; category?: string }) => Promise<boolean>;
  onDelete: (moveTo: string) => void;
}) {
  const [name, setName] = React.useState(status.name);
  const [deleting, setDeleting] = React.useState(false);
  const [moveTo, setMoveTo] = React.useState(others[0]?.id ?? "");
  return (
    <li className="grid gap-2 rounded-lg border border-border p-2">
      <div className="flex items-center gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== status.name && onSave({ name })} aria-label="Nome da coluna" className="h-8" />
        <Select value={status.category} onChange={(e) => onSave({ category: e.target.value })} className="h-8 w-40" aria-label="Tipo da coluna">
          {Object.entries(STATUS_CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Button type="button" size="icon" variant="ghost" disabled={!canUp} onClick={onUp} aria-label="Mover para cima"><ArrowUp /></Button>
        <Button type="button" size="icon" variant="ghost" disabled={!canDown} onClick={onDown} aria-label="Mover para baixo"><ArrowDown /></Button>
        <Button type="button" size="icon" variant="ghost" onClick={() => setDeleting((d) => !d)} aria-label="Excluir coluna" className="text-danger hover:text-danger"><Trash2 /></Button>
      </div>
      {deleting && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Mover tarefas para</span>
          <Select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="h-8 w-48" aria-label="Coluna de destino">
            {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
          <Button type="button" size="sm" variant="danger" onClick={() => onDelete(moveTo)} disabled={!moveTo}>Excluir</Button>
        </div>
      )}
    </li>
  );
}
