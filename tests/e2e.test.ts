import assert from "node:assert/strict";
import { test } from "node:test";

import { analyzeProgress } from "../.pi/extensions/fit-trace/core/analyze.ts";
import { generateNextPlan } from "../.pi/extensions/fit-trace/core/plan.ts";
import { validateWorkoutRecord } from "../.pi/extensions/fit-trace/core/schema.ts";
import { MemoryStorage, WorkoutStore } from "../.pi/extensions/fit-trace/core/store.ts";
import { loadFixture } from "./helpers.ts";

test("end-to-end: import -> history -> analyze -> draft plan, without mutating records", async () => {
  const store = new WorkoutStore(new MemoryStorage());
  const raw = await loadFixture<unknown[]>("history-strength.json");

  for (const entry of raw) {
    const { record, warnings } = validateWorkoutRecord(entry);
    assert.deepEqual(warnings, []);
    await store.import(record);
  }

  const history = await store.query({});
  assert.equal(history.total, 3);

  const snapshot = structuredClone(await store.all());

  const analysis = analyzeProgress(history.records, {});
  assert.equal(analysis.metrics.sessions, 3);
  assert.equal(analysis.metrics.volume_kg, 8325);
  assert.equal(analysis.metrics.avg_rpe, 8);
  assert.deepEqual(analysis.source_records, [
    "2026-09-01-strength",
    "2026-09-04-strength",
    "2026-09-08-strength",
  ]);

  const draft = generateNextPlan(history.records, { goal: "strength" });
  assert.equal(draft.is_draft, true);
  assert.equal(draft.requires_confirmation, true);
  assert.equal(draft.based_on.sessions, 3);
  assert.ok(draft.recommendations.length > 0);
  for (const recommendation of draft.recommendations) {
    assert.ok(recommendation.reason.length > 0, "every recommendation must carry a reason");
  }

  assert.deepEqual(await store.all(), snapshot, "plan generation must not modify stored records");
});

test("the same fixture always produces the same analysis (determinism)", async () => {
  const raw = await loadFixture<unknown[]>("history-strength.json");
  const records = raw.map((entry) => validateWorkoutRecord(entry).record);

  const first = analyzeProgress(records, {});
  const second = analyzeProgress(records, {});

  assert.deepEqual(first, second);
});
