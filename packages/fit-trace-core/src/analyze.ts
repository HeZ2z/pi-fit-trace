import {
  assertOrderedDateRange,
  assertValidFilterDate,
  detectFlags,
  exerciseTrends,
  sortRecords,
  summarizeMetrics,
  toDateKey,
} from "./metrics.ts";
import type { AnalysisFilter, AnalysisResult, WorkoutRecord } from "./types.ts";

/** Apply date-range and exercise filters, returning records sorted by date. */
export function filterRecords(records: WorkoutRecord[], filter: AnalysisFilter = {}): WorkoutRecord[] {
  const from = filter.from === undefined ? undefined : assertValidFilterDate(filter.from, "from");
  const to = filter.to === undefined ? undefined : assertValidFilterDate(filter.to, "to");
  assertOrderedDateRange(from, to);

  let scoped = sortRecords(records);

  if (from !== undefined) {
    const fromKey = toDateKey(from);
    scoped = scoped.filter((record) => toDateKey(record.date) >= fromKey);
  }
  if (to !== undefined) {
    const toKey = toDateKey(to);
    scoped = scoped.filter((record) => toDateKey(record.date) <= toKey);
  }
  if (filter.exercises !== undefined && filter.exercises.length > 0) {
    const wanted = new Set(filter.exercises.map((name) => name.toLowerCase()));
    scoped = scoped.filter((record) =>
      record.exercises.some((exercise) => wanted.has(exercise.name.toLowerCase())),
    );
  }

  return scoped;
}

/**
 * Deterministic progress analysis. Pure function: no clock, no randomness, no
 * LLM. Identical input always yields identical output.
 */
export function analyzeProgress(records: WorkoutRecord[], filter: AnalysisFilter = {}): AnalysisResult {
  const scoped = filterRecords(records, filter);

  return {
    period: {
      from: scoped.length > 0 ? toDateKey(scoped[0].date) : null,
      to: scoped.length > 0 ? toDateKey(scoped[scoped.length - 1].date) : null,
    },
    metrics: summarizeMetrics(scoped),
    trends: exerciseTrends(scoped),
    flags: detectFlags(scoped),
    source_records: scoped.map((record) => record.id),
  };
}
