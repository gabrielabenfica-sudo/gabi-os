"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LinkTabs, PageHeader, Segmented } from "@/components/ui/misc";
import type { ProcessView, RoutineDayView, ScheduleView } from "@/server/routines";
import { DayView } from "./day-view";
import { ProcessesView } from "./processes-view";
import { RoutineDialog, type EditableRoutine, type Ws } from "./routine-dialog";

export function RoutineClient({
  tab,
  day,
  schedules,
  processes,
  workspaces,
  showArchived,
  openNew,
}: {
  tab: "dia" | "processos";
  day: RoutineDayView | null;
  schedules: ScheduleView[];
  processes: ProcessView[];
  workspaces: Ws[];
  showArchived: boolean;
  openNew: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const kind = tab === "dia" ? "SCHEDULE" : "CHECKLIST";
  const [editing, setEditing] = React.useState<EditableRoutine | "new" | null>(openNew ? "new" : null);
  React.useEffect(() => {
    if (openNew) setEditing("new");
  }, [openNew]);

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    next.delete("novo");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Rotina"
        description={tab === "dia" ? "O roteiro do seu dia, com horários. Item não marcado reduz o percentual, mas não vira pendência." : "Processos que você repete, passo a passo, com o histórico de cada execução."}
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus /> {tab === "dia" ? "Nova rotina do dia" : "Novo processo"}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <LinkTabs
          current={tab}
          tabs={[
            { key: "dia", label: "Meu dia", href: "/rotina" },
            { key: "processos", label: "Processos", href: "/rotina?aba=processos" },
          ]}
        />
        <Segmented
          ariaLabel="Situação"
          value={showArchived ? "arq" : "ativas"}
          options={[{ value: "ativas", label: "Ativas" }, { value: "arq", label: "Arquivadas" }]}
          onChange={(v) => setParam("arquivadas", v === "arq" ? "1" : null)}
          size="sm"
        />
      </div>

      {tab === "dia" && day ? (
        <DayView day={day} schedules={schedules} showArchived={showArchived} onEdit={setEditing} onNew={() => setEditing("new")} onDate={(d) => setParam("data", d === day.today ? null : d)} />
      ) : (
        <ProcessesView processes={processes} showArchived={showArchived} onEdit={setEditing} onNew={() => setEditing("new")} />
      )}

      {editing && (
        <RoutineDialog
          kind={kind}
          routine={editing === "new" ? null : editing}
          workspaces={workspaces}
          onClose={() => {
            setEditing(null);
            if (params.get("novo")) setParam("novo", null);
          }}
        />
      )}
    </div>
  );
}
