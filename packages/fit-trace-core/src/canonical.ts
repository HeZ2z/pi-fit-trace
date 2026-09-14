/**
 * Canonical JSON serialization used for deterministic equality checks.
 *
 * Browser-safe and dependency-free: recursively sorts object keys and drops
 * `undefined` values so two structurally-equal records serialize identically.
 * This is the single source of truth for the idempotency/conflict contract.
 */

/** Deterministic JSON with recursively sorted keys, for record equality checks. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => `${JSON.stringify(key)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
