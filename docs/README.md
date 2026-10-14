# Visual evidence

The root README uses the current generated share card. Its source is
`packages/client/public/og.svg`; regenerate it with the client’s `gen:og` script.
The favicon and install icons come from `public/icon.svg` through `gen:icons`.

The older `join.png`, `choosing.png`, `gameplay.png`, `gameplay-guesser.png` and
`gameplay.svg` are historical gameplay captures, not references for the current
palette or layout. They remain as evidence of live drawing and word masking.

For fresh captures, run the local stack and play through joining, word choice,
drawing, guessing and results. Use separate players to verify that the drawer
sees the word while guessers see only its masked hint. Label demonstration data
and do not use private room drawings without permission.

Inspect desktop and mobile widths, light/dark palettes, focus states and reduced
motion. Record unavailable browser or physical-device checks separately; a test
suite does not establish visual fidelity.

The current studio review and screen inventory live in
[the acceptance record](ui-review/studio/README.md). Its captures supersede the earlier
drawing-club and October 13 layout captures. See `DESIGN.md` for the product direction and role-specific priorities.
