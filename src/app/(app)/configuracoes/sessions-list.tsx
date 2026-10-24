"use client";

import * as React from "react";
import { Monitor } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { revokeOtherSessionsAction, revokeSessionAction } from "./actions";

type SessionRow = { id: string; userAgent: string | null; ip: string | null; lastSeen: string; created: string };

function describeAgent(ua: string | null): string {
  if (!ua) return "Dispositivo desconhecido";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} · ${os}` : browser;
}

export function SessionsList({ sessions, currentId }: { sessions: SessionRow[]; currentId: string }) {
  const [pending, startTransition] = React.useTransition();

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message ?? "Feito.");
      else toast.error(r.error ?? "Erro.");
    });

  return (
    <div className="grid gap-3">
      <ul className="grid gap-2">
        {sessions.map((s) => (
          <li key={s.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
            <Monitor className="size-4 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-medium">
                {describeAgent(s.userAgent)}
                {s.id === currentId && <Badge variant="success">Esta sessão</Badge>}
              </p>
              <p className="text-xs text-muted-foreground">
                Último acesso {s.lastSeen}
                {s.ip ? ` · IP ${s.ip}` : ""}
              </p>
            </div>
            {s.id !== currentId && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => revokeSessionAction(s.id))}>
                Encerrar
              </Button>
            )}
          </li>
        ))}
      </ul>
      {sessions.length > 1 && (
        <div>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => run(revokeOtherSessionsAction)}>
            Encerrar todas as outras
          </Button>
        </div>
      )}
    </div>
  );
}
