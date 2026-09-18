import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanDraft, WorkoutRecord } from "@pi-fit-trace/core";
import { readTextFile } from "../api/fileTransport.ts";
import { MemoryStorageAdapter } from "../storage/adapter.ts";
import { loadRecords, saveRecord } from "../storage/workoutRepository.ts";
import { WorkoutStoreProvider } from "../state/WorkoutStoreContext.tsx";
import { useWorkouts } from "../state/useWorkouts.ts";
import { PlanScreen } from "./PlanScreen.tsx";

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

const importedPlan: PlanDraft = {
  is_draft: true,
  requires_confirmation: true,
  goal: "Imported goal",
  based_on: {
    period: { from: "2026-02-01", to: "2026-02-28" },
    sessions: 12,
    source_records: ["wkt_x", "wkt_y"],
  },
  recommendations: [
    {
      action: "imported_action",
      detail: "Imported detail.",
      reason: "Imported reason.",
      evidence: { imported_metric: 42 },
    },
  ],
  safety_notes: ["Imported safety note."],
  professional_care_prompt: null,
};

const carePlan: PlanDraft = {
  ...importedPlan,
  professional_care_prompt: "Seek evaluation from a qualified medical professional.",
};

/** The file body is irrelevant: `readTextFile` is mocked. */
function planFile(name = "plan.json"): File {
  return new File(['{"unused":true}'], name, { type: "application/json" });
}

function renderPlan(adapter: MemoryStorageAdapter) {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={["/plan"]}>
      <WorkoutStoreProvider adapter={adapter}>
        <Routes>
          <Route path="/plan" element={<PlanScreen />} />
          <Route path="/workout/new" element={<div data-testid="editor" />} />
        </Routes>
      </WorkoutStoreProvider>
    </MemoryRouter>,
  );
  return { user, ...view };
}

/** Renders the plan screen alongside a control that mutates workout history. */
function PlanWithHistoryControl() {
  const { add } = useWorkouts();

  return (
    <>
      <button
        type="button"
        onClick={() =>
          add(
            record({
              id: "wkt_new",
              date: "2026-03-01",
              exercises: [{ name: "Deadlift", sets: [{ weight: 120, reps: 5, rpe: 8 }] }],
            }),
          )
        }
      >
        Add workout
      </button>
      <PlanScreen />
    </>
  );
}

function renderPlanWithHistoryControl(adapter: MemoryStorageAdapter) {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={["/plan"]}>
      <WorkoutStoreProvider adapter={adapter}>
        <PlanWithHistoryControl />
      </WorkoutStoreProvider>
    </MemoryRouter>,
  );
  return { user, ...view };
}

describe("PlanScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows an empty state when there is no history", () => {
    renderPlan(new MemoryStorageAdapter());

    expect(screen.getByText(/no workout history to draft a plan from yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /log your first workout/i })).toHaveAttribute(
      "href",
      "/workout/new",
    );
    expect(screen.queryByTestId("plan-status")).not.toBeInTheDocument();
  });

  it("renders a local draft with reasons and a confirm control", () => {
    const adapter = new MemoryStorageAdapter();
    saveRecord(adapter, record());

    const { container } = renderPlan(adapter);

    expect(screen.getByTestId("plan-status")).toHaveTextContent(/draft/i);
    expect(screen.getByTestId("plan-source")).toHaveTextContent(/local/i);

    const recommendations = container.querySelectorAll("[data-recommendation-action]");
    expect(recommendations.length).toBeGreaterThan(0);
    // Every recommendation must show its reason.
    for (const item of recommendations) {
      expect(item).toHaveTextContent(/reason:/i);
    }

    expect(screen.getByRole("button", { name: /confirm plan/i })).toBeInTheDocument();
  });

  it("adopts on confirmation without mutating stored records", async () => {
    const adapter = new MemoryStorageAdapter();
    saveRecord(adapter, record());
    const before = loadRecords(adapter);

    const { user } = renderPlan(adapter);

    await user.click(screen.getByRole("button", { name: /confirm plan/i }));

    expect(screen.getByTestId("plan-status")).toHaveTextContent(/adopted/i);

    // Confirming is UI-only: storage must be byte-for-byte unchanged.
    expect(loadRecords(adapter)).toEqual(before);
  });

  it("resets an adopted plan to draft when the workout history changes", async () => {
    const adapter = new MemoryStorageAdapter();
    saveRecord(adapter, record());

    const { user } = renderPlanWithHistoryControl(adapter);

    await user.click(screen.getByRole("button", { name: /confirm plan/i }));
    expect(screen.getByTestId("plan-status")).toHaveTextContent(/adopted/i);

    // The new record regenerates the plan; a stale "adopted" must not survive.
    await user.click(screen.getByRole("button", { name: /add workout/i }));

    await waitFor(() => expect(screen.getByTestId("plan-status")).toHaveTextContent(/draft/i));
    expect(screen.getByRole("button", { name: /confirm plan/i })).toBeInTheDocument();
  });

  it("keeps the previous plan when an import is malformed", async () => {
    const adapter = new MemoryStorageAdapter();
    saveRecord(adapter, record());
    readTextFileMock.mockResolvedValue(
      JSON.stringify({
        is_draft: true,
        requires_confirmation: true,
        based_on: { period: { from: null, to: null }, sessions: 1, source_records: [] },
        recommendations: {},
        safety_notes: [],
        professional_care_prompt: null,
      }),
    );

    const { user, container } = renderPlan(adapter);
    await user.upload(screen.getByLabelText(/import plan.json/i), planFile());

    const alert = await screen.findByTestId("plan-error");
    expect(alert).toHaveTextContent(/recommendations/i);
    // A bad import must not blank the previously displayed plan.
    expect(container.querySelector("[data-recommendation-action]")).not.toBeNull();
    expect(screen.getByTestId("plan-source")).toHaveTextContent(/local/i);
  });

  it("imports a plan and resets an adopted local draft to draft", async () => {
    const adapter = new MemoryStorageAdapter();
    saveRecord(adapter, record());
    readTextFileMock.mockResolvedValue(JSON.stringify(importedPlan));

    const { user } = renderPlan(adapter);
    await user.click(screen.getByRole("button", { name: /confirm plan/i }));
    expect(screen.getByTestId("plan-status")).toHaveTextContent(/adopted/i);

    await user.upload(screen.getByLabelText(/import plan.json/i), planFile());

    await waitFor(() => expect(screen.getByTestId("plan-source")).toHaveTextContent(/imported/i));
    expect(screen.getByTestId("plan-status")).toHaveTextContent(/draft/i);
    expect(screen.getByText(/imported goal/i)).toBeInTheDocument();
    expect(screen.getByText(/imported reason/i)).toBeInTheDocument();
    expect(screen.getByText(/imported safety note/i)).toBeInTheDocument();
  });

  it("renders a professional care prompt when present", async () => {
    const adapter = new MemoryStorageAdapter();
    saveRecord(adapter, record());
    readTextFileMock.mockResolvedValue(JSON.stringify(carePlan));

    const { user } = renderPlan(adapter);
    await user.upload(screen.getByLabelText(/import plan.json/i), planFile());

    const prompt = await screen.findByTestId("care-prompt");
    expect(prompt).toHaveTextContent(/qualified medical professional/i);
  });
});
