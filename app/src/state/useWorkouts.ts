import { useSyncExternalStore } from "react";
import type { WorkoutRecord } from "@pi-fit-trace/core";
import { useWorkoutStore } from "./WorkoutStoreContext.tsx";

export interface UseWorkoutsResult {
  records: readonly WorkoutRecord[];
  add: (input: unknown) => WorkoutRecord;
}

/**
 * Subscribe to the workout store provided by `<WorkoutStoreProvider>`.
 *
 * Returns a stable `records` snapshot between changes and an `add` action.
 */
export function useWorkouts(): UseWorkoutsResult {
  const store = useWorkoutStore();

  const records = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  return { records, add: store.add };
}
