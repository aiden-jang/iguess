# Changing modes after leaving

The join draft prepares a fresh room as soon as entry succeeds. Returning through
Leave or browser Back therefore starts a new room in the selected mode. Rejoin
explicitly targets the previous room, whose running game and authoritative mode
remain intact. Entering writes the destination room and requested mode into its
own URL rather than retaining an older invitation path.

`e2e/mode-switch.spec.ts` reproduces the previously failing browser Back flow and
checks Leave, invitation entry, fresh-room mode selection, refresh and intentional
Rejoin against the real local game Worker. AI Drawer uses curated local strokes;
no paid vision provider is involved.

Run `pnpm run verify`, then
`CAPTURE_MODE_SWITCH=1 pnpm run test:e2e e2e/mode-switch.spec.ts --workers=1`.
Captures show the new mode's word choices at desktop and phone widths in Chromium
and WebKit. Physical devices and manual screen-reader use are outside this review.
