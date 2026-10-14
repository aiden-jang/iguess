# Room viewport review

The active room uses the dynamic viewport height. The canvas takes the space left after
the header, game status, tools and chat instead of imposing a fixed minimum height. Chat's
positioned container also contains its visually hidden instructions, which previously
contributed page overflow on a small phone.

Mobile play keeps short words beside the round and timer; longer words get the full width.
Letter spacing stays readable without padded desktop-sized tiles. The viewer's Save action
uses one row. Short lobbies condense their introduction, and landscape word choices use
columns. Functional game settings and actions remain available.
The viewer toolbar has inset padding around its note and Save action at both sizes.

While the simulated phone keyboard is open, the word, timer, live drawing and composer take
priority. The toolbar and secondary round labels return when the keyboard closes. Message
history, settings and the results gallery retain their own scroll areas. Enlarged text can
still scroll within the board pane when needed to reach controls.

`e2e/room-fit.spec.ts` checks lobby, word selection, drawing and guessing at 1440 × 760,
1024 × 600, 390 × 667, 320 × 568 and 768 × 390. Desktop, small-phone and landscape captures
use the light palette; laptop and phone captures use dark. Chromium and WebKit captures
show disposable local rooms. A controlled incoming-word fixture supplies a maximum-length
custom phrase for layout stress; game rules, scores and drawing transport remain on the
real local Worker. These fixtures never reach production or a vision provider.

Run `pnpm run verify`, then
`CAPTURE_ROOM_FIT=1 pnpm run test:e2e e2e/room-fit.spec.ts --workers=1` sequentially.
The browser checks require the entire canvas and controls to stay within the room, allow
one CSS pixel for fractional renderer rounding, and reject document or board-pane overflow.
They do not verify physical phone keyboards, browser chrome or manual screen-reader use.
