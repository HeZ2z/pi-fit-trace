# pi-fit-trace

基于 pi 插件的训练记录分析与计划建议工具。

[English](README.md) | [简体中文](README.zh-CN.md)

## 状态

MVP 实现已完成：确定性的 Extension 工具、`training-coach` Skill、测试样例和测试套件。

## 工作方式

App JSON → `import_workout` → 确定性分析 → `generate_next_plan` 草案 → 用户确认。

- **Extension** — `.pi/extensions/fit-trace/`：校验、幂等存储、指标计算、进度分析、计划草案。
- **Skill** — `.pi/skills/training-coach/SKILL.md`：解读、证据规则、安全提示、输出格式。

## 开发

需要 Node >= 24 和 pnpm。

```bash
pnpm install
pnpm test
pnpm typecheck
```

## 文档

- [MVP 设计](docs/mvp-design.md)
- [Extension + Skill 规范](docs/extension-skill-spec.md)
