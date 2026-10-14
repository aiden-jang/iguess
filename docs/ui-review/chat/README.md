# Long-chat layout review

The active room keeps the message history inside a bounded scroll area. Reactions and the
composer remain below it, visible at the bottom of the chat panel. The native disclosure
is used only for the collapsible results chat; its intrinsic sizing no longer expands the
active room. This preserves the studio layout in [DESIGN.md](../../../DESIGN.md).

`e2e/chat-layout.spec.ts` runs the real local room in curated-drawer mode and injects a burst
of wrapping chat frames through the test socket. The original implementation pushed the
composer out of the desktop viewport. The fixed implementation retains its position while
the history scrolls. The regression also checks reading older messages, jumping back without
losing keyboard focus, and sending a message afterward. It makes no vision requests.

Captures cover desktop light/dark, phone, small phone, landscape and a simulated reduced
keyboard viewport in Chromium and WebKit. They show disposable QA rooms and drawings.
They preserve the existing canvas, typography, palette, reactions and composer placement.
The keyboard case simulates visual-viewport resizing; it does not verify physical keyboards.

Run `pnpm run verify`, then
`CAPTURE_CHAT=1 pnpm run test:e2e e2e/chat-layout.spec.ts --workers=1` sequentially to reproduce.
