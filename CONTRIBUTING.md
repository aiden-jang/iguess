# Contributing

Use the supported Node runtime and pinned pnpm version from [README.md](README.md). Read
[ARCHITECTURE.md](ARCHITECTURE.md) and [CONVENTIONS.md](CONVENTIONS.md) before changing behavior.

Keep gameplay rules server-authoritative. Shared client/server rules belong in
`shared/`; AI behavior belongs in modes or the AI worker. Keep join rendering,
room effects and transport logic separate.

Run `pnpm run verify` and relevant end-to-end tests. CI runs the full dependency audit
at the low-severity threshold, including development tooling. For UI changes, also inspect
desktop and mobile layouts, keyboard use, reduced motion and loading/error states.
State any unavailable browser or physical-device checks in the change summary.
Never use a paid production vision endpoint for routine validation.
See [quality checks](docs/quality.md) for the production browser stack and local review.

The owner commits verified changes directly to main; outside contributions may use pull requests.
Main's active ruleset keeps history linear and blocks force pushes and deletion. Automatic
deployment waits for CI and reuses the client build tested by the browser journeys.

Use Conventional Commits without a scope or app name:

```text
fix: preserve a guess while reconnecting
refactor: separate round gallery capture
```

Describe the concrete problem, resulting behavior and validation. Add regression
coverage when it can detect a meaningful failure. Do not include credentials,
private room links or private drawings in public reports.
