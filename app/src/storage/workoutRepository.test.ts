import { describe, expect, it } from "vitest";
import type { WorkoutRecord } from "@pi-fit-trace/core";
import { MemoryStorageAdapter } from "./adapter.ts";
import {
  RECORD_KEY_PREFIX,
  StorageCorruptionError,
  clear,
  loadRecord,
  loadRecords,
  recordKey,
  removeRecord,
  saveRecord,
} from "./workoutRepository.ts";

function validRecord(overrides: Partial<WorkoutRecord> = {}): WorkoutRecord {
  return {
    id: "wkt-1",
    schema_version: 1,
    date: "2026-01-05",
    session_type: "strength",
    exercises: [{ name: "Squat", sets: [{ weight: 100, reps: 5, rpe: 8 }] }],
    ...overrides,
  };
}

describe("workoutRepository", () => {
  it("returns an empty list when storage is empty", () => {
    expect(loadRecords(new MemoryStorageAdapter())).toEqual([]);
  });

  it("round-trips a single record", () => {
    const adapter = new MemoryStorageAdapter();
    saveRecord(adapter, validRecord());

    expect(loadRecords(adapter)).toEqual([validRecord()]);
    expect(loadRecord(adapter, "wkt-1")).toEqual(validRecord());
  });

  it("returns null from loadRecord for an absent id", () => {
    expect(loadRecord(new MemoryStorageAdapter(), "missing")).toBeNull();
  });

  it("loads records sorted by date", () => {
    const adapter = new MemoryStorageAdapter();
    saveRecord(adapter, validRecord({ id: "later", date: "2026-01-07" }));
    saveRecord(adapter, validRecord({ id: "earlier", date: "2026-01-05" }));

    expect(loadRecords(adapter).map((record) => record.id)).toEqual(["earlier", "later"]);
  });

  it("persists across a fresh load from the same adapter", () => {
    const adapter = new MemoryStorageAdapter();
    saveRecord(adapter, validRecord({ id: "a" }));
    saveRecord(adapter, validRecord({ id: "b", date: "2026-01-07" }));

    const reloaded = loadRecords(adapter);
    expect(reloaded.map((record) => record.id)).toEqual(["a", "b"]);
  });

  it("stores each record under its own prefixed key", () => {
    const adapter = new MemoryStorageAdapter();
    saveRecord(adapter, validRecord());
    expect(adapter.keys(RECORD_KEY_PREFIX)).toEqual([recordKey("wkt-1")]);
  });

  it("throws StorageCorruptionError for malformed JSON and names the key", () => {
    const adapter = new MemoryStorageAdapter();
    adapter.write(recordKey("bad"), "{not json");

    try {
      loadRecords(adapter);
      throw new Error("expected loadRecords to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(StorageCorruptionError);
      expect((error as StorageCorruptionError).key).toBe(recordKey("bad"));
      expect((error as StorageCorruptionError).message).toContain(recordKey("bad"));
    }
  });

  it("throws StorageCorruptionError for an invalid stored record", () => {
    const adapter = new MemoryStorageAdapter();
    adapter.write(
      recordKey("invalid"),
      JSON.stringify({ id: "", date: "not-a-date", session_type: "strength", exercises: [] }),
    );

    try {
      loadRecords(adapter);
      throw new Error("expected loadRecords to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(StorageCorruptionError);
      expect((error as StorageCorruptionError).message).toContain("invalid");
    }
  });

  it("removes one record by id", () => {
    const adapter = new MemoryStorageAdapter();
    saveRecord(adapter, validRecord({ id: "a" }));
    saveRecord(adapter, validRecord({ id: "b", date: "2026-01-07" }));

    removeRecord(adapter, "a");

    expect(loadRecords(adapter).map((record) => record.id)).toEqual(["b"]);
  });

  it("clears every stored record", () => {
    const adapter = new MemoryStorageAdapter();
    saveRecord(adapter, validRecord({ id: "a" }));
    saveRecord(adapter, validRecord({ id: "b", date: "2026-01-07" }));

    clear(adapter);

    expect(adapter.keys(RECORD_KEY_PREFIX)).toEqual([]);
    expect(loadRecords(adapter)).toEqual([]);
  });
});
