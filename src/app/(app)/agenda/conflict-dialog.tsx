"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WsDot } from "@/components/ui/misc";
import { partsInTz, timeRange, type Conflict } from "./shared";

/** Aviso de sobreposição antes de salvar. */
export function ConflictDialog({
  conflicts,
  tz,
  onChooseAnother,
  onConfirm,
  busy,
}: {
  conflicts: Conflict[];
  tz: string;
  onChooseAnother: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onChooseAnother()}>
      <DialogContent className="max-w-md" hideClose>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-warning" /> Conflito de horário
          </DialogTitle>
          <DialogDescription>
            Este horário se sobrepõe a {conflicts.length === 1 ? "outro compromisso" : `${conflicts.length} compromissos`}:
          </DialogDescription>
        </DialogHeader>
        <ul className="grid max-h-64 gap-2 overflow-y-auto" data-testid="conflicts">
          {conflicts.map((c, i) => (
            <li key={i} className="rounded-lg border border-border px-3 py-2 text-sm">
              <p className="font-medium">{c.title}</p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <WsDot color={c.workspace.color} /> {c.workspace.name} ·{" "}
                {partsInTz(new Date(c.start), tz).ymd.split("-").reverse().join("/")} · {timeRange({ start: c.start, end: c.end, allDay: false }, tz)}
              </p>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onChooseAnother}>Escolher outro horário</Button>
          <Button onClick={onConfirm} disabled={busy}>Salvar mesmo assim</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
