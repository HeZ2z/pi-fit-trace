import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../App.tsx";
import { MemoryStorageAdapter, StorageUnavailableError } from "../storage/adapter.ts";
import type { StorageAdapter } from "../storage/adapter.ts";
import { RECORD_KEY_PREFIX } from "../storage/workoutRepository.ts";

/** Adapter that can be toggled to fail every read and enumeration. */
class BlockableAdapter implements StorageAdapter {
  base = new MemoryStorageAdapter();
  broken: boolean;

  constructor(broken: boolean) {
    this.broken = broken;
  }

  keys(prefix: string): string[] {
    if (this.broken) {
      throw new StorageUnavailableError("blocked by browser privacy policy");
    }
    return this.base.keys(prefix);
  }

  read(key: string): string | null {
    if (this.broken) {
      throw new StorageUnavailableError("blocked by browser privacy policy");
    }
    return this.base.read(key);
  }

  write(key: string, value: string): void {
    this.base.write(key, value);
  }

  remove(key: string): void {
    this.base.remove(key);
  }
}

describe("WorkoutStoreProvider initialization", () => {
  it("shows a recoverable error screen when storage reads are blocked", () => {
    render(<App adapter={new BlockableAdapter(true)} />);

    expect(screen.getByTestId("store-init-error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    // The app shell must not render, since no screen can safely read the store.
    expect(screen.queryByRole("navigation", { name: /primary/i })).not.toBeInTheDocument();
  });

  it("shows a recoverable error screen for corrupt stored data", () => {
    const adapter = new MemoryStorageAdapter();
    adapter.write(`${RECORD_KEY_PREFIX}broken`, "{not json");

    render(<App adapter={adapter} />);

    expect(screen.getByTestId("store-init-error")).toHaveTextContent(/invalid JSON/i);
  });

  it("recovers once a retry succeeds", async () => {
    const adapter = new BlockableAdapter(true);
    const user = userEvent.setup();
    render(<App adapter={adapter} />);
    expect(screen.getByTestId("store-init-error")).toBeInTheDocument();

    adapter.broken = false;
    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(screen.queryByTestId("store-init-error")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /primary/i })).toBeInTheDocument();
  });
});
