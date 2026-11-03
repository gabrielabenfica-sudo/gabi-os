import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RoutineBlock } from "./types";

function useInvalidator() {
  const queryClient = useQueryClient();
  return (...keys: string[]) =>
    keys.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
}

export function useToggleRoutineLog() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async ({
      blockId,
      date,
      done,
    }: {
      blockId: string;
      date: string;
      done: boolean;
    }) => {
      const { error } = await supabase
        .from("routine_logs")
        .upsert(
          { block_id: blockId, log_date: date, done },
          { onConflict: "block_id,log_date" },
        );
      if (error) throw error;
    },
    onSuccess: () => invalidate("routine-logs"),
  });
}

export function useSaveRoutineBlock() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async (block: Partial<RoutineBlock> & { id?: string }) => {
      const payload = {
        title: block.title,
        start_time: block.start_time,
        end_time: block.end_time,
        days: block.days ?? [],
        workspace_id: block.workspace_id ?? null,
        color: block.color ?? null,
        category: block.category ?? null,
        active: block.active ?? true,
        position: block.position ?? 0,
        notes: block.notes ?? null,
      };
      const { error } = block.id
        ? await supabase.from("routine_blocks").update(payload).eq("id", block.id)
        : await supabase.from("routine_blocks").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => invalidate("routine-blocks"),
  });
}

export function useDeleteRoutineBlock() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("routine_blocks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate("routine-blocks", "routine-logs"),
  });
}

export function useToggleHabitEntry() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async ({
      habitId,
      date,
      done,
    }: {
      habitId: string;
      date: string;
      done: boolean;
    }) => {
      if (done) {
        const { error } = await supabase
          .from("habit_entries")
          .upsert({ habit_id: habitId, entry_date: date, done: true }, { onConflict: "habit_id,entry_date" });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("habit_entries")
          .delete()
          .eq("habit_id", habitId)
          .eq("entry_date", date);
        if (error) throw error;
      }
    },
    onSuccess: () => invalidate("habit-entries"),
  });
}

export function useSaveTask() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const { error } = await supabase.from("tasks").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate("tasks"),
  });
}

export function useCreateTask() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase.from("tasks").insert(values);
      if (error) throw error;
    },
    onSuccess: () => invalidate("tasks"),
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate("tasks"),
  });
}

export function useSaveEvent() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase.from("events").insert(values);
      if (error) throw error;
    },
    onSuccess: () => invalidate("events"),
  });
}

export function useDeleteEvent() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate("events"),
  });
}

export function useSaveGoal() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const { error } = await supabase.from("goals").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate("goals"),
  });
}

export function useSaveContentItem() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const { error } = await supabase.from("content_items").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate("content-items"),
  });
}

export function useCreateContentItem() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase
        .from("content_items")
        .insert({ id: crypto.randomUUID(), ...values });
      if (error) throw error;
    },
    onSuccess: () => invalidate("content-items"),
  });
}

export function useSaveNote() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const { error } = await supabase.from("notes").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate("notes"),
  });
}

export function useCreateNote() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase.from("notes").insert(values);
      if (error) throw error;
    },
    onSuccess: () => invalidate("notes"),
  });
}

export function useSaveFinanceTransaction() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase.from("finance_transactions").insert(values);
      if (error) throw error;
    },
    onSuccess: () => invalidate("finance-transactions"),
  });
}

export function useImportFinanceTransactions() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async (rows: Array<Record<string, unknown>>) => {
      if (!rows.length) return { inserted: 0 };
      const { error } = await supabase
        .from("finance_transactions")
        .upsert(rows, { onConflict: "user_id,external_id", ignoreDuplicates: true });
      if (error) throw error;
      return { inserted: rows.length };
    },
    onSuccess: () => invalidate("finance-transactions"),
  });
}

export function useDeleteFinanceTransaction() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("finance_transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate("finance-transactions"),
  });
}

export function useCreateSocialProfile() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase.from("social_profiles").insert({ id: crypto.randomUUID(), ...values });
      if (error) throw error;
    },
    onSuccess: () => invalidate("social-profiles"),
  });
}

export function useSaveAccount() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase.from("accounts").insert(values);
      if (error) throw error;
    },
    onSuccess: () => invalidate("accounts"),
  });
}

export function useDeleteAccount() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate("accounts", "finance-transactions", "finance-installments"),
  });
}

export function useSaveInstallment() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase.from("finance_installments").insert(values);
      if (error) throw error;
    },
    onSuccess: () => invalidate("finance-installments"),
  });
}

export function useDeleteInstallment() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("finance_installments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate("finance-installments"),
  });
}

export function useUpdateInstallmentPaid() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async ({ id, paid }: { id: string; paid: number[] }) => {
      const { error } = await supabase.from("finance_installments").update({ paid }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate("finance-installments"),
  });
}
