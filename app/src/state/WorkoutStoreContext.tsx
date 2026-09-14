import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { LocalStorageAdapter } from "../storage/adapter.ts";
import type { StorageAdapter } from "../storage/adapter.ts";
import { createWorkoutStore } from "./workoutStore.ts";
import type { WorkoutStore } from "./workoutStore.ts";

const WorkoutStoreContext = createContext<WorkoutStore | null>(null);

export interface WorkoutStoreProviderProps {
  adapter?: StorageAdapter;
  children: ReactNode;
}

type ResolvedStore =
  | { store: WorkoutStore; error: null }
  | { store: null; error: Error };

/**
 * Fallback rendered when the store cannot be initialized, e.g. blocked
 * `localStorage` or a corrupt stored record. Recoverable: the user can retry
 * once the underlying problem is fixed.
 */
function StoreInitError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div role="alert" className="store-init-error" data-testid="store-init-error">
      <h1>Workout storage is unavailable</h1>
      <p>pi-fit-trace could not read your local workout data, so it cannot start safely.</p>
      <p className="store-init-error-detail">{error.message}</p>
      <button type="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

/**
 * Provide a single workout store to the subtree.
 *
 * Initialization failures (blocked `localStorage`, a corrupt stored record) are
 * caught here and rendered as a recoverable error screen instead of crashing
 * every screen. Pass an adapter to make screens testable in isolation (e.g.
 * `MemoryStorageAdapter`); the default is `localStorage`.
 */
export function WorkoutStoreProvider({ adapter, children }: WorkoutStoreProviderProps) {
  const [attempt, setAttempt] = useState(0);

  const resolved = useMemo<ResolvedStore>(() => {
    try {
      return { store: createWorkoutStore(adapter ?? new LocalStorageAdapter()), error: null };
    } catch (error) {
      return { store: null, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }, [adapter, attempt]);

  if (resolved.store === null) {
    return <StoreInitError error={resolved.error} onRetry={() => setAttempt((n) => n + 1)} />;
  }

  return (
    <WorkoutStoreContext.Provider value={resolved.store}>{children}</WorkoutStoreContext.Provider>
  );
}

/** Read the provided workout store, failing loudly outside a provider. */
export function useWorkoutStore(): WorkoutStore {
  const store = useContext(WorkoutStoreContext);
  if (store === null) {
    throw new Error("useWorkoutStore must be used within a <WorkoutStoreProvider>.");
  }
  return store;
}
