import { CURRENT_SCHEMA_VERSION, validateWorkoutRecord } from "@pi-fit-trace/core";
import type { WorkoutRecord } from "@pi-fit-trace/core";
import type { WorkoutExportFile } from "./contracts.ts";

/**
 * Serialize records into the `workout.json` exchange format.
 *
 * Deterministic and idempotent by construction: no timestamps, clock, or
 * randomness are involved, and record key order/order-of-array are preserved.
 * Every record is re-validated first, so an invalid record throws and nothing
 * is produced (we never export something the Extension would reject).
 */
export function serializeWorkoutExport(records: readonly WorkoutRecord[]): string {
  const validated = records.map((record) => validateWorkoutRecord(record).record);

  const file: WorkoutExportFile = {
    schema_version: CURRENT_SCHEMA_VERSION,
    records: validated,
  };

  return `${JSON.stringify(file, null, 2)}\n`;
}
