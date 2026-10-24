"use client";

import * as React from "react";
import { Check, ChevronDown, Layers } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ShellWorkspace = { id: string; name: string; color: string; kind: string };

export function WorkspaceFilter({ workspaces, value }: { workspaces: ShellWorkspace[]; value: string }) {
  const [selected, setSelected] = React.useState(value);
  const [pending, setPending] = React.useState(false);
  const current = workspaces.find((w) => w.id === selected);

  // Trocar de ambiente muda o contexto de todas as telas: salva e recarrega a página inteira.
  const select = async (id: string) => {
    if (id === selected) return;
    const previous = selected;
    setSelected(id);
    setPending(true);
    try {
      const res = await fetch("/api/preferences/workspace-filter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: id }),
      });
      if (!res.ok) throw new Error(String(res.status));
      window.location.reload();
    } catch {
      setSelected(previous);
      setPending(false);
      toast.error("Não foi possível trocar o ambiente.");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-9 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm hover:bg-accent disabled:opacity-60"
        aria-busy={pending}
        aria-label="Filtrar por ambiente"
      >
        {current ? (
          <span className="size-2.5 rounded-full" style={{ background: current.color }} aria-hidden />
        ) : (
          <Layers className="size-4 text-muted-foreground" />
        )}
        <span className="max-w-40 truncate">{current?.name ?? "Todos os ambientes"}</span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Ambiente</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void select("all")}>
          <Layers /> <span className="flex-1">Todos</span> {selected === "all" && <Check />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {workspaces.map((w) => (
          <DropdownMenuItem key={w.id} onSelect={() => void select(w.id)}>
            <span className="size-2.5 rounded-full" style={{ background: w.color }} aria-hidden />
            <span className="flex-1">{w.name}</span>
            {selected === w.id && <Check />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
