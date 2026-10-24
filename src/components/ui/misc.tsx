"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import Link from "next/link";
import { cn } from "@/lib/utils";

// ─── Cabeçalho de página ───────────────────────────────────────

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

// ─── Estado vazio ──────────────────────────────────────────────

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center", className)}>
      {Icon && (
        <span className="mb-1 grid size-10 place-items-center rounded-full bg-secondary">
          <Icon className="size-5 text-muted-foreground" />
        </span>
      )}
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ─── Abas (segmentado) ─────────────────────────────────────────

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  size = "default",
}: {
  value: T;
  options: { value: T; label: string; icon?: React.ComponentType<{ className?: string }> }[];
  onChange: (v: T) => void;
  ariaLabel: string;
  size?: "default" | "sm";
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="inline-flex rounded-lg border border-border bg-muted p-0.5">
      {options.map((o) => {
        const Icon = o.icon;
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md font-medium transition-colors",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
              active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {Icon && <Icon className="size-4" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function LinkTabs({ tabs, current }: { tabs: { href: string; label: string; key: string }[]; current: string }) {
  return (
    <nav className="inline-flex rounded-lg border border-border bg-muted p-0.5" aria-label="Visualizações">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            t.key === current ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

// ─── Popover ───────────────────────────────────────────────────

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export function PopoverContent({ className, align = "start", sideOffset = 6, ...props }: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn("z-50 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg outline-none", className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

// ─── Checkbox ──────────────────────────────────────────────────

export const Checkbox = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={cn("size-4 shrink-0 cursor-pointer rounded border-input accent-[var(--primary)]", className)}
      {...props}
    />
  ),
);
Checkbox.displayName = "Checkbox";

// ─── Ponto de cor do ambiente ──────────────────────────────────

export function WsDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block size-2.5 shrink-0 rounded-full", className)} style={{ background: color }} aria-hidden />;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{children}</kbd>;
}
