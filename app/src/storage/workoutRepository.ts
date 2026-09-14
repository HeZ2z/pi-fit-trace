import {
  ValidationError,
  sortRecords,
  validateWorkoutRecord,
} from "@pi-fit-trace/core";
import type { WorkoutRecord } from "@pi-fit-trace/core";
import type { StorageAdapter } from "./adapter.ts";

/**
 * Records are stored one key per workout rather than as a single envelope.
 *
 * This is the core of the race fix: `add` only ever writes its own key and
 * never read-modify-writes a shared value, so two store instances backed by the
 * same storage cannot clobber each other's history.
 */
export const RECORD_KEY_PREFIX = "pi-fit-trace:workout:v1:";

/** Storage key for a single workout record. */
export function recordKey(id: string): string {
  return `${RECORD_KEY_PREFIX}${id}`;
}

/**
 * Raised when persisted data is malformed or contains a record that no longer
 * validates. Mirrors the Extension's `CORRUPT_STORE` contract and names the
 * offending key (or index when materializing a list).
 */
export class StorageCorruptionError extends Error {
  code = "CORRUPT_STORE";
  recordIndex: number;
  key: string | null;

  constructor(reason: string, options: { index?: number; key?: string } = {}) {
    const index = options.index ?? -1;
    const key = options.key ?? null;
    let message: string;
    if (key !== null) {
      message = `Stored workout record at key "${key}" is invalid: ${reason}`;
    } else if (index >= 0) {
      message = `Stored workout record at index ${index} is invalid: ${reason}`;
    } else {
      message = `Corrupt workout store: ${reason}`;
    }
    super(message);
    this.name = "StorageCorruptionError";
    this.recordIndex = index;
    this.key = key;
  }
}

function validationReason(error: unknown): string {
  if (error instanceof ValidationError) {
    return error.issues.map((issue) => issue.message).join("; ");
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

function parseRecord(raw: string, context: { index?: number; key: string }): WorkoutRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new StorageCorruptionError("record contains invalid JSON", context);
  }
  try {
    return validateWorkoutRecord(parsed).record;
  } catch (error) {
    throw new StorageCorruptionError(validationReason(error), context);
  }
}

/**
 * Load every stored record, re-validating each and sorting deterministically.
 *
 * Missing storage yields `[]`. Malformed JSON or an invalid record throws
 * {@link StorageCorruptionError} rather than surfacing misleading data.
 */
export function loadRecords(adapter: StorageAdapter): WorkoutRecord[] {
  const keys = adapter.keys(RECORD_KEY_PREFIX);
  const records = keys.map((key, index) => {
    const raw = adapter.read(key);
    if (raw === null || raw.trim() === "") {
      throw new StorageCorruptionError("record is empty", { index, key });
    }
    return parseRecord(raw, { index, key });
  });
  return sortRecords(records);
}

/** Load a single record by id, or `null` when it is not stored. */
export function loadRecord(adapter: StorageAdapter, id: string): WorkoutRecord | null {
  const key = recordKey(id);
  const raw = adapter.read(key);
  if (raw === null || raw.trim() === "") return null;
  return parseRecord(raw, { key });
}

/** Persist exactly one record under its own key. */
export function saveRecord(adapter: StorageAdapter, record: WorkoutRecord): void {
  adapter.write(recordKey(record.id), `${JSON.stringify(record, null, 2)}\n`);
}

/** Remove a single record by id. */
export function removeRecord(adapter: StorageAdapter, id: string): void {
  adapter.remove(recordKey(id));
}

/** Remove every stored workout record. */
export function clear(adapter: StorageAdapter): void {
  for (const key of adapter.keys(RECORD_KEY_PREFIX)) {
    adapter.remove(key);
  }
}
