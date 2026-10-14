# Contributing

Use Node.js 22 and pnpm 9.15.0. Follow [README.md](README.md) for setup and read
[ARCHITECTURE.md](ARCHITECTURE.md) and [CONVENTIONS.md](CONVENTIONS.md) before changing behavior.

Keep gameplay rules server-authoritative. Shared client/server rules belong in
`shared/`; AI behavior belongs in modes or the AI worker. Keep join rendering,
room effects and transport logic separate.

Run `pnpm run verify` and relevant end-to-end tests. For UI changes, also inspect
desktop and mobile layouts, keyboard use, reduced motion and loading/error states.
State any unavailable browser or physical-device checks in the pull request.
Never use a paid production vision endpoint for routine validation.

Use Conventional Commits without a scope or app name:

```text
fix: preserve a guess while reconnecting
refactor: separate round gallery capture
```

Describe the concrete problem, resulting behavior and validation. Add regression
coverage when it can detect a meaningful failure. Do not include credentials,
private room links or private drawings in public reports.
