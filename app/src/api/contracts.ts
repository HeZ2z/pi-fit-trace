import type { WorkoutRecord } from "@pi-fit-trace/core";

/** Versioned payload exchanged as a `workout.json` file. */
export interface WorkoutExportFile {
  schema_version: number;
  records: WorkoutRecord[];
}

/**
 * Raised when a pi response cannot be trusted.
 *
 * The message always names the offending field so callers can surface a
 * readable error instead of crashing on a shape mismatch.
 */
export class MalformedResponseError extends Error {
  code = "MALFORMED_RESPONSE";
  field: string;

  constructor(field: string, reason: string) {
    super(`Malformed response: \`${field}\` ${reason}.`);
    this.name = "MalformedResponseError";
    this.field = field;
  }
}
