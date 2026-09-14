import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { WorkoutRecord } from "@pi-fit-trace/core";
import { MemoryStorageAdapter } from "../storage/adapter.ts";
import { saveRecord } from "../storage/workoutRepository.ts";
import { WorkoutStoreProvider } from "../state/WorkoutStoreContext.tsx";
import { HistoryScreen } from "./HistoryScreen.tsx";

function record(overrides: Partial<WorkoutRecord> = {}): WorkoutRecord {
  return {
    id: "wkt_a",
    schema_version: 1,
    date: "2026-01-05",
    session_type: "strength",
    exercises: [
      {
        name: "Squat",
        sets: [
          { weight: 100, reps: 5, rpe: 8 },
          { weight: 100, reps: 5, rpe: 8 },
        ],
      },
    ],
    ...overrides,
  };
}

function renderHistory(adapter: MemoryStorageAdapter) {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <WorkoutStoreProvider adapter={adapter}>
        <Routes>
          <Route path="/" element={<HistoryScreen />} />
          <Route path="/workout/:id" element={<div data-testid="summary" />} />
          <Route path="/workout/new" element={<div data-testid="editor" />} />
        </Routes>
      </WorkoutStoreProvider>
    </MemoryRouter>,
  );
}

describe("HistoryScreen", () => {
  it("shows an empty state with a link to the editor", () => {
    renderHistory(new MemoryStorageAdapter());

    expect(
      screen.getByRole("heading", { level: 1, name: /workout history/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/no workouts yet/i)).toBeInTheDocument();

    const link = screen.getByRole("link", { name: /log your first workout/i });
    expect(link).toHaveAttribute("href", "/workout/new");
  });

  it("renders stored records with date, session type, and a summary", () => {
    const adapter = new MemoryStorageAdapter();
    saveRecord(adapter, record());
    saveRecord(
      adapter,
      record({
        id: "wkt_b",
        date: "2026-01-07",
        session_type: "cardio",
        exercises: [{ name: "Row", sets: [{ weight: 80, reps: 10, rpe: 7 }] }],
      }),
    );

    renderHistory(adapter);

    expect(screen.getByText(/2026-01-05/)).toBeInTheDocument();
    expect(screen.getByText(/2026-01-07/)).toBeInTheDocument();
    expect(screen.getByText(/2 sets · 1000 kg · avg RPE 8/)).toBeInTheDocument();
    expect(screen.getByText(/1 set · 800 kg · avg RPE 7/)).toBeInTheDocument();
  });

  it("links each row to the right workout", () => {
    const adapter = new MemoryStorageAdapter();
    saveRecord(adapter, record());
    saveRecord(adapter, record({ id: "wkt_b", date: "2026-01-07" }));

    renderHistory(adapter);

    expect(screen.getByRole("link", { name: /2026-01-05/ })).toHaveAttribute(
      "href",
      "/workout/wkt_a",
    );
    expect(screen.getByRole("link", { name: /2026-01-07/ })).toHaveAttribute(
      "href",
      "/workout/wkt_b",
    );
  });

  it("renders avg RPE as n/a when no RPE values are recorded", () => {
    const adapter = new MemoryStorageAdapter();
    saveRecord(
      adapter,
      record({
        exercises: [{ name: "Squat", sets: [{ weight: 100, reps: 5 }] }],
      }),
    );

    renderHistory(adapter);

    expect(screen.getByText(/avg RPE n\/a/)).toBeInTheDocument();
  });
});
