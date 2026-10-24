import { Badge } from "@/components/ui/badge";

export const PRIORITY_LABEL = { LOW: "Baixa", MEDIUM: "Média", HIGH: "Alta", URGENT: "Urgente" } as const;
export type PriorityKey = keyof typeof PRIORITY_LABEL;
export const PRIORITY_ORDER: Record<PriorityKey, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export function PriorityBadge({ priority, hideMedium = false }: { priority: PriorityKey; hideMedium?: boolean }) {
  if (hideMedium && (priority === "MEDIUM" || priority === "LOW")) return null;
  const variant = priority === "URGENT" ? "danger" : priority === "HIGH" ? "warning" : priority === "LOW" ? "outline" : "default";
  return <Badge variant={variant}>{PRIORITY_LABEL[priority]}</Badge>;
}

export const EVENT_STATUS_LABEL = {
  NOT_STARTED: "Não iniciado",
  IN_PROGRESS: "Em andamento",
  DONE: "Concluído",
  CANCELLED: "Cancelado",
} as const;
