import assert from "node:assert/strict";
import { test } from "node:test";

import { analyzeProgress } from "../.pi/extensions/fit-trace/core/analyze.ts";
import { ValidationError } from "../.pi/extensions/fit-trace/core/errors.ts";
import {
  detectFlags,
  exerciseTrends,
  flattenSets,
  summarizeMetrics,
} from "../.pi/extensions/fit-trace/core/metrics.ts";
import { validateWorkoutRecord } from "../.pi/extensions/fit-trace/core/schema.ts";
import type { WorkoutRecord } from "../.pi/extensions/fit-trace/core/types.ts";
import { loadFixture } from "./helpers.ts";

async function history(): Promise<WorkoutRecord[]> {
  const raw = await loadFixture<unknown[]>("history-strength.json");
  return raw.map((entry) => validateWorkoutRecord(entry).record);
}

test("computes volume, reps, sets, and average RPE from a fixed fixture", async () => {
  const metrics = summarizeMetrics(await history());

  assert.equal(metrics.sessions, 3);
  assert.equal(metrics.total_sets, 18);
  assert.equal(metrics.total_reps, 90);
  // (80*15 + 100*15) + (82.5*15 + 102.5*15) + (85*15 + 105*15) = 2700 + 2775 + 2850
  assert.equal(metrics.volume_kg, 8325);
  assert.equal(metrics.avg_rpe, 8);
});

test("computes training intervals from distinct session dates", async () => {
  const metrics = summarizeMetrics(await history());
  assert.equal(metrics.avg_rest_days, 3.5);
  assert.equal(metrics.max_gap_days, 4);
});

test("computes per-exercise estimated-1RM trends", async () => {
  const trends = exerciseTrends(await history());
  assert.deepEqual(trends.map((trend) => trend.exercise), ["bench_press", "squat"]);

  const bench = trends.find((trend) => trend.exercise === "bench_press");
  assert.ok(bench);
  assert.equal(bench.first, 93.33);
  assert.equal(bench.last, 99.17);
  assert.equal(bench.delta_pct, 6.26);
  assert.equal(bench.direction, "up");
});

test("flattens sets deterministically in date order", async () => {
  const flat = flattenSets(await history());
  assert.equal(flat.length, 18);
  assert.equal(flat[0].recordId, "2026-09-01-strength");
  assert.equal(flat[17].recordId, "2026-09-08-strength");
  assert.equal(flat[0].est1rm, 93.33);
});

test("returns zeroed metrics for empty history", () => {
  const metrics = summarizeMetrics([]);
  assert.equal(metrics.sessions, 0);
  assert.equal(metrics.volume_kg, 0);
  assert.equal(metrics.avg_rpe, null);
  assert.equal(metrics.avg_rest_days, 0);
  assert.deepEqual(detectFlags([]), []);
});

test("rejects an invalid analysis filter date with a readable error", async () => {
  const records = await history();
  assert.throws(() => analyzeProgress(records, { from: "not-a-date" }), ValidationError);
});

test("rejects an inverted analysis filter range", async () => {
  const records = await history();
  assert.throws(
    () => analyzeProgress(records, { from: "2026-09-10", to: "2026-09-01" }),
    ValidationError,
  );
});
