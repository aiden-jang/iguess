# Reaction picker review

The room offers crying face, skull, melting face, salute, raised eyebrow, moai,
wilted rose and fire. Each button has a descriptive screen-reader name and a short,
dry tooltip. The row retains its existing size and placement beside the chat composer.

`shared/reactions.ts` owns the displayed choices and the wire allowlist. Previous
choices remain accepted for room tabs opened before deployment; arbitrary text
cannot become a reaction overlay. A transport regression checks both directions.

Run `pnpm run verify`, then
`CAPTURE_REACTIONS=1 pnpm run test:e2e e2e/reactions.spec.ts --workers=1`.
The local browser test sends every displayed choice through the real room Worker,
checks that it appears and expires on the canvas, and checks that the complete row
and chat input fit without page overflow. No paid vision provider is involved.

Captures cover 1440 × 760 dark and 320 × 568 light in Chromium and WebKit.
Emoji artwork comes from the operating system and can differ across devices.
Physical phones and manual screen-reader use are outside this review.
