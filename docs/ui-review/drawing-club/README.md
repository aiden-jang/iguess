# Drawing club acceptance record

The scope is the agreed full product pass. Captures use disposable local rooms and QA names;
none are seeded into the production app. The cat on the join page remains a labeled example.

| Area | Implementation and acceptance evidence |
| --- | --- |
| Complete experience audit | Joining, lobby, choosing, drawing, guessing, turn break, results, replay, sharing, leaving, and reconnecting are included in the review. |
| Visual foundation | Shared paper/ink/coral palette; chartreuse club face; functional Inter and expressive Fredoka; light and dark palettes. |
| Join page | Compact mode cards, expandable avatar selection, generated or supplied room code, clear disclosure, invitation preselection. |
| Lobby | Welcome, start eligibility, ready signal, rule summary, host-only settings, invite feedback, and usable warm-up board. |
| Turn transitions | Difficulty and point multipliers on word cards; explicit answer reveal and next-turn message at intermission. |
| Drawing | Explicit pen/erase/fill states; color selection; size preview; undo; clear confirmation; scoped shortcuts; pointer cancellation. |
| Guessing | Tools hidden for viewers; hint and timer retained; chat instructions; keyboard send; unsent draft restored within the browser session. |
| Scores and AI | Named player roles, live standings, urgency outline, honest AI documentation, and existing unavailable/mock-provider messages. |
| Results and sharing | Winner/tie/zero-score heading; paper gallery; separate evidence-based awards; replay, download and share feedback. |
| Recovery states | Existing reconnect banner and disabled actions; preserved draft; room failure recovery; clipboard failure feedback. |
| Accessibility | Native modal dialogs, Escape and focus restoration, labels, outlined selections, reduced motion, and no text-field shortcut interception. |
| Product copy | Dry supporting humor; direct controls/errors; clear distinction between curated AI drawings and vision guessing. |
| Final acceptance | Repository verification, full Chromium/WebKit flows, and desktop/mobile visual inspection. See limitations below. |
| First-game guidance | Help available before joining and in rooms; warm-up prompt; contextual drawing/guessing guidance. |
| Invite and return flows | Shared safe decoding for malformed invite escapes; browser Back exits the room view; confirmed Leave returns to joining; session reconnect identity preserved. |
| Settings | Current rule summary; host permissions; custom-word save explanation; persisted sound preference; ready explained as optional. |
| Unusual content | Bounded room/name inputs; long-name title and ellipsis; wrapping player roles, chat, custom words and results; tie/no-score presentation. |
| Device behavior | Collapsible mobile roster, phone inputs sized to avoid focus zoom, safe-area spacing, landscape split, touch cancellation, rotation checks. |
| Performance | Existing self-hosted fonts, hashed production bundles, immediate local ink, bounded chat scrolling and reduced decorative work. |
| Public details | Help/privacy/terms deep links and contact; matching favicon/install artwork and social card; refreshed service-worker cache. |
| Interaction consistency | Selected tool/mode states, modal cancel/confirm, clear warning, copy/share status, loading and connection feedback. |

## Visual evidence

- `join-desktop-light.jpg`, `join-desktop-dark.jpg`: full public composition.
- `join-mobile-light.jpg`, `join-mobile-dark.jpg`: narrow public layout.
- `lobby-desktop.jpg`, `lobby-mobile.jpg`: warm-up, settings and responsive room controls.
- `word-choice-desktop.jpg`, `word-choice-mobile.jpg`: difficulty and point hierarchy.
- `turn-recap-desktop.jpg`: revealed answer and next-turn state.
- `drawing-desktop.jpg`, `drawing-desktop-dark.jpg`, `drawing-mobile.jpg`, `drawing-tiny.jpg`,
  `guessing-mobile.jpg`: separate player roles, palette and narrow-width checks.
- `results-desktop.jpg`, `results-mobile.jpg` and their `-dark` variants: real completed game
  and gallery.
- `join-tiny-light.jpg`, `join-tiny-dark.jpg`: the public layout at 320 px.

Refresh captures with `CAPTURE_UI=1 pnpm test:e2e --workers=1`. Inspect them after the run;
a green test report alone does not establish visual quality. Generated captures may show different
words, avatars and room codes because the tests use real disposable rooms.

## Deliberate layout changes

The finished-game canvas and drawing toolbar are hidden in favor of the saved gallery. Their
socket/data behavior is unchanged; replay preserves the original drawing proportions. Mobile
players expand the roster when needed, and viewers see Save rather than disabled drawing tools.
Avatar choices expand on the join form instead of taking up several rows on every visit.

Browser tests give each local test client a separate reserved IP header. The local Workers accept
that header, while Cloudflare replaces it in production. This prevents the entire suite from
hitting the same per-IP connection budget; production rate limits are unchanged. The earlier
run demonstrated the shared-IP failure with HTTP 429 responses in the WebSocket traces.

## Verification outcome

The repository verification gate and the complete Chromium/WebKit suite passed. Focused
layout runs also passed after the final phone refinements. Captures were inspected at desktop,
390 px, and 320 px, including light/dark joins, drawing, guessing, word selection, turn recap,
and completed-game results. The PWA screenshot dimensions match the manifest.

## Verification limits

Browser automation covers Chromium and WebKit, not physical phones, VoiceOver/TalkBack or every
browser version. AI tests use mock providers; they do not establish paid vision quality, latency
or cost. In-memory rooms and unsigned reconnect identities are existing architecture limits.
The live shared-secret setup is separate from local UI work and remains required before deploying
the vision guard. No production keys, Worker settings, or production room contents were changed.
