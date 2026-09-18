import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION, ValidationError, validateWorkoutRecord } from "@pi-fit-trace/core";
import type { WorkoutRecord } from "@pi-fit-trace/core";
import { serializeWorkoutExport } from "./workoutExport.ts";
import type { WorkoutExportFile } from "./contracts.ts";

function record(overrides: Partial<WorkoutRecord> = {}): WorkoutRecord {
  return {
    id: "wkt_a",
    schema_version: 1,
    date: "2026-01-05",
    session_type: "strength",
    exercises: [{ name: "Squat", sets: [{ weight: 100, reps: 5, rpe: 8 }] }],
    ...overrides,
  };
}

describe("serializeWorkoutExport", () => {
  it("serializes to the documented exchange shape", () => {
    const output = serializeWorkoutExport([record(), record({ id: "wkt_b", date: "2026-01-07" })]);
    const parsed = JSON.parse(output) as WorkoutExportFile;

    expect(parsed.schema_version).toBe(CURRENT_SCHEMA_VERSION);
    expect(parsed.records).toHaveLength(2);
    expect(parsed.records.map((entry) => entry.id)).toEqual(["wkt_a", "wkt_b"]);
    expect(output.endsWith("\n")).toBe(true);
  });

  it("is byte-identical for the same records (idempotent, no clock or randomness)", () => {
    const records = [record(), record({ id: "wkt_b", date: "2026-01-07" })];

    const first = serializeWorkoutExport(records);
    const second = serializeWorkoutExport(records);

    expect(first).toBe(second);
  });

  it("emits records that each pass validateWorkoutRecord", () => {
    const output = serializeWorkoutExport([record(), record({ id: "wkt_b", date: "2026-01-07" })]);
    const parsed = JSON.parse(output) as WorkoutExportFile;

    for (const entry of parsed.records) {
      expect(() => validateWorkoutRecord(entry)).not.toThrow();
    }
  });

  it("throws and produces nothing when a record is invalid", () => {
    const invalid = record({
      exercises: [{ name: "Squat", sets: [{ weight: -10, reps: 5 }] }],
    });

    expect(() => serializeWorkoutExport([invalid])).toThrow(ValidationError);
  });
});
