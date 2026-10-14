# October 13 review

Local captures use disposable QA players and rooms. The cat on the join page is
explicitly labeled example content; player statistics shown here belong to the
test browser, not seeded production accounts.

- `join-desktop.jpg`: desktop join composition, dark palette, selected mode.
- `join-mobile.jpg`: narrow join layout and data disclosure.
- `game-mobile.jpg`: playing layout at 390 px, with the word on its own row.
- `game-desktop.jpg` and `game-guesser.jpg`: separate players receiving the same
  drawing, with the answer visible only to the drawer.
- `room-mobile.jpg`: earlier lobby layout capture. The final build additionally
  disables Classic start until another player joins; this capture predates that
  permission fix.

The desktop and mobile captures were visually inspected. The mobile playing
layout was checked for horizontal overflow, and the Play link was checked to
bring the join form into view. Live play covered word choice, drawing, guessing,
score updates and the clear confirmation.

The release verification passed types, lint, source-size limits, comment rules,
unit tests and the production build. Browser tests passed joining, mobile play,
multiplayer host permissions, finished-game gallery, replay and sharing. The AI
provider boundary used a test provider; paid vision was not exercised. An awards
regression test was checked by temporarily removing its guard, observing failure,
and restoring the guard before verification.

Safari, physical phones and paid AI remain unverified. Dark UI was reviewed in
the browser; light tokens and generated share artwork were inspected, without a
separate light-mode gameplay capture. Local worker rebuilds reset in-memory test
rooms, so timed game tests were run after the final build completed.
