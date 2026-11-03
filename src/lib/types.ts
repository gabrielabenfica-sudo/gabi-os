export type Workspace = {
  id: string;
  name: string;
  kind: string;
  color: string | null;
  position: number;
};

export type TaskStatus = {
  id: string;
  workspace_id: string;
  name: string;
  position: number;
  category: string | null;
  is_done: boolean;
};

export type TaskLabel = { id: string; workspace_id: string; name: string; color: string | null };

export type Task = {
  id: string;
  workspace_id: string;
  status_id: string | null;
  title: string;
  description: string | null;
  assignee: string | null;
  priority: string | null;
  position: number;
  start_date: string | null;
  due_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  rrule: string | null;
  recurrence_parent_id: string | null;
  estimate_minutes: number | null;
  is_template: boolean;
  label_ids: string[];
  history: Array<{ field: string; from: string | null; to: string | null; at: string }>;
  checklist: Array<{ id: string; title: string; done: boolean }>;
  created_at: string;
  updated_at: string;
};

export type CalendarEvent = {
  id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  timezone: string | null;
  location: string | null;
  priority: string | null;
  rrule: string | null;
  notes: string | null;
  status: string | null;
  transparency: string | null;
  task_id: string | null;
  external_id: string | null;
  sync_state: string | null;
};

export type Note = {
  id: string;
  workspace_id: string;
  title: string;
  content: unknown;
  plain_text: string | null;
  favorite: boolean;
  created_at: string;
  updated_at: string;
};

export type Goal = {
  id: string;
  workspace_id: string;
  type: string | null;
  title: string;
  description: string | null;
  category: string | null;
  measure: string | null;
  direction: string | null;
  unit: string | null;
  start_value: number | null;
  target_value: number | null;
  current_value: number | null;
  horizon: string | null;
  start_date: string | null;
  due_date: string | null;
  status: string;
  is_objective: boolean;
  steps: Array<{ id: string; title: string; done: boolean }>;
  progress: Array<{ id: string; date: string; value: string; note: string | null }>;
};

export type Habit = {
  id: string;
  workspace_id: string;
  name: string;
  category: string | null;
  frequency: string;
  days_of_week: number[];
  times_per_week: number | null;
  color: string | null;
  active: boolean;
  position: number;
};

export type HabitEntry = {
  id: string;
  habit_id: string;
  entry_date: string;
  done: boolean;
};

export type Account = {
  id: string;
  workspace_id: string | null;
  scope: string | null;
  name: string;
  type: string | null;
  institution: string | null;
  initial_balance_cents: number;
  initial_balance_date: string | null;
};

export type Category = {
  id: string;
  workspace_id: string;
  name: string;
  kind: string;
  cost_type: string | null;
};

export type Compensation = {
  id: string;
  workspace_id: string;
  kind: string | null;
  reference_month: string | null;
  expected_cents: number | null;
  received_cents: number | null;
  expected_date: string | null;
  status: string;
};

export type PipelineStage = {
  id: string;
  workspace_id: string;
  name: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
};

export type ContentStatus = {
  id: string;
  workspace_id: string;
  name: string;
  position: number;
  is_recording_scheduled: boolean;
  is_scheduled: boolean;
  is_published: boolean;
};

export type ContentItem = {
  id: string;
  workspace_id: string;
  profile_id: string | null;
  status_id: string | null;
  title: string;
  platform: string | null;
  format: string | null;
  objective: string | null;
  audience: string | null;
  hook: string | null;
  script: string | null;
  cta: string | null;
  owner: string | null;
  participants: string | null;
  recording_date: string | null;
  publish_date: string | null;
  published_at: string | null;
  published_url: string | null;
  notes: string | null;
  position: number;
};

export type ContentReference = {
  id: string;
  workspace_id: string;
  profile_id: string | null;
  url: string | null;
  creator: string | null;
  theme: string | null;
  format: string | null;
  notes: string | null;
  tags: string[];
};

export type SocialProfile = {
  id: string;
  workspace_id: string;
  name: string;
  username: string | null;
  platform: string;
  posting_goal_per_week: number | null;
  audience: string | null;
  positioning: string | null;
};

export type SocialSnapshot = {
  id: string;
  profile_id: string;
  snapshot_date: string;
  followers: number | null;
  reach: number | null;
  views: number | null;
  source: string | null;
};

export type MaasArea = { id: string; name: string; position: number; active: boolean };

export type MaasScore = {
  id: string;
  assessment_id: string;
  area_id: string | null;
  area_name: string;
  score: number | null;
  comment: string | null;
  action_plan: string | null;
  goal: string | null;
};

export type MaasAssessment = {
  id: string;
  assessment_date: string;
  notes: string | null;
  created_at: string;
};

export type NotificationPrefs = {
  daily_enabled: boolean;
  daily_time: string;
  weekly_enabled: boolean;
  weekly_day: number;
  monthly_enabled: boolean;
  monthly_day: number;
  in_app_enabled: boolean;
  email_enabled: boolean;
  bill_due_days_before: number;
};

export type RoutineBlock = {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  days: number[];
  workspace_id: string | null;
  color: string | null;
  category: string | null;
  active: boolean;
  position: number;
  notes: string | null;
};

export type RoutineLog = { id: string; block_id: string; log_date: string; done: boolean };

export type Integration = {
  provider: string;
  configured: boolean;
  status: string;
  account_label: string | null;
  last_synced_at: string | null;
  metadata: Record<string, unknown>;
};

export type Profile = {
  id: string;
  email: string | null;
  name: string | null;
  timezone: string | null;
  theme: string | null;
  app_name: string | null;
};

export type FinanceTransaction = {
  id: string;
  account_id: string | null;
  scope: "EMPRESA" | "PESSOAL";
  kind: "INCOME" | "EXPENSE";
  description: string;
  amount_cents: number;
  occurred_on: string;
  category: string | null;
  account_label: string | null;
  source: string;
  external_id: string | null;
  notes: string | null;
  created_at: string;
};

export type FinanceInstallment = {
  id: string;
  account_id: string | null;
  kind: "CREDIT_CARD" | "CHECK" | "LOAN" | "NOTE";
  description: string;
  total_cents: number;
  installments: number;
  first_due_date: string;
  category: string | null;
  notes: string | null;
  paid: number[];
  created_at: string;
};
