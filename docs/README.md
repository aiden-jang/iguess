# Visual evidence

The root README uses the current generated share card. Its source is
`packages/client/public/og.svg`; regenerate it with the client’s `gen:og` script.
The favicon and install icons come from `public/icon.svg` through `gen:icons`.
The acid-green question-eye face has SVG and small PNG tab icons, an Apple touch icon and
opaque install icons. Versioned icon URLs and the service-worker cache keep updates from
being hidden by an older cached asset.

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

The finishing checklist, screen inventory and verification limits live in
[the acceptance record](ui-review/finish/README.md). Its captures supersede the
[historical studio review](ui-review/studio/README.md) and earlier layout captures. See `DESIGN.md` for the product direction and role-specific priorities.

The [repository audit](REPOSITORY-AUDIT.md) covers architecture, comments, recovery and repository gates.
