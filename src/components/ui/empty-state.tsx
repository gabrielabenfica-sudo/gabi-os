import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Estado vazio sem "use client": pode receber o ícone (um componente) direto de
 * um Server Component. Componentes de cliente podem usar este ou o de misc.tsx.
 */
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
