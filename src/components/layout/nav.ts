import {
  CalendarDays,
  CircleDashed,
  Bot,
  Compass,
  Instagram,
  LayoutDashboard,
  ListChecks,
  NotebookPen,
  Repeat,
  Settings2,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Wallet,
  Link2,
} from "lucide-react";

export type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  end?: boolean;
};

export type NavGroup = { title: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Hoje",
    items: [
      { to: "/", label: "Painel", icon: LayoutDashboard, end: true },
      { to: "/rotina", label: "Rotina", icon: Repeat },
      { to: "/assistente", label: "Claude", icon: Bot },
    ],
  },
  {
    title: "Vida",
    items: [
      { to: "/tarefas", label: "Tarefas", icon: ListChecks },
      { to: "/calendario", label: "Agenda", icon: CalendarDays },
      { to: "/metas", label: "Metas", icon: Target },
      { to: "/habitos", label: "Hábitos", icon: CircleDashed },
      { to: "/roda-da-vida", label: "Roda da vida", icon: Compass },
    ],
  },
  {
    title: "Trabalho",
    items: [
      { to: "/conteudo", label: "Conteúdo", icon: Sparkles },
      { to: "/instagram", label: "Instagram", icon: Instagram },
      { to: "/financeiro", label: "Financeiro", icon: Wallet },
      { to: "/mentoria", label: "Mentoria", icon: Users },
      { to: "/notas", label: "Notas", icon: NotebookPen },
    ],
  },
];

export const FOOTER_ITEMS: NavItem[] = [
  { to: "/conexoes", label: "Conexões", icon: Link2 },
  { to: "/ajustes", label: "Ajustes", icon: Settings2 },
];

export const ALL_ITEMS = [...NAV_GROUPS.flatMap((group) => group.items), ...FOOTER_ITEMS];

export const TREND_ICON = TrendingUp;
