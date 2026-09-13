import { ValidationError } from "./errors.ts";
import type { ValidationIssue } from "./errors.ts";
import {
  CURRENT_SCHEMA_VERSION,
  SESSION_TYPES,
} from "./types.ts";
import type {
  Exercise,
  PainReport,
  SessionType,
  ValidatedRecord,
  ValidationWarning,
  WorkoutRecord,
  WorkoutSet,
} from "./types.ts";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;

const TOP_LEVEL_KEYS = new Set([
  "id",
  "schema_version",
  "date",
  "session_type",
  "exercises",
  "duration_minutes",
  "sleep_hours",
  "pain",
  "notes",
]);
const EXERCISE_KEYS = new Set(["name", "sets"]);
const SET_KEYS = new Set(["weight", "reps", "rpe"]);
const PAIN_KEYS = new Set(["area", "level"]);

/** Max plausible session length; longer values are rejected as impossible. */
const MAX_DURATION_MINUTES = 1440;
/** Longer than this is accepted but flagged as suspicious. */
const SUSPICIOUS_DURATION_MINUTES = 600;
/** Human sleep beyond these bounds is accepted but flagged as suspicious. */
const MIN_PLAUSIBLE_SLEEP_HOURS = 3;
const MAX_PLAUSIBLE_SLEEP_HOURS = 14;
export function isValidIsoDate(value: string): boolean {
  if (ISO_DATE_RE.test(value)) {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }
  if (ISO_DATETIME_RE.test(value)) {
    return !Number.isNaN(new Date(value).getTime());
  }
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function unknownKeys(
  value: Record<string, unknown>,
  known: Set<string>,
  basePath: string,
  push: (code: string, message: string, path?: string) => void,
): void {
  for (const key of Object.keys(value)) {
    if (!known.has(key)) {
      push("UNKNOWN_FIELD", `Unknown field \`${key}\` will be ignored`, `${basePath}.${key}`);
    }
  }
}

/**
 * Validate an untrusted workout record.
 *
 * - Hard rule violations (missing/invalid fields, negative load, RPE out of
 *   range, malformed dates) throw {@link ValidationError} and the record is
 *   never stored.
 * - Suspicious-but-usable values (missing `schema_version`, implausible sleep,
 *   zero-rep/zero-weight sets, strength sets without RPE) are accepted and
 *   returned as warnings.
 */
export function validateWorkoutRecord(input: unknown): ValidatedRecord {
  const issues: ValidationIssue[] = [];
  const warnings: ValidationWarning[] = [];

  const issue = (code: string, message: string, path?: string): void => {
    issues.push({ code, message, path });
  };
  const warn = (code: string, message: string, path?: string): void => {
    warnings.push({ code, message, path });
  };

  if (!isPlainObject(input)) {
    throw new ValidationError("Workout record must be a JSON object.", [
      { code: "INVALID_TYPE", message: "Expected an object" },
    ]);
  }

  unknownKeys(input, TOP_LEVEL_KEYS, "", warn);

  const id = input.id;
  if (typeof id !== "string" || id.trim() === "") {
    issue("MISSING_ID", "`id` must be a non-empty string", "id");
  }

  let schemaVersion = CURRENT_SCHEMA_VERSION;
  if (input.schema_version === undefined) {
    warn(
      "MISSING_SCHEMA_VERSION",
      `\`schema_version\` is missing; assuming ${CURRENT_SCHEMA_VERSION}`,
      "schema_version",
    );
  } else if (
    !isFiniteNumber(input.schema_version) ||
    !Number.isInteger(input.schema_version) ||
    input.schema_version < 1
  ) {
    issue("INVALID_SCHEMA_VERSION", "`schema_version` must be a positive integer", "schema_version");
  } else if (input.schema_version > CURRENT_SCHEMA_VERSION) {
    issue(
      "UNSUPPORTED_SCHEMA_VERSION",
      `\`schema_version\` ${input.schema_version} is newer than supported ${CURRENT_SCHEMA_VERSION}`,
      "schema_version",
    );
  } else {
    schemaVersion = input.schema_version;
  }

  const date = input.date;
  if (typeof date !== "string" || !isValidIsoDate(date)) {
    issue(
      "INVALID_DATE",
      "`date` must be a valid ISO 8601 date (YYYY-MM-DD) or datetime",
      "date",
    );
  }

  const sessionType = input.session_type;
  if (typeof sessionType !== "string" || !SESSION_TYPES.includes(sessionType as SessionType)) {
    issue(
      "INVALID_SESSION_TYPE",
      `\`session_type\` must be one of: ${SESSION_TYPES.join(", ")}`,
      "session_type",
    );
  }

  const exercises = validateExercises(input.exercises, issue, warn);

  let durationMinutes: number | undefined;
  if (input.duration_minutes !== undefined) {
    if (!isFiniteNumber(input.duration_minutes) || input.duration_minutes <= 0) {
      issue("INVALID_DURATION", "`duration_minutes` must be a positive number", "duration_minutes");
    } else if (input.duration_minutes > MAX_DURATION_MINUTES) {
      issue(
        "IMPLAUSIBLE_DURATION",
        `\`duration_minutes\` exceeds the ${MAX_DURATION_MINUTES}-minute maximum`,
        "duration_minutes",
      );
    } else {
      durationMinutes = input.duration_minutes;
      if (durationMinutes > SUSPICIOUS_DURATION_MINUTES) {
        warn(
          "SUSPICIOUS_DURATION",
          `\`duration_minutes\` ${durationMinutes} is unusually long`,
          "duration_minutes",
        );
      }
    }
  }

  let sleepHours: number | undefined;
  if (input.sleep_hours !== undefined) {
    if (!isFiniteNumber(input.sleep_hours) || input.sleep_hours < 0 || input.sleep_hours > 24) {
      issue("INVALID_SLEEP_HOURS", "`sleep_hours` must be between 0 and 24", "sleep_hours");
    } else {
      sleepHours = input.sleep_hours;
      if (sleepHours < MIN_PLAUSIBLE_SLEEP_HOURS || sleepHours > MAX_PLAUSIBLE_SLEEP_HOURS) {
        warn(
          "SUSPICIOUS_SLEEP_HOURS",
          `\`sleep_hours\` ${sleepHours} is outside the plausible range ${MIN_PLAUSIBLE_SLEEP_HOURS}-${MAX_PLAUSIBLE_SLEEP_HOURS}`,
          "sleep_hours",
        );
      }
    }
  }

  const pain = validatePain(input.pain, issue, warn);

  let notes: string | undefined;
  if (input.notes !== undefined) {
    if (typeof input.notes !== "string") {
      issue("INVALID_NOTES", "`notes` must be a string", "notes");
    } else {
      notes = input.notes;
    }
  }

  if (issues.length > 0) {
    throw new ValidationError(
      `Invalid workout record: ${issues.map((i) => i.message).join("; ")}`,
      issues,
    );
  }

  const record: WorkoutRecord = {
    id: (id as string).trim(),
    schema_version: schemaVersion,
    date: date as string,
    session_type: sessionType as SessionType,
    exercises,
  };
  if (durationMinutes !== undefined) record.duration_minutes = durationMinutes;
  if (sleepHours !== undefined) record.sleep_hours = sleepHours;
  if (pain !== undefined) record.pain = pain;
  if (notes !== undefined) record.notes = notes;

  return { record, warnings };
}

function validateExercises(
  value: unknown,
  issue: (code: string, message: string, path?: string) => void,
  warn: (code: string, message: string, path?: string) => void,
): Exercise[] {
  const exercises: Exercise[] = [];

  if (!Array.isArray(value) || value.length === 0) {
    issue("MISSING_EXERCISES", "`exercises` must be a non-empty array", "exercises");
    return exercises;
  }

  value.forEach((rawExercise, exerciseIndex) => {
    const path = `exercises[${exerciseIndex}]`;
    if (!isPlainObject(rawExercise)) {
      issue("INVALID_EXERCISE", "Each exercise must be an object", path);
      return;
    }
    unknownKeys(rawExercise, EXERCISE_KEYS, path, warn);

    const name = rawExercise.name;
    if (typeof name !== "string" || name.trim() === "") {
      issue("MISSING_EXERCISE_NAME", "Each exercise needs a non-empty `name`", `${path}.name`);
      return;
    }

    const sets = validateSets(rawExercise.sets, path, issue, warn);
    if (sets.length === 0) return;

    exercises.push({ name: name.trim(), sets });
  });

  return exercises;
}

function validateSets(
  value: unknown,
  exercisePath: string,
  issue: (code: string, message: string, path?: string) => void,
  warn: (code: string, message: string, path?: string) => void,
): WorkoutSet[] {
  const sets: WorkoutSet[] = [];

  if (!Array.isArray(value) || value.length === 0) {
    issue("MISSING_SETS", "Each exercise needs a non-empty `sets` array", `${exercisePath}.sets`);
    return sets;
  }

  value.forEach((rawSet, setIndex) => {
    const path = `${exercisePath}.sets[${setIndex}]`;
    if (!isPlainObject(rawSet)) {
      issue("INVALID_SET", "Each set must be an object", path);
      return;
    }
    unknownKeys(rawSet, SET_KEYS, path, warn);

    const reps = rawSet.reps;
    if (!isFiniteNumber(reps) || !Number.isInteger(reps) || reps < 0) {
      issue("INVALID_REPS", "`reps` must be a non-negative integer", `${path}.reps`);
      return;
    }
    if (reps === 0) {
      warn("ZERO_REPS", "Set has 0 reps", `${path}.reps`);
    }

    let weight: number | undefined;
    if (rawSet.weight !== undefined) {
      if (!isFiniteNumber(rawSet.weight) || rawSet.weight < 0) {
        issue("INVALID_WEIGHT", "`weight` must be a non-negative number in kg", `${path}.weight`);
        return;
      }
      weight = rawSet.weight;
      if (weight === 0 && reps > 0) {
        warn("ZERO_WEIGHT", "Set has reps but 0 kg weight", `${path}.weight`);
      }
    }

    let rpe: number | undefined;
    if (rawSet.rpe !== undefined) {
      if (!isFiniteNumber(rawSet.rpe) || rawSet.rpe < 1 || rawSet.rpe > 10) {
        issue("INVALID_RPE", "`rpe` must be between 1 and 10", `${path}.rpe`);
        return;
      }
      rpe = rawSet.rpe;
    }

    const set: WorkoutSet = { reps };
    if (weight !== undefined) set.weight = weight;
    if (rpe !== undefined) set.rpe = rpe;
    sets.push(set);
  });

  return sets;
}

function validatePain(
  value: unknown,
  issue: (code: string, message: string, path?: string) => void,
  warn: (code: string, message: string, path?: string) => void,
): PainReport[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    issue("INVALID_PAIN", "`pain` must be an array", "pain");
    return undefined;
  }

  const reports: PainReport[] = [];
  value.forEach((raw, index) => {
    const path = `pain[${index}]`;
    if (!isPlainObject(raw)) {
      issue("INVALID_PAIN_ENTRY", "Each pain entry must be an object", path);
      return;
    }
    unknownKeys(raw, PAIN_KEYS, path, warn);

    const report: PainReport = {};
    if (raw.area !== undefined) {
      if (typeof raw.area !== "string") {
        issue("INVALID_PAIN_AREA", "`pain.area` must be a string", `${path}.area`);
        return;
      }
      report.area = raw.area;
    }
    if (raw.level !== undefined) {
      if (!isFiniteNumber(raw.level) || raw.level < 0 || raw.level > 10) {
        issue("INVALID_PAIN_LEVEL", "`pain.level` must be between 0 and 10", `${path}.level`);
        return;
      }
      report.level = raw.level;
    }
    reports.push(report);
  });

  return reports;
}
