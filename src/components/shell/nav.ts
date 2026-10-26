import {
  BarChart3,
  Bell,
  Clapperboard,
  Compass,
  FileBarChart,
  Filter,
  Flag,
  NotebookTabs,
  Target,
  Users,
  Briefcase,
  GraduationCap,
  Wallet,
  CalendarDays,
  LayoutDashboard,
  ListChecks,
  NotebookPen,
  Repeat,
  Settings,
  Sun,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Palavras extras para a busca da paleta de comandos */
  keywords?: string[];
  shortcut?: string;
};

export type NavSection = { title?: string; items: NavItem[] };

/**
 * Navegação principal. Só entram aqui módulos já implementados —
 * nenhum item leva a uma tela vazia ou sem função.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard, keywords: ["início", "home", "resumo"], shortcut: "G D" }],
  },
  {
    title: "Organização",
    items: [
      { href: "/rotina", label: "Rotina do dia", icon: Sun, keywords: ["rotina", "dia", "planejamento", "horários", "blocos", "agenda do dia", "pdf"] },
      { href: "/agenda", label: "Agenda", icon: CalendarDays, keywords: ["calendário", "compromissos", "eventos", "reunião"], shortcut: "G A" },
      { href: "/tarefas", label: "Tarefas", icon: ListChecks, keywords: ["kanban", "trello", "demandas", "quadro"], shortcut: "G T" },
      { href: "/anotacoes", label: "Anotações", icon: NotebookPen, keywords: ["notas", "cadernos", "texto"], shortcut: "G N" },
      { href: "/habitos", label: "Hábitos", icon: Repeat, keywords: ["rotina", "academia", "leitura", "devocional", "estudos"], shortcut: "G H" },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { href: "/financas/pessoal", label: "Finanças pessoais", icon: Wallet, keywords: ["contas", "despesas", "receitas", "cartão", "fatura", "orçamento"], shortcut: "G F" },
      { href: "/turbo/remuneracao", label: "Remuneração TURBO", icon: Briefcase, keywords: ["salário", "bonificação", "bônus", "meta"] },
      { href: "/financas/mentoria", label: "Financeiro Mentoria", icon: GraduationCap, keywords: ["vendas", "faturamento", "lucro", "recebíveis", "inadimplência"] },
      { href: "/resultados", label: "Empresa e Resultados", icon: BarChart3, keywords: ["consolidado", "patrimônio", "comparativo"], shortcut: "G R" },
    ],
  },
  {
    title: "Gestão",
    items: [
      { href: "/mentoria/crm", label: "CRM", icon: Filter, keywords: ["leads", "funil", "vendas", "pipeline", "clientes"], shortcut: "G L" },
      { href: "/mentoria/mentorados", label: "Mentorados", icon: Users, keywords: ["alunos", "clientes", "encontros", "mentoria"], shortcut: "G M" },
      { href: "/conteudo", label: "Conteúdo", icon: Clapperboard, keywords: ["instagram", "reels", "calendário editorial", "posts", "roteiro"], shortcut: "G I" },
      { href: "/metas", label: "Metas", icon: Target, keywords: ["objetivos", "resultados", "progresso", "okr"], shortcut: "G O" },
    ],
  },
  {
    title: "Desenvolvimento",
    items: [
      { href: "/maas", label: "MAAS", icon: Compass, keywords: ["autoavaliação", "roda da vida", "áreas da vida", "mapa"], shortcut: "G V" },
      { href: "/objetivos", label: "Objetivos", icon: Flag, keywords: ["sonhos", "longo prazo", "pessoal", "propósito"] },
      { href: "/revisoes", label: "Revisões", icon: NotebookTabs, keywords: ["semanal", "mensal", "reflexão", "retrospectiva"] },
      { href: "/relatorios", label: "Relatórios", icon: FileBarChart, keywords: ["consolidado", "período", "exportar", "pdf", "csv"], shortcut: "G E" },
    ],
  },
  {
    title: "Sistema",
    items: [
      { href: "/notificacoes", label: "Notificações", icon: Bell, keywords: ["resumo", "revisão", "lembretes", "alertas"] },
      { href: "/configuracoes", label: "Configurações", icon: Settings, keywords: ["perfil", "senha", "ambientes", "exportar", "tema"], shortcut: "G C" },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
