/** Cartões do Dashboard (compartilhado entre servidor e cliente). */
export const WIDGETS = [
  { id: "tasks-summary", label: "Indicadores do período" },
  { id: "next-event", label: "Próximo compromisso" },
  { id: "agenda", label: "Compromissos do período" },
  { id: "priorities", label: "Prioridades" },
  { id: "overdue", label: "Tarefas atrasadas" },
  { id: "habits", label: "Hábitos" },
  { id: "completion-chart", label: "Tarefas concluídas por dia" },
] as const;
export type WidgetId = (typeof WIDGETS)[number]["id"];
export type DashboardPeriod = "today" | "week" | "month" | "custom";
export type DashboardPrefs = { order: string[]; hidden: string[] };
