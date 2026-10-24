"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronsLeft, ChevronsRight, LogOut, Monitor, Moon, Search, Settings, Sun } from "lucide-react";
import { cn, firstName } from "@/lib/utils";
import { NAV_SECTIONS, ALL_NAV_ITEMS, isActive } from "./nav";
import { CommandPalette } from "./command-palette";
import { WorkspaceFilter, type ShellWorkspace } from "./workspace-filter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/app/(auth)/actions";
import { setThemeAction } from "@/app/(app)/shell-actions";

type ShellUser = { name: string; email: string; appName: string; theme: "LIGHT" | "DARK" | "SYSTEM" };

const COLLAPSE_KEY = "gabi.sidebar.collapsed";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean) {
  try {
    window.localStorage.setItem(COLLAPSE_KEY, value ? "1" : "0");
  } catch {
    /* armazenamento indisponível: preferência só vale nesta aba */
  }
}

export function AppShell({
  user,
  workspaces,
  filter,
  children,
}: {
  user: ShellUser;
  workspaces: ShellWorkspace[];
  filter: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  React.useEffect(() => setCollapsed(readCollapsed()), []);

  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((c) => {
      writeCollapsed(!c);
      return !c;
    });
  }, []);

  // Atalhos globais: Ctrl/⌘+K abre a busca; "[" recolhe o menu; "g" + letra navega
  React.useEffect(() => {
    let pendingG = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "[") {
        toggleCollapsed();
        return;
      }
      if (pendingG) {
        pendingG = false;
        const item = ALL_NAV_ITEMS.find((i) => i.shortcut?.toLowerCase() === `g ${e.key.toLowerCase()}`);
        if (item) {
          e.preventDefault();
          router.push(item.href);
        }
        return;
      }
      if (e.key === "g") {
        pendingG = true;
        clearTimeout(timer);
        timer = setTimeout(() => (pendingG = false), 800);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(timer);
    };
  }, [router, toggleCollapsed]);

  const changeTheme = (value: string) => {
    const theme = value as ShellUser["theme"];
    const root = document.documentElement;
    root.dataset.theme = theme;
    const dark = theme === "DARK" || (theme === "SYSTEM" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.classList.toggle("dark", dark);
    void setThemeAction(theme);
  };

  return (
    <div className="flex min-h-dvh">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">
        Pular para o conteúdo
      </a>

      <aside
        className={cn(
          "sticky top-0 flex h-dvh shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200",
          collapsed ? "w-16" : "w-60",
        )}
        aria-label="Menu principal"
      >
        <div className={cn("flex h-14 items-center gap-2.5 px-4", collapsed && "justify-center px-0")}>
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand text-sm font-semibold text-white">
            {user.appName.slice(0, 1).toUpperCase()}
          </span>
          {!collapsed && <span className="truncate font-semibold tracking-tight">{user.appName}</span>}
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {NAV_SECTIONS.map((section, si) => (
            <div key={si} className="mb-4">
              {section.title && !collapsed && (
                <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-sidebar-muted">
                  {section.title}
                </p>
              )}
              <ul className="grid gap-0.5">
                {section.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors",
                          collapsed && "justify-center px-0",
                          active
                            ? "bg-sidebar-active font-medium text-white"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-active/60 hover:text-white",
                        )}
                      >
                        <Icon className={cn("size-[18px] shrink-0", active && "text-brand-soft")} />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 p-2">
          <button
            type="button"
            onClick={toggleCollapsed}
            className={cn(
              "flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm text-sidebar-muted hover:bg-sidebar-active/60 hover:text-white",
              collapsed && "justify-center px-0",
            )}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            title="Recolher/expandir menu ( [ )"
          >
            {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
            {!collapsed && <span>Recolher</span>}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-6 backdrop-blur">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-9 w-full max-w-sm items-center gap-2 rounded-md border border-input bg-card px-3 text-sm text-muted-foreground hover:border-ring/60"
          >
            <Search className="size-4" />
            <span className="flex-1 text-left">Buscar e navegar…</span>
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium">Ctrl K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <WorkspaceFilter workspaces={workspaces} value={filter} />

            <DropdownMenu>
              <DropdownMenuTrigger
                className="flex size-9 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-[#373039] hover:ring-2 hover:ring-ring/40"
                aria-label="Menu da conta"
              >
                {user.name.slice(0, 1).toUpperCase()}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="text-foreground">
                  <span className="block font-medium">{firstName(user.name)}</span>
                  <span className="block truncate text-xs font-normal text-muted-foreground">{user.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Tema</DropdownMenuLabel>
                <DropdownMenuRadioGroup defaultValue={user.theme} onValueChange={changeTheme}>
                  <DropdownMenuRadioItem value="LIGHT">
                    <Sun className="size-4 text-muted-foreground" /> Claro
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="DARK">
                    <Moon className="size-4 text-muted-foreground" /> Escuro
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="SYSTEM">
                    <Monitor className="size-4 text-muted-foreground" /> Sistema
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/configuracoes">
                    <Settings /> Configurações
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void logoutAction()}>
                  <LogOut /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main id="conteudo" className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-6">
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
