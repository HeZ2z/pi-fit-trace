import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION } from "@pi-fit-trace/core";
import { deriveWorkoutId } from "../contracts/ids.ts";
import { MemoryStorageAdapter, StorageUnavailableError } from "../storage/adapter.ts";
import type { StorageAdapter } from "../storage/adapter.ts";
import { loadRecords } from "../storage/workoutRepository.ts";
import { WorkoutStoreProvider } from "../state/WorkoutStoreContext.tsx";
import { WorkoutEditorScreen } from "./WorkoutEditorScreen.tsx";

function SummaryProbe() {
  const { id } = useParams<{ id: string }>();
  return <div data-testid="summary-id">{id}</div>;
}

function renderEditor(adapter: StorageAdapter = new MemoryStorageAdapter()) {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={["/workout/new"]}>
      <WorkoutStoreProvider adapter={adapter}>
        <Routes>
          <Route path="/workout/new" element={<WorkoutEditorScreen />} />
          <Route path="/workout/:id" element={<SummaryProbe />} />
        </Routes>
      </WorkoutStoreProvider>
    </MemoryRouter>,
  );

  return { adapter, user, container: view.container };
}

async function fillValidSet(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText(/exercise 1 name/i), "Squat");
  await user.type(screen.getByLabelText(/exercise 1 set 1 weight \(kg\)/i), "100");
  await user.type(screen.getByLabelText(/exercise 1 set 1 reps/i), "5");
  await user.type(screen.getByLabelText(/exercise 1 set 1 rpe/i), "8");
}

describe("WorkoutEditorScreen", () => {
  it("renders the core fields", () => {
    renderEditor();

    expect(screen.getByLabelText(/^date$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/session type/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add exercise/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save workout/i })).toBeInTheDocument();
  });

  it("shows an error and does not persist when saving with no exercises", async () => {
    const { adapter, user } = renderEditor();

    await user.click(screen.getByRole("button", { name: /remove exercise/i }));
    await user.click(screen.getByRole("button", { name: /save workout/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/exercises/i);
    expect(loadRecords(adapter)).toHaveLength(0);
  });

  it("rejects a negative weight", async () => {
    const { adapter, user } = renderEditor();
    await fillValidSet(user);

    const weight = screen.getByLabelText(/weight \(kg\)/i);
    await user.clear(weight);
    await user.type(weight, "-10");
    await user.click(screen.getByRole("button", { name: /save workout/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/weight/i);
    expect(loadRecords(adapter)).toHaveLength(0);
  });

  it("rejects non-integer reps", async () => {
    const { adapter, user } = renderEditor();
    await fillValidSet(user);

    const reps = screen.getByLabelText(/exercise 1 set 1 reps/i);
    await user.clear(reps);
    await user.type(reps, "2.5");
    await user.click(screen.getByRole("button", { name: /save workout/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/reps/i);
    expect(loadRecords(adapter)).toHaveLength(0);
  });

  it("rejects RPE outside 1-10", async () => {
    const { adapter, user } = renderEditor();
    await fillValidSet(user);

    const rpe = screen.getByLabelText(/exercise 1 set 1 rpe/i);
    await user.clear(rpe);
    await user.type(rpe, "11");
    await user.click(screen.getByRole("button", { name: /save workout/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/rpe/i);
    expect(loadRecords(adapter)).toHaveLength(0);
  });

  it("saves a valid workout and navigates to its derived id", async () => {
    const { adapter, user } = renderEditor();
    await fillValidSet(user);

    const dateValue = (screen.getByLabelText(/^date$/i) as HTMLInputElement).value;
    const expectedId = deriveWorkoutId({
      id: "pending",
      schema_version: CURRENT_SCHEMA_VERSION,
      date: dateValue,
      session_type: "strength",
      exercises: [{ name: "Squat", sets: [{ weight: 100, reps: 5, rpe: 8 }] }],
    });

    await user.click(screen.getByRole("button", { name: /save workout/i }));

    expect(screen.getByTestId("summary-id")).toHaveTextContent(expectedId);

    const stored = loadRecords(adapter);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.id).toBe(expectedId);
  });

  it("shows accepted-input warnings and requires confirmation before saving", async () => {
    const { adapter, user } = renderEditor();
    await fillValidSet(user);
    await user.type(screen.getByLabelText(/sleep \(hours\)/i), "2");

    await user.click(screen.getByRole("button", { name: /save workout/i }));

    // Warnings for accepted-but-suspicious input must be visible, and nothing
    // may be persisted until the user explicitly confirms.
    expect(screen.getByRole("status", { name: /warnings/i })).toHaveTextContent(/sleep_hours/i);
    expect(loadRecords(adapter)).toHaveLength(0);
    expect(screen.queryByTestId("summary-id")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /save anyway/i }));

    expect(loadRecords(adapter)).toHaveLength(1);
    expect(screen.getByTestId("summary-id")).toBeInTheDocument();
  });

  it("invalidates the pending warning confirmation when the form changes", async () => {
    const { adapter, user } = renderEditor();
    await fillValidSet(user);

    const sleep = screen.getByLabelText(/sleep \(hours\)/i);
    await user.type(sleep, "2");
    await user.click(screen.getByRole("button", { name: /save workout/i }));

    expect(screen.getByRole("button", { name: /save anyway/i })).toBeInTheDocument();
    expect(loadRecords(adapter)).toHaveLength(0);

    // Correct the flagged value: the stale confirmation must be invalidated so
    // "Save anyway" can never persist the superseded 2-hour value.
    await user.clear(sleep);
    await user.type(sleep, "7");

    expect(screen.queryByRole("button", { name: /save anyway/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("warning-invalidated")).toBeInTheDocument();

    // Re-submitting validates the corrected form and saves that value.
    await user.click(screen.getByRole("button", { name: /save workout/i }));

    const stored = loadRecords(adapter);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.sleep_hours).toBe(7);
  });

  it("surfaces a storage failure on save instead of crashing", async () => {
    const base = new MemoryStorageAdapter();
    const failing: StorageAdapter = {
      keys: (prefix) => base.keys(prefix),
      read: (key) => base.read(key),
      write: () => {
        throw new StorageUnavailableError("Unable to write workout storage.");
      },
      remove: (key) => base.remove(key),
    };

    const { user } = renderEditor(failing);
    await fillValidSet(user);
    await user.click(screen.getByRole("button", { name: /save workout/i }));

    expect(screen.getByTestId("save-error")).toHaveTextContent(/could not save this workout/i);
    expect(screen.queryByTestId("summary-id")).not.toBeInTheDocument();
    expect(loadRecords(base)).toHaveLength(0);
  });

  it("flags pain entries and sets at or above the extreme-RPE threshold", async () => {
    const { container, user } = renderEditor();

    expect(container.querySelector('[data-safety="extreme-rpe"]')).toBeNull();
    await user.type(screen.getByLabelText(/exercise 1 set 1 rpe/i), "9");
    expect(container.querySelector('[data-safety="extreme-rpe"]')).not.toBeNull();

    const rpe = screen.getByLabelText(/exercise 1 set 1 rpe/i);
    await user.clear(rpe);
    await user.type(rpe, "8");
    expect(container.querySelector('[data-safety="extreme-rpe"]')).toBeNull();

    expect(container.querySelector('[data-safety="pain"]')).toBeNull();
    await user.click(screen.getByRole("button", { name: /add pain/i }));
    expect(container.querySelectorAll('[data-safety="pain"]')).toHaveLength(1);
  });
});
