"use client";

import Link from "next/link";
import { BadgeDollarSign, CalendarPlus, FilePlus2, ListPlus, MinusCircle, Plus, PlusCircle, Repeat } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Criação rápida. Só lista o que já existe no app. */
export const QUICK_CREATE = [
  { href: "/tarefas?nova=1", label: "Nova tarefa", icon: ListPlus },
  { href: "/agenda?novo=1", label: "Novo compromisso", icon: CalendarPlus },
  { href: "/anotacoes?nova=1", label: "Nova anotação", icon: FilePlus2 },
  { href: "/habitos?novo=1", label: "Novo hábito", icon: Repeat },
  { href: "/financas/pessoal?aba=lancamentos&novo=despesa", label: "Nova despesa", icon: MinusCircle },
  { href: "/financas/pessoal?aba=lancamentos&novo=receita", label: "Nova receita", icon: PlusCircle },
  { href: "/financas/mentoria?aba=vendas&novo=venda", label: "Nova venda", icon: BadgeDollarSign },
];

export function QuickCreateMenu({ compact = false }: { compact?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(buttonVariants({ size: compact ? "icon" : "sm" }))} aria-label="Criar">
        <Plus /> {!compact && "Criar"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Criação rápida</DropdownMenuLabel>
        {QUICK_CREATE.map((q) => (
          <DropdownMenuItem key={q.href} asChild>
            <Link href={q.href}>
              <q.icon /> {q.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
