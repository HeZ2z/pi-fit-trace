import { CURRENT_SCHEMA_VERSION, stableStringify, validateWorkoutRecord } from "@pi-fit-trace/core";
import type { WorkoutRecord } from "@pi-fit-trace/core";
import { deriveWorkoutId } from "../contracts/ids.ts";
import { loadRecord, loadRecords, saveRecord } from "../storage/workoutRepository.ts";
import type { StorageAdapter } from "../storage/adapter.ts";

/** Raised when a derived id already exists with different content. */
export class WorkoutConflictError extends Error {
  code = "CONFLICT";
  existingId: string;

  constructor(id: string) {
    super(`A workout with id "${id}" already exists with different content.`);
    this.name = "WorkoutConflictError";
    this.existingId = id;
  }
}

/** Observable, append-only workout store. */
export interface WorkoutStore {
  /** Fresh mutable copies; safe to mutate without affecting stored state. */
  list(): WorkoutRecord[];
  add(input: unknown): WorkoutRecord;
  subscribe(listener: () => void): () => void;
  /** Deeply frozen, reference-stable snapshot for external stores. */
  getSnapshot(): readonly WorkoutRecord[];
}

/** JSON-safe deep copy so callers cannot mutate stored state by reference. */
function cloneRecord(record: WorkoutRecord): WorkoutRecord {
  return JSON.parse(JSON.stringify(record)) as WorkoutRecord;
}

/** Recursively freeze a value in place, returning it for convenience. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The store owns the id, so a draft without one is valid input. A caller-supplied
 * id is ignored because ids are derived from content.
 */
function withPlaceholderId(input: unknown): unknown {
  if (isPlainObject(input) && typeof input.id === "string" && input.id.trim() !== "") {
    return input;
  }
  if (isPlainObject(input)) return { ...input, id: "pending" };
  return input;
}

/**
 * Create a workout store backed by `adapter`.
 *
 * The store is append-only by construction: it exposes no update or delete
 * operation, and `list()` returns defensive copies. Each add writes exactly one
 * per-record key and then reloads the full list from storage, so concurrent
 * store instances sharing one adapter never clobber each other. Adds are
 * idempotent by derived id — identical content is a no-op, differing content
 * throws {@link WorkoutConflictError}.
 */
export function createWorkoutStore(adapter: StorageAdapter): WorkoutStore {
  let records: WorkoutRecord[] = loadRecords(adapter);
  let snapshot: readonly WorkoutRecord[] = deepFreeze(records.map(cloneRecord));
  const listeners = new Set<() => void>();

  /**
   * Reload from storage. Only rebuilds the snapshot and notifies when the
   * record set actually changed, so the snapshot reference stays stable and
   * subscribers are not woken for no-op reads.
   */
  function refresh(): void {
    const next = loadRecords(adapter);
    if (stableStringify(next) === stableStringify(records)) return;
    records = next;
    snapshot = deepFreeze(records.map(cloneRecord));
    for (const listener of listeners) listener();
  }

  function list(): WorkoutRecord[] {
    return records.map(cloneRecord);
  }

  function getSnapshot(): readonly WorkoutRecord[] {
    return snapshot;
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function add(input: unknown): WorkoutRecord {
    const validated = validateWorkoutRecord(withPlaceholderId(input)).record;
    const stored: WorkoutRecord = {
      ...validated,
      schema_version: CURRENT_SCHEMA_VERSION,
      id: deriveWorkoutId(validated),
    };

    // Read only this record's key: never a shared read-modify-write.
    const existing = loadRecord(adapter, stored.id);
    if (existing !== null) {
      if (stableStringify(existing) === stableStringify(stored)) {
        // A previous attempt may have persisted this record and then failed
        // while refreshing. Reload so a successful retry cannot leave the
        // in-memory snapshot stale.
        refresh();
        return cloneRecord(existing);
      }
      throw new WorkoutConflictError(stored.id);
    }

    // Persist the single record, then reload so writes from other instances
    // are incorporated. A failed write never advances in-memory state.
    saveRecord(adapter, stored);
    refresh();
    return cloneRecord(stored);
  }

  return { list, add, subscribe, getSnapshot };
}
