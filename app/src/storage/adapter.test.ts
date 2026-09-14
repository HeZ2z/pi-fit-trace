import { describe, expect, it } from "vitest";
import { LocalStorageAdapter, MemoryStorageAdapter, StorageUnavailableError } from "./adapter.ts";

/** Minimal working `Storage` backed by a Map. */
function mapStorage(map = new Map<string, string>()): Storage {
  return {
    get length() {
      return map.size;
    },
    clear: () => {
      map.clear();
    },
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  } as Storage;
}

/** `Storage` whose `getItem` throws, as when a browser blocks storage. */
function blockedStorage(): Storage {
  return {
    get length() {
      return 0;
    },
    clear: () => {},
    getItem: () => {
      throw new Error("blocked by browser privacy policy");
    },
    key: () => null,
    removeItem: () => {},
    setItem: () => {},
  } as Storage;
}

/** `Storage` whose enumeration throws, as when a browser blocks storage. */
function blockedEnumerationStorage(): Storage {
  return {
    get length(): number {
      throw new Error("blocked by browser privacy policy");
    },
    clear: () => {},
    getItem: () => null,
    key: () => null,
    removeItem: () => {},
    setItem: () => {},
  } as Storage;
}

describe("LocalStorageAdapter", () => {
  it("returns null only for a genuinely absent key", () => {
    const adapter = new LocalStorageAdapter(mapStorage());
    expect(adapter.read("missing")).toBeNull();
  });

  it("round-trips write, read, and remove", () => {
    const adapter = new LocalStorageAdapter(mapStorage());
    adapter.write("k", "v");
    expect(adapter.read("k")).toBe("v");

    adapter.remove("k");
    expect(adapter.read("k")).toBeNull();
  });

  it("throws StorageUnavailableError when there is no storage backend", () => {
    const adapter = new LocalStorageAdapter(null);
    expect(() => adapter.read("k")).toThrow(StorageUnavailableError);
    expect(() => adapter.keys("p:")).toThrow(StorageUnavailableError);
  });

  it("throws StorageUnavailableError when getItem fails", () => {
    const adapter = new LocalStorageAdapter(blockedStorage());
    expect(() => adapter.read("k")).toThrow(StorageUnavailableError);
  });

  it("throws StorageUnavailableError when enumeration fails", () => {
    const adapter = new LocalStorageAdapter(blockedEnumerationStorage());
    expect(() => adapter.keys("p:")).toThrow(StorageUnavailableError);
  });

  it("returns only keys matching the prefix", () => {
    const adapter = new LocalStorageAdapter(mapStorage());
    adapter.write("p:one", "1");
    adapter.write("p:two", "2");
    adapter.write("other:three", "3");

    expect(adapter.keys("p:").sort()).toEqual(["p:one", "p:two"]);
    expect(adapter.keys("other:")).toEqual(["other:three"]);
    expect(adapter.keys("nope:")).toEqual([]);
  });
});

describe("MemoryStorageAdapter", () => {
  it("returns null for an absent key and round-trips values", () => {
    const adapter = new MemoryStorageAdapter();
    expect(adapter.read("k")).toBeNull();

    adapter.write("k", "v");
    expect(adapter.read("k")).toBe("v");

    adapter.remove("k");
    expect(adapter.read("k")).toBeNull();
  });

  it("returns only keys matching the prefix", () => {
    const adapter = new MemoryStorageAdapter();
    adapter.write("p:one", "1");
    adapter.write("p:two", "2");
    adapter.write("other:three", "3");

    expect(adapter.keys("p:").sort()).toEqual(["p:one", "p:two"]);
    expect(adapter.keys("nope:")).toEqual([]);
  });
});
