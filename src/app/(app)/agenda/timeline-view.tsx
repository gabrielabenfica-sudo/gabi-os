"use client";

import * as React from "react";
import { AlertTriangle, CalendarRange, MapPin, Repeat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState, WsDot } from "@/components/ui/misc";
import { EVENT_STATUS_LABEL } from "@/components/priority";
import { cn } from "@/lib/utils";
import { partsInTz, timeRange, type Occurrence } from "./shared";

const WEEKDAY = new Intl.DateTimeFormat("pt-BR", { weekday: "long" });

/** Linha do tempo: compromissos agrupados por dia, com sobreposições destacadas. */
export function TimelineView({ occurrences, tz, today, onOpen }: { occurrences: Occurrence[]; tz: string; today: string; onOpen: (eventId: string) => void }) {
  const byDay = React.useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    for (const o of occurrences) {
      const day = o.allDay ? new Date(o.start).toISOString().slice(0, 10) : partsInTz(new Date(o.start), tz).ymd;
      map.set(day, [...(map.get(day) ?? []), o]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [occurrences, tz]);

  const overlapping = React.useMemo(() => {
    const busy = occurrences.filter((o) => !o.allDay && o.transparency === "BUSY" && o.status !== "CANCELLED");
    const set = new Set<string>();
    for (let i = 0; i < busy.length; i++) {
      for (let j = i + 1; j < busy.length; j++) {
        const a = busy[i]!;
        const b = busy[j]!;
        if (new Date(a.start) < new Date(b.end) && new Date(a.end) > new Date(b.start)) {
          set.add(a.key);
          set.add(b.key);
        }
      }
    }
    return set;
  }, [occurrences]);

  if (!occurrences.length) {
    return <EmptyState icon={CalendarRange} title="Nenhum compromisso" description="Nada agendado para as próximas duas semanas nos ambientes visíveis." />;
  }

  return (
    <ol className="grid gap-6" data-testid="timeline">
      {byDay.map(([day, items]) => (
        <li key={day} className="grid gap-2">
          <h3 className={cn("text-sm font-semibold capitalize", day === today && "text-primary")}>
            {day === today ? "Hoje · " : ""}
            {WEEKDAY.format(new Date(`${day}T12:00:00Z`))}, {day.split("-").reverse().join("/")}
          </h3>
          <ul className="relative grid gap-2 border-l-2 border-border pl-5">
            {items.map((o) => (
              <li key={o.key} className="relative">
                <span className="absolute -left-[27px] top-3 size-3 rounded-full border-2 border-card" style={{ background: o.workspace.color }} aria-hidden />
                <button
                  type="button"
                  onClick={() => onOpen(o.eventId)}
                  className={cn(
                    "grid w-full gap-1 rounded-lg border border-border bg-card px-4 py-3 text-left hover:shadow-sm",
                    o.status === "CANCELLED" && "opacity-60",
                    overlapping.has(o.key) && "border-warning/60",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular text-sm text-muted-foreground">{timeRange(o, tz)}</span>
                    <span className={cn("font-medium", o.status === "CANCELLED" && "line-through")}>{o.title}</span>
                    {o.isRecurring && <Repeat className="size-3.5 text-muted-foreground" aria-label="Recorrente" />}
                    {overlapping.has(o.key) && (
                      <Badge variant="warning">
                        <AlertTriangle className="size-3" /> Sobreposição
                      </Badge>
                    )}
                    {o.status !== "NOT_STARTED" && <Badge variant={o.status === "DONE" ? "success" : "outline"}>{EVENT_STATUS_LABEL[o.status]}</Badge>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><WsDot color={o.workspace.color} className="size-2" /> {o.workspace.name}</span>
                    {o.location && <span className="inline-flex items-center gap-1"><MapPin className="size-3" /> {o.location}</span>}
                    {o.transparency === "FREE" && <span>Livre</span>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
