import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, invokeFunction } from "@/integrations/supabase/client";
import type {
  Account,
  CalendarEvent,
  Category,
  Compensation,
  ContentItem,
  ContentReference,
  ContentStatus,
  FinanceInstallment,
  FinanceTransaction,
  Goal,
  Habit,
  HabitEntry,
  Integration,
  MaasArea,
  MaasAssessment,
  MaasScore,
  Note,
  NotificationPrefs,
  PipelineStage,
  Profile,
  RoutineBlock,
  RoutineLog,
  SocialProfile,
  SocialSnapshot,
  Task,
  TaskLabel,
  TaskStatus,
  Workspace,
} from "./types";

const TABLE_KEYS = {
  workspaces: ["workspaces"],
  taskStatuses: ["task-statuses"],
  taskLabels: ["task-labels"],
  tasks: ["tasks"],
  events: ["events"],
  notes: ["notes"],
  goals: ["goals"],
  habits: ["habits"],
  habitEntries: ["habit-entries"],
  accounts: ["accounts"],
  categories: ["categories"],
  compensation: ["compensation"],
  financeTransactions: ["finance-transactions"],
  financeInstallments: ["finance-installments"],
  pipelineStages: ["pipeline-stages"],
  contentStatuses: ["content-statuses"],
  contentItems: ["content-items"],
  contentReferences: ["content-references"],
  socialProfiles: ["social-profiles"],
  socialSnapshots: ["social-snapshots"],
  maasAreas: ["maas-areas"],
  maasAssessments: ["maas-assessments"],
  maasScores: ["maas-scores"],
  routineBlocks: ["routine-blocks"],
  routineLogs: ["routine-logs"],
  profile: ["profile"],
  notificationPrefs: ["notification-prefs"],
} as const;

function useTable<T>(table: string, key: readonly string[], order?: { column: string; ascending?: boolean }) {
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      let query = supabase.from(table).select("*");
      if (order) query = query.order(order.column, { ascending: order.ascending ?? true });
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as T[];
    },
  });
}

export const useWorkspaces = () =>
  useTable<Workspace>("workspaces", TABLE_KEYS.workspaces, { column: "position" });
export const useTaskStatuses = () =>
  useTable<TaskStatus>("task_statuses", TABLE_KEYS.taskStatuses, { column: "position" });
export const useTaskLabels = () => useTable<TaskLabel>("labels", TABLE_KEYS.taskLabels);
export const useTasks = () =>
  useTable<Task>("tasks", TABLE_KEYS.tasks, { column: "position", ascending: false });
export const useEvents = () =>
  useTable<CalendarEvent>("events", TABLE_KEYS.events, { column: "start_at" });
export const useNotes = () =>
  useTable<Note>("notes", TABLE_KEYS.notes, { column: "updated_at", ascending: false });
export const useGoals = () => useTable<Goal>("goals", TABLE_KEYS.goals, { column: "created_at" });
export const useHabits = () =>
  useTable<Habit>("habits", TABLE_KEYS.habits, { column: "position" });
export const useHabitEntries = () =>
  useTable<HabitEntry>("habit_entries", TABLE_KEYS.habitEntries, { column: "entry_date" });
export const useAccounts = () => useTable<Account>("accounts", TABLE_KEYS.accounts);
export const useCategories = () =>
  useTable<Category>("categories", TABLE_KEYS.categories, { column: "name" });
export const useCompensation = () =>
  useTable<Compensation>("compensation", TABLE_KEYS.compensation, { column: "reference_month" });
export const usePipelineStages = () =>
  useTable<PipelineStage>("pipeline_stages", TABLE_KEYS.pipelineStages, { column: "position" });
export const useContentStatuses = () =>
  useTable<ContentStatus>("content_statuses", TABLE_KEYS.contentStatuses, { column: "position" });
export const useContentItems = () =>
  useTable<ContentItem>("content_items", TABLE_KEYS.contentItems, {
    column: "position",
    ascending: false,
  });
export const useContentReferences = () =>
  useTable<ContentReference>("content_references", TABLE_KEYS.contentReferences, {
    column: "created_at",
    ascending: false,
  });
export const useFinanceTransactions = () =>
  useTable<FinanceTransaction>("finance_transactions", TABLE_KEYS.financeTransactions, {
    column: "occurred_on",
    ascending: false,
  });

export const useFinanceInstallments = () =>
  useTable<FinanceInstallment>("finance_installments", TABLE_KEYS.financeInstallments, {
    column: "first_due_date",
  });

export const useSocialProfiles = () =>
  useTable<SocialProfile>("social_profiles", TABLE_KEYS.socialProfiles, { column: "created_at" });
export const useSocialSnapshots = () =>
  useTable<SocialSnapshot>("social_snapshots", TABLE_KEYS.socialSnapshots, {
    column: "snapshot_date",
  });
export const useMaasAreas = () =>
  useTable<MaasArea>("maas_areas", TABLE_KEYS.maasAreas, { column: "position" });
export const useMaasAssessments = () =>
  useTable<MaasAssessment>("maas_assessments", TABLE_KEYS.maasAssessments, {
    column: "assessment_date",
    ascending: false,
  });
export const useMaasScores = () => useTable<MaasScore>("maas_scores", TABLE_KEYS.maasScores);
export const useRoutineBlocks = () =>
  useTable<RoutineBlock>("routine_blocks", TABLE_KEYS.routineBlocks, { column: "start_time" });
export const useRoutineLogs = () =>
  useTable<RoutineLog>("routine_logs", TABLE_KEYS.routineLogs, { column: "log_date" });

export function useProfile() {
  return useQuery({
    queryKey: TABLE_KEYS.profile,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as Profile | null;
    },
  });
}

export function useNotificationPrefs() {
  return useQuery({
    queryKey: TABLE_KEYS.notificationPrefs,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_prefs")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as NotificationPrefs | null;
    },
  });
}

export function useIntegrations() {
  return useQuery({
    queryKey: ["integrations"],
    queryFn: async () => {
      const { data, error } = await invokeFunction<{ integrations: Integration[]; redirect_uri: string }>("integrations", { action: "status" });
      if (error) throw error;
      return data as { integrations: Integration[]; redirect_uri: string };
    },
  });
}

export function useInvalidate() {
  const queryClient = useQueryClient();
  return (keys: string[]) => {
    keys.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
  };
}

export function useIntegrationAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data, error } = await invokeFunction<Record<string, unknown>>("integrations", payload);
      if (error) throw error;
      if (data?.error) throw new Error(data.error as string);
      return data as Record<string, unknown>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["integrations"] }),
  });
}

/** Calls the one-time import of the Gabi OS export for the signed-in owner. */
export async function runSeed() {
  const { data, error } = await invokeFunction<{ seeded: boolean; reason?: string }>("seed-gabi-os", {});
  if (error) return null;
  return data as { seeded: boolean; reason?: string } | null;
}
