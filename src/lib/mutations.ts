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

export function useCreateGoal() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase.from("goals").insert({ id: crypto.randomUUID(), ...values });
      if (error) throw error;
    },
    onSuccess: () => invalidate("goals"),
  });
}

export function useDeleteGoal() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("goals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate("goals"),
  });
}

/** Saves a full life-wheel assessment (one date + a score per area). */
export function useSaveMaasAssessment() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async ({
      id,
      assessment_date,
      notes,
      scores,
    }: {
      id?: string;
      assessment_date: string;
      notes: string | null;
      scores: Array<{
        area_id: string | null;
        area_name: string;
        score: number | null;
        comment: string | null;
        action_plan: string | null;
        goal: string | null;
      }>;
    }) => {
      const assessmentId = id ?? crypto.randomUUID();
      if (id) {
        const { error } = await supabase.from("maas_assessments").update({ assessment_date, notes }).eq("id", id);
        if (error) throw error;
        const { error: delError } = await supabase.from("maas_scores").delete().eq("assessment_id", id);
        if (delError) throw delError;
      } else {
        const { error } = await supabase
          .from("maas_assessments")
          .insert({ id: assessmentId, assessment_date, notes });
        if (error) throw error;
      }
      const rows = scores.map((score) => ({ id: crypto.randomUUID(), assessment_id: assessmentId, ...score }));
      if (rows.length) {
        const { error } = await supabase.from("maas_scores").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => invalidate("maas-assessments", "maas-scores"),
  });
}

export function useDeleteMaasAssessment() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error: scoresError } = await supabase.from("maas_scores").delete().eq("assessment_id", id);
      if (scoresError) throw scoresError;
      const { error } = await supabase.from("maas_assessments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate("maas-assessments", "maas-scores"),
  });
}

export function useUpdateSocialSnapshot() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const { error } = await supabase.from("social_snapshots").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate("social-snapshots"),
  });
}

export function useDeleteSocialSnapshot() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("social_snapshots").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate("social-snapshots"),
  });
}

export function useUpdateSocialProfile() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const { error } = await supabase.from("social_profiles").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate("social-profiles"),
  });
}

/** Deletes a profile together with all of its number records. */
export function useDeleteSocialProfile() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error: snapError } = await supabase.from("social_snapshots").delete().eq("profile_id", id);
      if (snapError) throw snapError;
      const { error } = await supabase.from("social_profiles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate("social-profiles", "social-snapshots"),
  });
}

/* ---------- Cartões de crédito ---------- */

function useTableMutations(table: string, key: string) {
  const invalidate = useInvalidator();
  const create = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase.from(table).insert({ id: crypto.randomUUID(), ...values });
      if (error) throw error;
    },
    onSuccess: () => invalidate(key),
  });
  const update = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const { error } = await supabase.from(table).update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(key),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(key),
  });
  return { create, update, remove };
}

export const useCreditCardMutations = () => useTableMutations("credit_cards", "credit-cards");
export const useCardEntryMutations = () => useTableMutations("card_entries", "card-entries");
export const useLoanMutations = () => useTableMutations("loans", "loans");

/** Marks or unmarks a card invoice (card + month) as paid. */
export function useToggleCardInvoice() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async ({ cardId, month, paid }: { cardId: string; month: string; paid: boolean }) => {
      if (paid) {
        const { error } = await supabase
          .from("card_invoices")
          .upsert(
            { id: `${cardId}_${month}`, card_id: cardId, invoice_month: month, paid_at: new Date().toISOString() },
            { onConflict: "card_id,invoice_month" },
          );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("card_invoices")
          .delete()
          .eq("card_id", cardId)
          .eq("invoice_month", month);
        if (error) throw error;
      }
    },
    onSuccess: () => invalidate("card-invoices"),
  });
}

/* ---------- A receber ---------- */

export const useReceivableMutations = () => useTableMutations("receivables", "receivables");

/**
 * Marks one month of a receivable as received. Optionally records the money as an
 * income entry in the chosen account, and links it so unmarking removes it too.
 */
export function useMarkReceived() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async ({
      receivableId,
      month,
      amountCents,
      receivedOn,
      income,
    }: {
      receivableId: string;
      month: string;
      amountCents: number;
      receivedOn: string;
      income: null | { scope: string; description: string; account_id: string | null };
    }) => {
      let transactionId: string | null = null;
      if (income) {
        transactionId = crypto.randomUUID();
        const { error } = await supabase.from("finance_transactions").insert({
          id: transactionId,
          scope: income.scope,
          kind: "INCOME",
          description: income.description,
          amount_cents: amountCents,
          occurred_on: receivedOn,
          category: "A receber",
          account_id: income.account_id,
          source: "RECEIVABLE",
        });
        if (error) throw error;
      }
      const { error } = await supabase.from("receivable_payments").upsert(
        {
          id: `${receivableId}_${month}`,
          receivable_id: receivableId,
          month,
          amount_cents: amountCents,
          received_on: receivedOn,
          transaction_id: transactionId,
        },
        { onConflict: "receivable_id,month" },
      );
      if (error) throw error;
    },
    onSuccess: () => invalidate("receivable-payments", "finance-transactions"),
  });
}

export function useUnmarkReceived() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: async ({ paymentId, transactionId }: { paymentId: string; transactionId: string | null }) => {
      if (transactionId) {
        const { error } = await supabase.from("finance_transactions").delete().eq("id", transactionId);
        if (error) throw error;
      }
      const { error } = await supabase.from("receivable_payments").delete().eq("id", paymentId);
      if (error) throw error;
    },
    onSuccess: () => invalidate("receivable-payments", "finance-transactions"),
  });
}
