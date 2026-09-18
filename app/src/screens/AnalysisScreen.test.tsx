import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisResult, WorkoutRecord } from "@pi-fit-trace/core";
import { readTextFile } from "../api/fileTransport.ts";
import { MemoryStorageAdapter } from "../storage/adapter.ts";
import { saveRecord } from "../storage/workoutRepository.ts";
import { WorkoutStoreProvider } from "../state/WorkoutStoreContext.tsx";
import { AnalysisScreen } from "./AnalysisScreen.tsx";

vi.mock("../api/fileTransport.ts", () => ({
  downloadJson: vi.fn(),
  readTextFile: vi.fn(),
}));

const readTextFileMock = vi.mocked(readTextFile);

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

const importedAnalysis: AnalysisResult = {
  period: { from: "2026-01-01", to: "2026-01-31" },
  metrics: {
    sessions: 7,
    total_sets: 21,
    total_reps: 105,
    volume_kg: 9999,
    avg_rpe: 7.5,
    avg_rest_days: 3,
    max_gap_days: 5,
  },
  trends: [
    {
      exercise: "Bench Press",
      metric: "est_1rm_kg",
      sessions_compared: 3,
      first: 90,
      last: 100,
      delta: 10,
      delta_pct: 11.11,
      direction: "up",
    },
  ],
  flags: [
    {
      code: "EXTREME_RPE",
      severity: "critical",
      message: "Imported flag.",
      evidence: { max_rpe: 10 },
    },
  ],
  source_records: ["wkt_x", "wkt_y"],
};

/** The file body is irrelevant: `readTextFile` is mocked. */
function analysisFile(name = "analysis.json"): File {
  return new File(['{"unused":true}'], name, { type: "application/json" });
}

function renderAnalysis(adapter: MemoryStorageAdapter) {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={["/analysis"]}>
      <WorkoutStoreProvider adapter={adapter}>
        <Routes>
          <Route path="/analysis" element={<AnalysisScreen />} />
          <Route path="/workout/new" element={<div data-testid="editor" />} />
        </Routes>
      </WorkoutStoreProvider>
    </MemoryRouter>,
  );
  return { user, ...view };
}

describe("AnalysisScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows an empty state when there is no history", () => {
    renderAnalysis(new MemoryStorageAdapter());

    expect(screen.getByText(/no workout history to analyse yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /log your first workout/i })).toHaveAttribute(
      "href",
      "/workout/new",
    );
    expect(screen.queryByText(/^Sessions:/)).not.toBeInTheDocument();
  });

  it("renders metrics, trends, and flags with evidence from local records", () => {
    const adapter = new MemoryStorageAdapter();
    saveRecord(adapter, record());
    saveRecord(
      adapter,
      record({
        id: "wkt_b",
        date: "2026-01-07",
        exercises: [{ name: "Squat", sets: [{ weight: 110, reps: 5, rpe: 8 }] }],
      }),
    );

    const { container } = renderAnalysis(adapter);

    expect(screen.getByText(/Sessions: 2/)).toBeInTheDocument();
    expect(screen.getByText(/volume: 1050 kg/i)).toBeInTheDocument();
    expect(container.querySelector('[data-trend-exercise="Squat"]')).not.toBeNull();
    expect(container.querySelector('[data-flag-code="MISSING_RECOVERY_DATA"]')).not.toBeNull();
  });

  it("keeps the local analysis when an import is malformed", async () => {
    const adapter = new MemoryStorageAdapter();
    saveRecord(adapter, record());
    readTextFileMock.mockResolvedValue(
      JSON.stringify({ period: { from: null, to: null }, metrics: {} }),
    );

    const { user } = renderAnalysis(adapter);
    await user.upload(screen.getByLabelText(/import analysis.json/i), analysisFile());

    const alert = await screen.findByTestId("analysis-error");
    expect(alert).toHaveTextContent(/metrics/i);
    // A bad import must not blank the previously displayed analysis.
    expect(screen.getByText(/Sessions: 1/)).toBeInTheDocument();
    expect(screen.getByTestId("analysis-source")).toHaveTextContent(/local/i);
  });

  it("displays an imported analysis and can switch back to local", async () => {
    const adapter = new MemoryStorageAdapter();
    saveRecord(adapter, record());
    readTextFileMock.mockResolvedValue(JSON.stringify(importedAnalysis));

    const { user } = renderAnalysis(adapter);
    await user.upload(screen.getByLabelText(/import analysis.json/i), analysisFile());

    await waitFor(() =>
      expect(screen.getByTestId("analysis-source")).toHaveTextContent(/imported/i),
    );
    expect(screen.getByText(/Sessions: 7/)).toBeInTheDocument();
    expect(screen.getByText(/imported flag/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /show local analysis/i }));

    expect(screen.getByTestId("analysis-source")).toHaveTextContent(/local/i);
    expect(screen.getByText(/Sessions: 1/)).toBeInTheDocument();
  });
});
