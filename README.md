# pi-fit-trace

A pi Extension + Skill that turns training logs into evidence-based progress analysis and draft training plans.

[English](README.md) | [简体中文](README.zh-CN.md)

## Status

MVP implementation complete: deterministic Extension tools, a `training-coach` Skill, fixtures, and a test suite.

## How it works

App JSON → `import_workout` → deterministic analysis → `generate_next_plan` draft → user confirmation.

- **Extension** — `.pi/extensions/fit-trace/`: validation, idempotent storage, metrics, progress analysis, draft plans.
- **Skill** — `.pi/skills/training-coach/SKILL.md`: interpretation, evidence rules, safety guidance, response format.

## Development

Requires Node >= 24 and pnpm.

```bash
pnpm install
pnpm test
pnpm typecheck
```

## Docs

- [MVP design](docs/mvp-design.md)
- [Extension + Skill spec](docs/extension-skill-spec.md)
