import { useCallback, useState } from "react";
import type { WorkoutRecord } from "@pi-fit-trace/core";
import { downloadJson } from "./fileTransport.ts";
import { serializeWorkoutExport } from "./workoutExport.ts";

export interface WorkoutExport {
  /** Serialize the records and download them as `workout.json`. */
  exportWorkouts: () => void;
  /** Message from the last failed export attempt, or `null`. */
  error: string | null;
}

/**
 * Return an action that exports the given records as `workout.json`, plus the
 * error from the most recent attempt.
 *
 * Both serialization (an invalid record) and the download itself (browser
 * download APIs unavailable) can fail, so failures are caught here and exposed
 * to the caller rather than escaping silently.
 */
export function useWorkoutExport(records: readonly WorkoutRecord[]): WorkoutExport {
  const [error, setError] = useState<string | null>(null);

  const exportWorkouts = useCallback(() => {
    try {
      downloadJson("workout.json", serializeWorkoutExport(records));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [records]);

  return { exportWorkouts, error };
}
