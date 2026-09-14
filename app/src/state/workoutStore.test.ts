import { describe, expect, it } from "vitest";
import type { WorkoutRecord } from "@pi-fit-trace/core";
import { deriveWorkoutId } from "../contracts/ids.ts";
import { MemoryStorageAdapter, StorageUnavailableError } from "../storage/adapter.ts";
import type { StorageAdapter } from "../storage/adapter.ts";
import { loadRecords, RECORD_KEY_PREFIX, saveRecord } from "../storage/workoutRepository.ts";
import { WorkoutConflictError, createWorkoutStore } from "./workoutStore.ts";

function record(overrides: Partial<WorkoutRecord> = {}): WorkoutRecord {
  return {
    id: "incoming-id",
    schema_version: 1,
    date: "2026-01-05",
    session_type: "strength",
    exercises: [{ name: "Squat", sets: [{ weight: 100, reps: 5, rpe: 8 }] }],
    ...overrides,
  };
}

describe("createWorkoutStore", () => {
  it("validates, assigns schema_version and derives the id", () => {
    const store = createWorkoutStore(new MemoryStorageAdapter());
    const stored = store.add(record());

    expect(stored.schema_version).toBe(1);
    expect(stored.id).toBe(deriveWorkoutId(record()));
    expect(store.list()).toHaveLength(1);
  });

  it("derives the id for a draft that has no id", () => {
    const store = createWorkoutStore(new MemoryStorageAdapter());
    const draft = {
      schema_version: 1,
      date: "2026-01-05",
      session_type: "strength",
      exercises: [{ name: "Squat", sets: [{ weight: 100, reps: 5, rpe: 8 }] }],
    };

    const stored = store.add(draft);

    expect(stored.id).toBe(deriveWorkoutId(record()));
    expect(store.list()).toHaveLength(1);
  });

  it("treats an identical duplicate add as a no-op", () => {
    const store = createWorkoutStore(new MemoryStorageAdapter());
    const first = store.add(record());
    const second = store.add(record());

    expect(second.id).toBe(first.id);
    expect(store.list()).toHaveLength(1);
  });

  it("throws WorkoutConflictError for the same id with different content", () => {
    const adapter = new MemoryStorageAdapter();
    const input = record();
    const derivedId = deriveWorkoutId(input);

    // Simulate a persisted record with the same key but different content.
    saveRecord(adapter, { ...input, id: derivedId, notes: "tampered" });

    const store = createWorkoutStore(adapter);
    expect(() => store.add(input)).toThrow(WorkoutConflictError);
  });

  it("returns defensive copies from list()", () => {
    const store = createWorkoutStore(new MemoryStorageAdapter());
    store.add(record({ notes: "original" }));

    const [returned] = store.list();
    returned.notes = "mutated";
    returned.exercises[0]!.sets[0]!.weight = 999;

    const [again] = store.list();
    expect(again.notes).toBe("original");
    expect(again.exercises[0]!.sets[0]!.weight).toBe(100);
  });

  it("returns a deeply frozen snapshot that stays reference-stable between changes", () => {
    const store = createWorkoutStore(new MemoryStorageAdapter());
    store.add(record({ notes: "original" }));

    const before = store.getSnapshot();
    expect(store.getSnapshot()).toBe(before);

    expect(Object.isFrozen(before)).toBe(true);
    expect(Object.isFrozen(before[0])).toBe(true);
    expect(Object.isFrozen(before[0]!.exercises)).toBe(true);
    expect(Object.isFrozen(before[0]!.exercises[0])).toBe(true);
    expect(Object.isFrozen(before[0]!.exercises[0]!.sets)).toBe(true);
    expect(Object.isFrozen(before[0]!.exercises[0]!.sets[0])).toBe(true);

    expect(() => {
      (before[0] as WorkoutRecord).notes = "mutated";
    }).toThrow(TypeError);

    store.add(record({ date: "2026-02-01" }));
    const after = store.getSnapshot();
    expect(after).not.toBe(before);
    expect(store.getSnapshot()).toBe(after);
  });

  it("does not lose writes when two stores share one adapter", () => {
    const adapter = new MemoryStorageAdapter();
    const first = createWorkoutStore(adapter);
    const second = createWorkoutStore(adapter);

    const a = first.add(record({ date: "2026-01-05", notes: "first" }));
    const b = second.add(record({ date: "2026-01-07", notes: "second" }));

    // Both records survive in storage — the second add did not clobber the first.
    const persistedIds = loadRecords(adapter)
      .map((entry) => entry.id)
      .sort();
    expect(persistedIds).toEqual([a.id, b.id].sort());
    expect(loadRecords(adapter)).toHaveLength(2);

    // A fresh store sees both.
    const fresh = createWorkoutStore(adapter);
    expect(
      fresh
        .list()
        .map((entry) => entry.id)
        .sort(),
    ).toEqual([a.id, b.id].sort());
  });

  it("notifies subscribers only on real change", () => {
    const store = createWorkoutStore(new MemoryStorageAdapter());
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });

    store.add(record());
    expect(calls).toBe(1);

    store.add(record()); // identical duplicate
    expect(calls).toBe(1);

    unsubscribe();
    store.add(record({ date: "2026-01-08" }));
    expect(calls).toBe(1);
  });

  it("persists records across store instances sharing an adapter", () => {
    const adapter = new MemoryStorageAdapter();
    const first = createWorkoutStore(adapter);
    const stored = first.add(record());

    const second = createWorkoutStore(adapter);
    expect(second.list().map((entry) => entry.id)).toEqual([stored.id]);
  });

  it("refreshes stale state when a retry finds an already-persisted record", () => {
    const base = new MemoryStorageAdapter();
    let reads = 0;
    let broken = true;

    const flaky: StorageAdapter = {
      keys: (prefix) => base.keys(prefix),
      read: (key) => {
        reads += 1;
        // The first read (loadRecord) succeeds; the refresh read then fails.
        if (broken && reads > 1) {
          throw new StorageUnavailableError("Unable to read workout storage.");
        }
        return base.read(key);
      },
      write: (key, value) => base.write(key, value),
      remove: (key) => base.remove(key),
    };

    const store = createWorkoutStore(flaky); // no keys yet, so no reads

    // Write succeeds but the refresh read fails, so add() throws.
    expect(() => store.add(record())).toThrow(StorageUnavailableError);
    expect(base.keys(RECORD_KEY_PREFIX)).toHaveLength(1); // it did persist
    expect(store.getSnapshot()).toHaveLength(0); // ...but state is stale

    // Storage recovers: the retry must reconcile the stale in-memory state.
    broken = false;
    store.add(record());

    expect(store.list()).toHaveLength(1);
    expect(store.getSnapshot()).toHaveLength(1);
  });

  it("never overwrites existing data when storage reads fail", () => {
    const base = new MemoryStorageAdapter();
    const existing = record();
    saveRecord(base, existing);
    let writeCalls = 0;

    const flaky: StorageAdapter = {
      keys: (prefix) => base.keys(prefix),
      read: () => {
        throw new StorageUnavailableError("Unable to read workout storage.");
      },
      write: (key, value) => {
        writeCalls += 1;
        base.write(key, value);
      },
      remove: (key) => base.remove(key),
    };

    // A failed read must surface, never be treated as an empty store.
    expect(() => createWorkoutStore(flaky)).toThrow(StorageUnavailableError);
    expect(writeCalls).toBe(0);
    expect(loadRecords(base)).toEqual([existing]);
  });
});
