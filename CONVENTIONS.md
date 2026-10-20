# Repository conventions

`AGENTS.md` and `CLAUDE.md` link to this file so guidance has one source.
Setup and commit conventions are in [CONTRIBUTING.md](CONTRIBUTING.md).
Module responsibilities are in [ARCHITECTURE.md](ARCHITECTURE.md).

## Verification

Run `pnpm run verify` before reporting a change complete. CI runs the same gate:
dependency auditing, typechecking, lint, repository checks, package tests and production builds.
Relevant game-flow changes also require end-to-end tests.

- `check-size` pins file ceilings and rejects oversized unlisted source files.
  Ceilings may decrease, never increase. Lower a tracked file’s ceiling in the
  same commit when it shrinks. Give extracted modules coherent responsibilities.
- `check-tests` runs each package suite and enforces its test floor. Floors may
  increase, never decrease. A successful process alone is not evidence that the
  complete suite ran.
- `check-comments` checks source comments for oversized blocks and ticket IDs.

Use `pnpm run <name>` for repository scripts, and avoid naming scripts after npm
builtins. New checks must cover their own source. Do not exclude files or weaken
checks to make a change pass.

## Tests and evidence

Test meaningful behavior and invariants. Prove a new check detects its intended
failure: introduce the failure, observe the check fail, restore the source, then
verify it passes. Confirm temporary mutations leave the tree clean.

Validate inventories, searches and measurements. Empty scans or implausibly clean
results can indicate a bad glob, wrong directory or unavailable instrumentation.

UI changes need browser checks for layout and interactions at desktop and mobile
widths. Unit tests do not establish visual fidelity. Report unavailable browsers,
physical-device checks and paid-provider coverage as verification limits. Keep
local and automated tests away from paid production vision endpoints.

## Comments and documentation

Keep comments explaining a non-obvious constraint or decision. Remove comments
that narrate obvious code, record revisions or explain an older implementation.
Re-read nearby comments after moving code.

Do not add source comment blocks longer than four lines or ticket IDs. Ask if a
longer block is necessary. Test comments may explain the scenario they exercise;
the source comment scanner excludes test files.

Do not write live test totals, check totals or file lengths into prose docs.
Tools report those values. Describe the current system; Git records its history.
