import { analyzeProgress } from "./analyze.ts";
import { EXTREME_RPE } from "./types.ts";
import type {
  AnalysisFlag,
  PlanConstraints,
  PlanDraft,
  Recommendation,
  WorkoutRecord,
} from "./types.ts";

function evidenceFor(flags: AnalysisFlag[], code: string): Record<string, unknown> {
  const flag = flags.find((entry) => entry.code === code);
  return flag ? flag.evidence : {};
}

/**
 * Deterministic, rule-based draft plan. Never mutates source records and never
 * calls an LLM: the Skill is responsible for turning this structured draft into
 * natural-language coaching that cites the same evidence.
 */
export function generateNextPlan(
  records: WorkoutRecord[],
  constraints: PlanConstraints = {},
): PlanDraft {
  const analysis = analyzeProgress(records, {});
  const recommendations: Recommendation[] = [];
  const safetyNotes: string[] = [];
  let professionalCarePrompt: string | null = null;

  const flagCodes = new Set(analysis.flags.map((flag) => flag.code));
  const { metrics, trends } = analysis;

  const base = {
    is_draft: true as const,
    requires_confirmation: true as const,
    goal: constraints.goal ?? null,
    based_on: {
      period: analysis.period,
      sessions: metrics.sessions,
      source_records: analysis.source_records,
    },
  };

  if (records.length === 0) {
    recommendations.push({
      action: "import_history",
      detail: "Import at least one workout record before generating a plan.",
      reason: "No training history is available, so no evidence-based plan can be produced.",
      evidence: { sessions: 0 },
    });
    return {
      ...base,
      recommendations,
      safety_notes: safetyNotes,
      professional_care_prompt: professionalCarePrompt,
    };
  }

  if (flagCodes.has("PAIN_REPORTED")) {
    const evidence = evidenceFor(analysis.flags, "PAIN_REPORTED");
    safetyNotes.push(
      "Pain was reported. Avoid loading the affected area and prioritize recovery.",
    );
    professionalCarePrompt =
      "If pain persists, worsens, or is sharp, seek evaluation from a qualified medical professional before continuing.";
    recommendations.push({
      action: "reduce_or_pause_loading",
      detail: "Do not progress load next session; keep intensity at or below the most recent session, or rest.",
      reason: "A pain report was recorded, which overrides any progression logic.",
      evidence,
    });
  }

  if (flagCodes.has("EXTREME_RPE")) {
    const evidence = evidenceFor(analysis.flags, "EXTREME_RPE");
    safetyNotes.push(`At least one set reached RPE ${EXTREME_RPE} or higher.`);
    recommendations.push({
      action: "cap_intensity",
      detail: `Keep working sets at or below RPE ${EXTREME_RPE - 2} next session.`,
      reason: `The recorded maximum RPE was ${String(evidence.max_rpe)}, indicating maximal effort.`,
      evidence,
    });
  }

  if (flagCodes.has("VOLUME_SPIKE")) {
    const evidence = evidenceFor(analysis.flags, "VOLUME_SPIKE");
    safetyNotes.push("Training volume rose sharply versus the recent average.");
    recommendations.push({
      action: "hold_volume",
      detail: "Repeat last session's volume rather than adding more; progress only if recovery is good.",
      reason: `Latest volume was ${String(evidence.change_pct)}% above the recent average.`,
      evidence,
    });
  }

  if (flagCodes.has("VOLUME_DROP")) {
    const evidence = evidenceFor(analysis.flags, "VOLUME_DROP");
    recommendations.push({
      action: "rebuild_volume",
      detail: "Rebuild volume gradually (about 10-20% of the gap per session) rather than jumping back.",
      reason: `Latest volume was ${String(evidence.change_pct)}% below the recent average.`,
      evidence,
    });
  }

  if (flagCodes.has("MISSING_RECOVERY_DATA")) {
    safetyNotes.push(
      "No recovery data was recorded; recommendations assume adequate sleep and recovery.",
    );
  }

  const rising = trends.filter((trend) => trend.direction === "up");
  const avgRpe = metrics.avg_rpe;
  const safeToProgress =
    !flagCodes.has("PAIN_REPORTED") &&
    !flagCodes.has("EXTREME_RPE") &&
    !flagCodes.has("VOLUME_SPIKE");

  if (safeToProgress && rising.length > 0 && (avgRpe === null || avgRpe <= 7)) {
    const top = rising[0];
    recommendations.push({
      action: "progressive_overload",
      detail: `Add a small increase (~2.5% load or one rep per set) to ${top.exercise}.`,
      reason: `Estimated 1RM for ${top.exercise} rose ${top.delta_pct}% across ${top.sessions_compared} sessions at an average RPE of ${avgRpe ?? "not recorded"}.`,
      evidence: { exercise: top.exercise, delta_pct: top.delta_pct, avg_rpe: avgRpe },
    });
  } else if (safeToProgress) {
    recommendations.push({
      action: "maintain",
      detail: "Repeat the recent session structure and only progress if it feels controlled.",
      reason:
        trends.length === 0
          ? "No exercise had enough weighted history to establish a trend."
          : `No exercise showed a rising trend (average RPE ${avgRpe ?? "not recorded"}).`,
      evidence: { trends_considered: trends.length, avg_rpe: avgRpe },
    });
  }

  if (flagCodes.has("INSUFFICIENT_HISTORY")) {
    safetyNotes.push(
      `Only ${metrics.sessions} session(s) are available; treat this plan as low-confidence.`,
    );
  }

  if (constraints.days_available !== undefined) {
    recommendations.push({
      action: "schedule",
      detail: `Fit the plan into ${constraints.days_available} available day(s).`,
      reason: "The caller supplied a weekly availability constraint.",
      evidence: { days_available: constraints.days_available },
    });
  }

  if (constraints.equipment !== undefined && constraints.equipment.length > 0) {
    recommendations.push({
      action: "equipment",
      detail: `Restrict exercise selection to: ${constraints.equipment.join(", ")}.`,
      reason: "The caller supplied an equipment constraint.",
      evidence: { equipment: constraints.equipment },
    });
  }

  if (constraints.constraints !== undefined && constraints.constraints.length > 0) {
    safetyNotes.push(...constraints.constraints.map((note) => `User constraint: ${note}`));
  }

  return {
    ...base,
    recommendations,
    safety_notes: safetyNotes,
    professional_care_prompt: professionalCarePrompt,
  };
}
