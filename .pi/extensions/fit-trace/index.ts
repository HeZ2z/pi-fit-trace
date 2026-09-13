/**
 * pi Extension adapter for fit-trace.
 *
 * This is the only module that depends on the pi runtime. All domain behavior
 * lives in `@pi-fit-trace/core` so it can be tested without pi.
 *
 * Discovery: pi auto-loads project-local extensions from `.pi/extensions/`.
 */
import { join } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import {
  SESSION_TYPES,
  FitTraceError,
  analyzeProgress,
  generateNextPlan,
  validateWorkoutRecord,
} from "@pi-fit-trace/core";

import { JsonFileStorage, WorkoutStore } from "./store.ts";

/** `PI_FIT_TRACE_STORE` overrides the default project-local store location. */
function resolveStorePath(cwd: string): string {
  const override = process.env.PI_FIT_TRACE_STORE;
  if (override !== undefined && override.trim() !== "") return override;
  return join(cwd, CONFIG_DIR_NAME, "fit-trace", "workouts.json");
}

function rethrow(error: unknown): never {
  if (error instanceof FitTraceError) {
    throw new Error(`${error.code}: ${error.message}`);
  }
  throw error;
}

const setSchema = Type.Object({
  weight: Type.Optional(Type.Number({ minimum: 0, description: "Weight in kilograms" })),
  reps: Type.Integer({ minimum: 0, description: "Repetitions" }),
  rpe: Type.Optional(Type.Number({ minimum: 1, maximum: 10, description: "Rate of perceived exertion" })),
});

const exerciseSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  sets: Type.Array(setSchema, { minItems: 1 }),
});

const painSchema = Type.Object({
  area: Type.Optional(Type.String()),
  level: Type.Optional(Type.Number({ minimum: 0, maximum: 10 })),
});

const recordSchema = Type.Object({
  id: Type.String({ minLength: 1, description: "Stable App-assigned id; used as the idempotency key" }),
  schema_version: Type.Optional(Type.Integer({ minimum: 1 })),
  date: Type.String({ description: "ISO 8601 date (YYYY-MM-DD) or datetime" }),
  session_type: StringEnum(SESSION_TYPES),
  exercises: Type.Array(exerciseSchema, { minItems: 1 }),
  duration_minutes: Type.Optional(Type.Number({ minimum: 0 })),
  sleep_hours: Type.Optional(Type.Number({ minimum: 0, maximum: 24 })),
  pain: Type.Optional(Type.Array(painSchema)),
  notes: Type.Optional(Type.String()),
});

export default function fitTraceExtension(pi: ExtensionAPI): void {
  let store: WorkoutStore | null = null;

  const getStore = (ctx: ExtensionContext): WorkoutStore => {
    if (store === null) {
      store = new WorkoutStore(new JsonFileStorage(resolveStorePath(ctx.cwd)));
    }
    return store;
  };

  pi.registerTool({
    name: "import_workout",
    label: "Import Workout",
    description:
      "Validate and store one training session. Rejects invalid records; accepts suspicious-but-usable records with warnings. Idempotent by record id.",
    promptSnippet: "Validate and store one training session (idempotent by id)",
    promptGuidelines: [
      "Use import_workout to store a single training session submitted by the App.",
      "Use import_workout again with the same id to retry safely; identical content is a no-op.",
    ],
    parameters: Type.Object({ record: recordSchema }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const { record, warnings } = validateWorkoutRecord(params.record);
        const result = await getStore(ctx).import(record);
        const text = result.duplicate
          ? `Record ${record.id} is already stored with identical content; no change made.`
          : `Imported record ${record.id}.${warnings.length > 0 ? ` ${warnings.length} warning(s).` : ""}`;
        return {
          content: [{ type: "text", text }],
          details: {
            id: record.id,
            accepted: true,
            duplicate: result.duplicate,
            warnings,
            total_records: result.total,
          },
        };
      } catch (error) {
        return rethrow(error);
      }
    },
  });

  pi.registerTool({
    name: "get_training_history",
    label: "Get Training History",
    description:
      "Query stored training records by date range and exercise. Returns records in ascending date order with pagination info.",
    promptSnippet: "Query stored training records by date range or exercise",
    parameters: Type.Object({
      from: Type.Optional(Type.String({ description: "Inclusive ISO 8601 start date" })),
      to: Type.Optional(Type.String({ description: "Inclusive ISO 8601 end date" })),
      exercise: Type.Optional(Type.String({ description: "Exact exercise name (case-insensitive)" })),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
      offset: Type.Optional(Type.Integer({ minimum: 0 })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const result = await getStore(ctx).query(params);
        return {
          content: [
            {
              type: "text",
              text: `Returned ${result.records.length} of ${result.total} matching record(s).`,
            },
          ],
          details: result,
        };
      } catch (error) {
        return rethrow(error);
      }
    },
  });

  pi.registerTool({
    name: "analyze_progress",
    label: "Analyze Progress",
    description:
      "Deterministically compute metrics, per-exercise trends, and safety flags from stored training records.",
    promptSnippet: "Compute metrics, trends, and safety flags from training history",
    promptGuidelines: [
      "Use analyze_progress before making any claim about progress or trends.",
    ],
    parameters: Type.Object({
      from: Type.Optional(Type.String({ description: "Inclusive ISO 8601 start date" })),
      to: Type.Optional(Type.String({ description: "Inclusive ISO 8601 end date" })),
      exercises: Type.Optional(Type.Array(Type.String(), { description: "Restrict to these exercises" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const records = await getStore(ctx).all();
        const analysis = analyzeProgress(records, params);
        return {
          content: [
            {
              type: "text",
              text: `Analyzed ${analysis.metrics.sessions} session(s): volume ${analysis.metrics.volume_kg} kg, avg RPE ${analysis.metrics.avg_rpe ?? "n/a"}, ${analysis.flags.length} flag(s).`,
            },
          ],
          details: analysis,
        };
      } catch (error) {
        return rethrow(error);
      }
    },
  });

  pi.registerTool({
    name: "generate_next_plan",
    label: "Generate Next Plan",
    description:
      "Generate an explainable DRAFT plan for the next session. Each recommendation cites evidence. Never modifies stored records and never auto-adopts a plan.",
    promptSnippet: "Draft the next training plan with cited evidence (requires user confirmation)",
    promptGuidelines: [
      "Use generate_next_plan only after retrieving history and metrics.",
      "Present the draft to the user and wait for confirmation before treating it as adopted.",
    ],
    parameters: Type.Object({
      goal: Type.Optional(Type.String()),
      days_available: Type.Optional(Type.Integer({ minimum: 1, maximum: 7 })),
      equipment: Type.Optional(Type.Array(Type.String())),
      constraints: Type.Optional(Type.Array(Type.String())),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const records = await getStore(ctx).all();
        const draft = generateNextPlan(records, params);
        return {
          content: [
            {
              type: "text",
              text: `Generated a draft plan with ${draft.recommendations.length} recommendation(s). This is a draft and requires user confirmation.`,
            },
          ],
          details: draft,
        };
      } catch (error) {
        return rethrow(error);
      }
    },
  });
}
