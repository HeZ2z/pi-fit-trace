import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { WorkoutRecord } from "@pi-fit-trace/core";
import { MemoryStorageAdapter } from "../storage/adapter.ts";
import { saveRecord } from "../storage/workoutRepository.ts";
import { WorkoutStoreProvider } from "../state/WorkoutStoreContext.tsx";
import { WorkoutSummaryScreen } from "./WorkoutSummaryScreen.tsx";

function richRecord(overrides: Partial<WorkoutRecord> = {}): WorkoutRecord {
  return {
    id: "wkt_sum_1",
    schema_version: 1,
    date: "2026-02-01",
    session_type: "strength",
    duration_minutes: 60,
    sleep_hours: 7.5,
    notes: "Felt strong",
    exercises: [
      { name: "Deadlift", sets: [{ weight: 150, reps: 3, rpe: 9 }] },
      { name: "Plank", sets: [{ reps: 60 }] },
    ],
    pain: [{ area: "low back", level: 4 }],
    ...overrides,
  };
}

function renderSummary(adapter: MemoryStorageAdapter, id: string) {
  return render(
    <MemoryRouter initialEntries={[`/workout/${id}`]}>
      <WorkoutStoreProvider adapter={adapter}>
        <Routes>
          <Route path="/workout/:id" element={<WorkoutSummaryScreen />} />
          <Route path="/" element={<div>history</div>} />
        </Routes>
      </WorkoutStoreProvider>
    </MemoryRouter>,
  );
}

describe("WorkoutSummaryScreen", () => {
  it("renders a stored record's details, exercises, sets, and metrics", () => {
    const adapter = new MemoryStorageAdapter();
    saveRecord(adapter, richRecord());

    renderSummary(adapter, "wkt_sum_1");

    expect(screen.getByRole("heading", { level: 1, name: /workout summary/i })).toBeInTheDocument();
    expect(screen.getByText("2026-02-01")).toBeInTheDocument();
    expect(screen.getByText("strength")).toBeInTheDocument();
    expect(screen.getByText("60 minutes")).toBeInTheDocument();
    expect(screen.getByText("7.5 hours")).toBeInTheDocument();
    expect(screen.getByText("Felt strong")).toBeInTheDocument();

    expect(screen.getByText("Deadlift")).toBeInTheDocument();
    expect(screen.getByText("Plank")).toBeInTheDocument();
    expect(screen.getByText("150 kg × 3 reps · RPE 9")).toBeInTheDocument();
    expect(screen.getByText("weight n/a × 60 reps · RPE n/a")).toBeInTheDocument();

    expect(screen.getByText("Sets: 2")).toBeInTheDocument();
    expect(screen.getByText("Volume: 450 kg")).toBeInTheDocument();
    expect(screen.getByText("Average RPE: 9")).toBeInTheDocument();
  });

  it("renders a not-found state for an unknown id", () => {
    renderSummary(new MemoryStorageAdapter(), "does-not-exist");

    expect(screen.getByRole("heading", { level: 1, name: /workout not found/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to history/i })).toHaveAttribute("href", "/");
  });

  it("flags pain and extreme RPE via data-safety markers", () => {
    const adapter = new MemoryStorageAdapter();
    saveRecord(adapter, richRecord());

    const { container } = renderSummary(adapter, "wkt_sum_1");

    expect(container.querySelector('[data-safety="extreme-rpe"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-safety="pain"]')).toHaveLength(1);
  });

  it("shows validation warnings as non-blocking notices", () => {
    const adapter = new MemoryStorageAdapter();
    saveRecord(
      adapter,
      richRecord({
        exercises: [{ name: "Squat", sets: [{ weight: 0, reps: 10, rpe: 7 }] }],
        pain: undefined,
      }),
    );

    renderSummary(adapter, "wkt_sum_1");

    const warnings = screen.getByRole("status", { name: /warnings/i });
    expect(warnings).toHaveTextContent(/0 kg/i);
  });
});
