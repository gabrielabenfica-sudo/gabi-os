"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CalendarDays, FileText, FolderKanban, ListChecks, Repeat, Search } from "lucide-react";
import { NAV_SECTIONS } from "./nav";
import { QUICK_CREATE } from "./quick-create";

type Result = { type: "task" | "event" | "note" | "habit" | "project"; id: string; title: string; subtitle?: string; href: string };

const TYPE_META: Record<Result["type"], { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  task: { label: "Tarefas", icon: ListChecks },
  event: { label: "Compromissos", icon: CalendarDays },
  note: { label: "Anotações", icon: FileText },
  habit: { label: "Hábitos", icon: Repeat },
  project: { label: "Projetos", icon: FolderKanban },
};

const groupClass =
  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted-foreground";
const itemClass = "flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm data-[selected=true]:bg-accent";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<Result[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return setResults([]);
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (res.ok) setResults((await res.json()).results);
      } catch {
        /* busca cancelada */
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const grouped = (Object.keys(TYPE_META) as Result["type"][])
    .map((type) => ({ type, items: results.filter((r) => r.type === type) }))
    .filter((g) => g.items.length);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#373039]/40 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">Buscar e navegar</DialogPrimitive.Title>
          {/* A filtragem das páginas é local; os resultados do servidor já vêm filtrados */}
          <Command label="Buscar e navegar" className="text-popover-foreground" shouldFilter={false}>
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="size-4 text-muted-foreground" />
              <Command.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder="Buscar tarefas, compromissos, anotações ou páginas…"
                className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {loading && <span className="text-xs text-muted-foreground">Buscando…</span>}
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              {query.trim().length >= 2 && !loading && results.length === 0 && (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">Nenhum resultado para “{query}”.</p>
              )}
              {grouped.map((g) => {
                const Icon = TYPE_META[g.type].icon;
                return (
                  <Command.Group key={g.type} heading={TYPE_META[g.type].label} className={groupClass}>
                    {g.items.map((r) => (
                      <Command.Item key={`${r.type}:${r.id}`} value={`${r.type}:${r.id}`} onSelect={() => go(r.href)} className={itemClass}>
                        <Icon className="size-4 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{r.title}</span>
                        {r.subtitle && <span className="shrink-0 text-xs text-muted-foreground">{r.subtitle}</span>}
                      </Command.Item>
                    ))}
                  </Command.Group>
                );
              })}
              {NAV_SECTIONS.map((section, i) => {
                const q = query.trim().toLowerCase();
                const items = section.items.filter((item) => !q || [item.label, ...(item.keywords ?? [])].some((k) => k.toLowerCase().includes(q)));
                if (!items.length) return null;
                return (
                  <Command.Group key={i} heading={section.title ?? "Navegação"} className={groupClass}>
                    {items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Command.Item key={item.href} value={`nav:${item.href}`} onSelect={() => go(item.href)} className={itemClass}>
                          <Icon className="size-4 text-muted-foreground" />
                          <span className="flex-1">{item.label}</span>
                          {item.shortcut && <kbd className="text-[10px] tracking-widest text-muted-foreground">{item.shortcut}</kbd>}
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                );
              })}
              {(() => {
                const q = query.trim().toLowerCase();
                const items = QUICK_CREATE.filter((c) => !q || c.label.toLowerCase().includes(q) || "criar novo nova".includes(q));
                if (!items.length) return null;
                return (
                  <Command.Group heading="Criar" className={groupClass}>
                    {items.map((c) => (
                      <Command.Item key={c.href} value={`create:${c.href}`} onSelect={() => go(c.href)} className={itemClass}>
                        <c.icon className="size-4 text-muted-foreground" />
                        <span>{c.label}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                );
              })()}
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
