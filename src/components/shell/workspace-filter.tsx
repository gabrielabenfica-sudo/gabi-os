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
import { setWorkspaceFilterAction } from "@/app/(app)/shell-actions";

export type ShellWorkspace = { id: string; name: string; color: string; kind: string };

export function WorkspaceFilter({ workspaces, value }: { workspaces: ShellWorkspace[]; value: string }) {
  const [pending, startTransition] = React.useTransition();
  const current = workspaces.find((w) => w.id === value);

  const select = (id: string) =>
    startTransition(async () => {
      try {
        await setWorkspaceFilterAction(id);
      } catch {
        toast.error("Não foi possível trocar o ambiente.");
      }
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-9 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm hover:bg-accent disabled:opacity-60"
        disabled={pending}
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
        <DropdownMenuItem onSelect={() => select("all")}>
          <Layers /> <span className="flex-1">Todos</span> {value === "all" && <Check />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {workspaces.map((w) => (
          <DropdownMenuItem key={w.id} onSelect={() => select(w.id)}>
            <span className="size-2.5 rounded-full" style={{ background: w.color }} aria-hidden />
            <span className="flex-1">{w.name}</span>
            {value === w.id && <Check />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
