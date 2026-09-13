/**
 * Domain types shared by the fit-trace extension, its deterministic core,
 * and the test suite. This module must stay free of pi/typebox imports so the
 * core logic can be tested without a pi runtime.
 */

export const CURRENT_SCHEMA_VERSION = 1;

/** RPE at or above this is treated as an extreme-effort safety signal. */
export const EXTREME_RPE = 9;
/** Below this many sessions in range, analysis is treated as low-confidence. */
export const MIN_HISTORY_SESSIONS = 3;
/** Session-over-session volume change (percent) that counts as a spike/drop. */
export const VOLUME_CHANGE_THRESHOLD_PCT = 30;

export const SESSION_TYPES = ["strength", "cardio", "mobility", "other"] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

/** A single set. `reps` is required; `weight` (kg) and `rpe` (1-10) are optional. */
export interface WorkoutSet {
  weight?: number;
  reps: number;
  rpe?: number;
}

export interface Exercise {
  name: string;
  sets: WorkoutSet[];
}

export interface PainReport {
  area?: string;
  /** 0-10. */
  level?: number;
}

/** A single training session. `id` is assigned by the App and is the idempotency key. */
export interface WorkoutRecord {
  id: string;
  schema_version: number;
  /** ISO 8601 date (`YYYY-MM-DD`) or datetime. */
  date: string;
  session_type: SessionType;
  exercises: Exercise[];
  duration_minutes?: number;
  sleep_hours?: number;
  pain?: PainReport[];
  notes?: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
  path?: string;
}

export interface ValidatedRecord {
  record: WorkoutRecord;
  warnings: ValidationWarning[];
}

export interface ImportResult {
  id: string;
  accepted: boolean;
  /** True when an identical record with this id was already stored (idempotent no-op). */
  duplicate: boolean;
  warnings: ValidationWarning[];
}

export interface HistoryFilter {
  from?: string;
  to?: string;
  exercise?: string;
  limit?: number;
  offset?: number;
}

export interface AnalysisFilter {
  from?: string;
  to?: string;
  exercises?: string[];
}

export interface PlanConstraints {
  goal?: string;
  days_available?: number;
  equipment?: string[];
  constraints?: string[];
}

export type Severity = "info" | "warning" | "critical";

export interface AnalysisFlag {
  code: string;
  severity: Severity;
  message: string;
  evidence: Record<string, unknown>;
}

export interface AnalysisMetrics {
  sessions: number;
  total_sets: number;
  total_reps: number;
  /** Sum of `weight * reps` over sets that declare a weight (kg). */
  volume_kg: number;
  /** Mean of all declared set RPE values, or null when none are declared. */
  avg_rpe: number | null;
  /** Mean gap in days between consecutive distinct session dates (0 when < 2 sessions). */
  avg_rest_days: number;
  max_gap_days: number;
}

export interface ExerciseTrend {
  exercise: string;
  metric: "est_1rm_kg";
  sessions_compared: number;
  first: number;
  last: number;
  delta: number;
  delta_pct: number;
  direction: "up" | "down" | "flat";
}

export interface AnalysisResult {
  period: { from: string | null; to: string | null };
  metrics: AnalysisMetrics;
  trends: ExerciseTrend[];
  flags: AnalysisFlag[];
  /** Record ids the analysis was computed from. */
  source_records: string[];
}

export interface Recommendation {
  action: string;
  detail: string;
  /** Always cites a concrete metric or states that data is insufficient. */
  reason: string;
  evidence: Record<string, unknown>;
}

export interface PlanDraft {
  is_draft: true;
  requires_confirmation: true;
  goal: string | null;
  based_on: {
    period: { from: string | null; to: string | null };
    sessions: number;
    source_records: string[];
  };
  recommendations: Recommendation[];
  safety_notes: string[];
  professional_care_prompt: string | null;
}
