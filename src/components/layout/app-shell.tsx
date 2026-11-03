import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Menu, LogOut, ChevronDown, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { initials } from "@/lib/format";
import { FOOTER_ITEMS, NAV_GROUPS, type NavItem } from "./nav";
import { runSeed } from "@/lib/queries";

function Brand() {
  return (
    <div className="flex items-center gap-3 px-2">
      <span className="flex size-10 items-center justify-center rounded-2xl bg-primary/12 font-display text-lg text-primary ring-1 ring-primary/20">
        G
      </span>
      <div className="leading-tight">
        <p className="font-display text-base tracking-tight text-foreground">Gabi OS</p>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          sistema da vida
        </p>
      </div>
    </div>
  );
}

function WorkspaceSwitcher({ compact }: { compact?: boolean }) {
  const { workspaces, active, setActiveId } = useWorkspace();
  if (!workspaces.length) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-xl border border-border/80 bg-card px-3 py-2 text-left text-sm shadow-sm transition hover:border-primary/40",
            compact && "py-1.5",
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: active?.color ?? "hsl(var(--taupe))" }}
            />
            <span className="truncate font-medium">{active?.name ?? "Selecionar"}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Áreas
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map((workspace) => (
          <DropdownMenuItem
            key={workspace.id}
            onSelect={() => setActiveId(workspace.id)}
            className="gap-2"
          >
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: workspace.color ?? "hsl(var(--taupe))" }}
            />
            <span className="flex-1 truncate">{workspace.name}</span>
            {workspace.id === active?.id ? <span className="text-xs text-primary">atual</span> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavLinkItem({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition",
          isActive
            ? "bg-accent text-accent-foreground shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.16)]"
            : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
        )
      }
    >
      <Icon className="size-[18px]" strokeWidth={1.7} />
      <span className="truncate">{item.label}</span>
    </NavLink>
  );
}

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-3 pb-6">
      <div className="pt-5">
        <Brand />
      </div>
      <WorkspaceSwitcher />
      <nav className="flex flex-1 flex-col gap-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="space-y-1">
            <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/80">
              {group.title}
            </p>
            {group.items.map((item) => (
              <NavLinkItem key={item.to} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>
      <div className="space-y-1 border-t border-border/70 pt-3">
        {FOOTER_ITEMS.map((item) => (
          <NavLinkItem key={item.to} item={item} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}

function UserMenu() {
  const { user, signOut } = useAuth();
  const { active } = useWorkspace();
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition hover:bg-secondary/70">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
            {initials(user?.email?.split("@")[0])}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-foreground">
              {user?.email}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {active?.name ?? "Gabi OS"}
            </span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => navigate("/ajustes")}>Ajustes</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate("/conexoes")}>Conexões</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()} className="text-destructive">
          <LogOut className="mr-2 size-4" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    setOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;
    runSeed().then((result) => {
      if (!cancelled && result?.seeded) {
        ["workspaces", "tasks", "events", "goals", "habits", "routine-blocks"].forEach((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-[264px] shrink-0 border-r border-border/70 bg-sidebar lg:flex lg:flex-col">
        <NavContent />
        <div className="mt-auto border-t border-border/70 p-3">
          <UserMenu />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/70 bg-background/85 px-4 py-3 backdrop-blur lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Abrir menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[282px] p-0">
              <NavContent onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="min-w-0 flex-1">
            <WorkspaceSwitcher compact />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}

export function AppLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-warm">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="text-sm">Abrindo o Gabi OS…</p>
      </div>
    </div>
  );
}
