# Repository refactor review

This pass preserves the [studio design](../../../DESIGN.md) and the
[finishing baseline](../finish/README.md). It changes connection ownership, room recovery,
runtime validation, drawing input and lifecycle cleanup. Public privacy text now describes
temporary recovery checkpoints and room credentials.

## Captures

The repository browser test captures the actual app in disposable local rooms at
1440 × 1000 and 390 × 1000 in Chromium and WebKit. `privacy-*` shows the updated information
dialog; `room-*` shows the room after the transport/state refactor. Browser names in filenames
identify the renderer. Test names and generated room codes are QA data, not production accounts.

Compared with the earlier desktop and phone lobby captures, the palette, typography, rules,
canvas composition and tool placement are preserved. The phone canvas responds to the taller
viewport. The privacy dialog keeps its own scroll area, reachable contact link and Escape close.
No visual redesign or deliberate layout deviation is part of this pass.

## Reproduce

Run `pnpm run verify`, then `CAPTURE_AUDIT=1 pnpm run test:e2e --workers=1` sequentially.
Do not rebuild the game Worker while a timed game is running. The local AI configuration
has no Workers AI binding and is pinned to mock; the game tests have no paid-provider URL.

The browser regressions cover public-ID impersonation, URL-free credentials, rejected foreign
origins, final buffered stroke points, reaction expiry, wake-lock reacquisition and privacy
scrolling. A controlled delayed settings response checks that newer custom-word edits survive.
The full suite also covers existing entry, gameplay, recovery, results, exports,
accessibility and service-worker behavior.

Browser emulation does not establish physical-device keyboard behavior, haptic hardware,
native sharing, manual screen-reader usability or paid-provider recognition quality. Broader
architecture and verification details are in the [repository audit](../../REPOSITORY-AUDIT.md).
