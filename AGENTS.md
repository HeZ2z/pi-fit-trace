# AGENTS.md

## Repository purpose

`pi-fit-trace` is a design-stage project for a pi plugin that turns training logs into evidence-based progress analysis and draft training plans.

The repository currently contains documentation only. There is no source tree, package manifest, build, test suite, CI configuration, or confirmed pi runtime integration.

Treat the documentation as the current product contract. Do not assume conventional directories or invent pi APIs.

## Current blocker

The target pi extension API and runtime model are unconfirmed. Before implementing code, verify the supported extension, tool-registration, persistence, and skill-loading mechanisms against the target pi version and official documentation.

## Documentation

- `README.md` — canonical English project overview.
- `README.zh-CN.md` — Chinese mirror; keep it synchronized with `README.md`.
- `docs/mvp-design.md` — MVP scope, initial data protocol, and implementation sequence.
- `docs/extension-skill-spec.md` — Extension/Skill boundaries, tool contracts, data rules, and acceptance criteria.

Write all new documentation in English unless a translation is explicitly requested.

## Design constraints

- **Extension:** deterministic runtime capabilities only: register tools, validate input, persist and query records, compute metrics, and return structured results.
- **Skill:** model behavior and domain guidance only: interpret metrics, generate recommendations, and cite evidence. It must not access storage directly or bypass the Extension.
- Plans are drafts until the user confirms them. Never modify an original workout record implicitly.
- Workout imports must be idempotent. A record with an existing `id` must not be stored twice.
- Recommendations must distinguish recorded facts, inferences, and suggestions; they must not fabricate training history.
- Pain, extreme exertion, missing data, or other abnormal signals require conservative guidance and an appropriate professional-care prompt.

## Change and verification rules

- Keep changes small, reviewable, and aligned with the docs.
- Update the relevant specification before changing its contract.
- Prefer deterministic, fixture-based verification for data validation, metrics, and tool behavior.
- Before claiming completion, run the checks appropriate to the files changed and report any unverified integration assumptions.
