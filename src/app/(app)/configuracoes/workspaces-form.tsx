"use client";

import * as React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-controls";
import { reorderWorkspacesAction, updateWorkspaceAction } from "./actions";

type Ws = { id: string; name: string; color: string; kind: string };

export function WorkspacesForm({ workspaces }: { workspaces: Ws[] }) {
  const [items, setItems] = React.useState(workspaces);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => setItems(workspaces), [workspaces]);

  const move = (index: number, delta: number) => {
    const next = [...items];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setItems(next);
    startTransition(async () => {
      const r = await reorderWorkspacesAction(next.map((w) => w.id));
      if (!r.ok) {
        toast.error(r.error);
        setItems(items);
      }
    });
  };

  return (
    <ul className="grid gap-3">
      {items.map((w, i) => (
        <WorkspaceRow
          key={w.id}
          workspace={w}
          disabled={pending}
          canUp={i > 0}
          canDown={i < items.length - 1}
          onUp={() => move(i, -1)}
          onDown={() => move(i, 1)}
        />
      ))}
    </ul>
  );
}

function WorkspaceRow({
  workspace,
  disabled,
  canUp,
  canDown,
  onUp,
  onDown,
}: {
  workspace: Ws;
  disabled: boolean;
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
}) {
  const [name, setName] = React.useState(workspace.name);
  const [color, setColor] = React.useState(workspace.color);
  const [saving, startTransition] = React.useTransition();
  const dirty = name !== workspace.name || color.toLowerCase() !== workspace.color.toLowerCase();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const r = await updateWorkspaceAction(workspace.id, { name, color });
      if (r.ok) toast.success(r.message ?? "Salvo.");
      else toast.error(r.error);
    });
  };

  return (
    <li>
      <form onSubmit={save} className="flex items-center gap-2">
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="size-9 shrink-0 cursor-pointer rounded-md border border-input bg-card p-1"
          aria-label={`Cor do ambiente ${workspace.name}`}
        />
        <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Nome do ambiente" maxLength={60} />
        <Button type="submit" size="sm" variant={dirty ? "default" : "outline"} disabled={!dirty || saving}>
          Salvar
        </Button>
        <Button type="button" size="icon" variant="ghost" onClick={onUp} disabled={!canUp || disabled} aria-label="Mover para cima">
          <ArrowUp />
        </Button>
        <Button type="button" size="icon" variant="ghost" onClick={onDown} disabled={!canDown || disabled} aria-label="Mover para baixo">
          <ArrowDown />
        </Button>
      </form>
    </li>
  );
}
