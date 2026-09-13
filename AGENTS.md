# AGENTS.md

## What this repo is

`pi-fit-trace` is a pi **Extension + Skill** that turns training logs into deterministic progress analysis and draft training plans. An implementation now exists; the docs in `docs/` remain the product contract.

## Layout (pi discovery paths, not generic folders)

- `.pi/extensions/fit-trace/index.ts` — the only pi-runtime module; registers the four tools.
- `.pi/extensions/fit-trace/core/` — pure TypeScript domain logic (no pi/typebox imports). Tests target this.
- `.pi/skills/training-coach/SKILL.md` — the Skill; auto-discovered by pi.
- `fixtures/` — JSON fixtures used by tests. `tests/` — `node:test` suite.

## Commands

- `pnpm install`
- `pnpm test` — Node's built-in test runner over `tests/*.test.ts`; no build step.
- `pnpm typecheck` — `tsc --noEmit`.

## Hard rules

- Extension = deterministic only: no LLM, clock, or randomness in `core/`. Skill = behavior/domain only; it must not read storage directly.
- pi signals tool failure by **throwing** from `execute`. Returning `{ accepted: false }` is not an error. Validation/conflict failures throw `FitTraceError` subclasses.
- Imports are idempotent by `id`: an identical re-import is a no-op; the same `id` with different content throws `CONFLICT` (never overwrite an original record).
- Stored records are re-validated on load; a malformed/outdated store throws `CORRUPT_STORE` with the failing record index. Date filters are validated and throw `VALIDATION_ERROR` (invalid or inverted ranges) instead of an opaque `RangeError`.
- `generate_next_plan` returns a draft and never writes; plans require explicit user confirmation.
- Keep pi/typebox imports confined to `index.ts`.

## Gotchas

- Requires Node >= 24 and pnpm (`packageManager: pnpm@10.34.5`).
- Core modules use `.ts` extensions in relative imports (Node type-stripping) and must stay erasable: no `enum`, no parameter properties.
- Persistence is local JSON at `<cwd>/.pi/fit-trace/workouts.json`; override with `PI_FIT_TRACE_STORE`.
- Tests mock `ExtensionAPI`, so the adapter is exercised without a pi runtime.

## Open blocker

App ↔ pi transport (SDK / RPC / JSON mode) is undecided; v1 is fixture-driven.
