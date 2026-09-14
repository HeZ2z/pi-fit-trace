import { useMemo, useSyncExternalStore } from "react";
import type { WorkoutRecord } from "@pi-fit-trace/core";
import { LocalStorageAdapter } from "../storage/adapter.ts";
import type { StorageAdapter } from "../storage/adapter.ts";
import { createWorkoutStore } from "./workoutStore.ts";
import type { WorkoutStore } from "./workoutStore.ts";

export interface UseWorkoutsResult {
  records: readonly WorkoutRecord[];
  add: (input: unknown) => WorkoutRecord;
}

let defaultStore: WorkoutStore | null = null;

/** Shared browser store; only created on first use. */
function getDefaultStore(): WorkoutStore {
  if (defaultStore === null) {
    defaultStore = createWorkoutStore(new LocalStorageAdapter());
  }
  return defaultStore;
}

/**
 * Subscribe to the workout store.
 *
 * Returns a stable `records` snapshot between changes and an `add` action.
 * Pass an adapter in tests (e.g. {@link MemoryStorageAdapter}); the default
 * uses `localStorage`.
 */
export function useWorkouts(adapter?: StorageAdapter): UseWorkoutsResult {
  const store = useMemo(
    () => (adapter !== undefined ? createWorkoutStore(adapter) : getDefaultStore()),
    [adapter],
  );

  const records = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  return { records, add: store.add };
}
