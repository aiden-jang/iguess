# Finishing review

This is the acceptance record for the agreed finishing pass. [DESIGN.md](../../../DESIGN.md)
defines the direction. The [studio review](../studio/README.md) records the previous build.
Screenshots use disposable local rooms; the public cat remains a labeled example.
No test players or drawings are inserted into production rooms.

## Acceptance checklist

| #   | Area                    | Implementation and evidence                                                                                                                                                                                                 |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Phone entry             | Intro → name and mode form → example. `join-mobile-light.jpg`; entry test checks the name is in view.                                                                                                                       |
| 2   | Fresh or rejoin         | Fresh visits generate a new room. Returning players explicitly choose Rejoin; invitation intent remains distinct. Entry and recovery tests.                                                                                 |
| 3   | Invitations             | The destination room and host-controlled mode are explained. Invite copying, native sharing and downloaded invite cards retain their existing routes. Join/game tests; `room-invite.png`.                                   |
| 4   | Mode explanations       | Each selected mode explains its roles; curated AI doodles are named honestly. Entry tests and help dialog.                                                                                                                  |
| 5   | AI readiness            | A cached health-only request checks vision availability. Entry and lobby disclose failures and offer the curated drawer. No paid guess is made for readiness. Server and entry tests.                                       |
| 6   | Form feedback           | Field errors describe the problem; names, selected modes and invalid custom-word drafts stay editable. Entry and room tests.                                                                                                |
| 7   | Typography              | Functional labels and secondary text use a readable scale; desktop/mobile screenshots cover both palettes.                                                                                                                  |
| 8   | Icons and states        | Shared SVG controls, labeled selection, clear disabled states and consistent focus rings. Palette, keyboard and accessibility checks.                                                                                       |
| 9   | Avatars                 | Illustrated faces retain the existing stored avatar identifiers. Named picker choices; persistence is verified after reload.                                                                                                |
| 10  | Responsive layout       | Layouts checked from 320 px to desktop, landscape and enlarged text. Long gallery captions have a separate local layout probe.                                                                                              |
| 11  | Notifications           | Room updates and reconnect notices occupy the chat header rather than floating over tools or art. Room/recovery tests.                                                                                                      |
| 12  | Lobby hierarchy         | Host authority, readiness and the next step are explicit. `lobby-desktop.jpg`, `lobby-mobile.jpg`.                                                                                                                          |
| 13  | Rules                   | Host permissions, word-pack selection/counts, All words and validated custom words. Invalid drafts cannot replace saved rules. `settings-desktop.jpg`, `settings-mobile.jpg`.                                               |
| 14  | Scores                  | The roster control exposes your score and a short gain readout; full standings stay available. Correct-guess tests and roster capture.                                                                                      |
| 15  | Narrow palette          | A labeled Ink disclosure exposes every color without a clipped horizontal row. Narrow-phone test.                                                                                                                           |
| 16  | Drawing tools           | Labeled pen/erase/fill, brush size, Undo, confirmed Clear and download feedback. Drawing/keyboard tests and captures.                                                                                                       |
| 17  | Roles                   | Drawers receive the focused canvas and contextual tools. Guessers receive a role label and composer. `drawing-*`, `guessing-mobile.jpg`.                                                                                    |
| 18  | Keyboard viewport       | Visual viewport resizing keeps composition reachable; opening/closing a simulated keyboard is tested. Real OS keyboards remain a manual coverage limit.                                                                     |
| 19  | Correct guess           | Authoritative completion replaces the guess field, retains reactions and reports actual score gain. Correct-guess tests.                                                                                                    |
| 20  | Turn transitions        | Word selection, timer urgency and the word reveal are distinct. Only the banner animates on phase changes. `word-choice-*`, `turn-recap-desktop.jpg`.                                                                       |
| 21  | Results chat            | Finished games collapse chat by default; reopening retains the log and scrolls to the latest message. Finished-game test.                                                                                                   |
| 22  | Gallery                 | Aspect ratios, artist names, blank submissions and broken previews have explicit treatment. `results-*`, `gallery-probe-*`; export probe.                                                                                   |
| 23  | Replay                  | One pass with pause, restart, progress and a still toggle; playback pauses in hidden tabs. Finished-game test.                                                                                                              |
| 24  | Result actions          | Play again is primary, evidence sharing sits with the gallery, and copied/social text is secondary. Ties and zero scores are honest. Results captures and unit tests.                                                       |
| 25  | Sharing                 | Preparing, shared, cancelled, downloaded and failed states are distinct. Native cancellation does not download. Bounded exports name artists and disclose the first-eight limit. Unit/browser tests and `export-probe.png`. |
| 26  | Errors and empty states | Consistent join/load errors, missing preview/replay handling and event-specific empty galleries. Loading-failure test; gallery fallbacks.                                                                                   |
| 27  | Interruptions           | Drafts survive refresh, offline and reconnect. Sending is disabled offline without erasing text; Leave/Clear require confirmation. Recovery/keyboard tests.                                                                 |
| 28  | Voice                   | Jokes follow actual turns, correct guesses and results. Per-room dogbot commentary avoids recent templates and acknowledges unavailable vision. Commentary unit tests.                                                      |
| 29  | Motion                  | Local banner feedback, restrained earned confetti and no full-document crossfade. System reduced motion and the personal motion setting suppress decoration. Preference and visual checks.                                  |
| 30  | Feedback preferences    | Sound, haptics and motion are separate, synchronized and saved in the browser. Unsupported vibration is explained. Persistence tests; `players-preferences-desktop.jpg`.                                                    |
| 31  | Accessibility           | Automated WCAG A/AA audits cover entry, privacy, lobby, roster, confirmation and results. Keyboard, focus-return and drawing-shortcut flows are tested. Screen-reader use remains a manual coverage limit.                  |
| 32  | Devices and performance | Chromium/WebKit cover desktop and simulated phone layouts. The room code loads after entry with loading/error states. Physical phones, constrained hardware and paid vision remain unverified.                              |
| 33  | Product surfaces        | Help/privacy match the behavior and preferences. Self-hosted fonts, favicon/social art and refreshed install screenshots follow the palette; the service-worker cache advances.                                             |
| 34  | Delivery                | Repository verification, complete browser run, screenshot inspection and six Conventional Commits. No production deployment or credential changes are part of this pass.                                                    |

## Evidence and reproduction

Run `pnpm run verify`, then `CAPTURE_UI=1 pnpm test:e2e --workers=1` sequentially.
The browser suite starts the real local room Worker without a paid AI URL. Its separate
AI test configuration has no Workers AI binding and verifies the mock provider before requests.
Do not run another browser suite against the same ports or rebuild the room Worker during a timed game.

The screenshot inventory includes light/dark entry at desktop, phone and 320 px; lobby,
settings, word choice, drawing/viewing roles, word reveal, results and downloaded share images.
Install screenshots retain their manifest dimensions. The favicon, app icons and social artwork
already use the studio palette and remain intentionally consistent.

`gallery-probe-*` deliberately clones a real completed card locally to stress larger grids and
long captions after the real flow has passed. `export-probe.png` uses labeled local sample art,
a broken preview and long captions to test export boundaries. These are QA probes, not game
history or production examples. Historical screenshots are retained in their original folders.

## Cache regression coverage

The browser check registers the shipped service worker explicitly on the local development
origin, where the development client normally unregisters workers. It seeds stale availability
and requires a current network response. Reinstating the old cache behavior in a temporary,
ignored production build reproduced the failure; the fixed script passed in both browsers.
Production HTTPS policy is unchanged.

## Verification outcome

The repository gate and complete Chromium/WebKit browser suite passed against the finished
implementation. Desktop, phone and narrow-phone captures were inspected in both palettes,
including entry, drawing/viewing roles, word choice, settings, results, exports, the ink picker,
confirmation, errors and feedback preferences. Enlarged text and simulated keyboard checks passed.
The finishing pass is recorded in six Conventional Commits on `main`; nothing was pushed.

## Verification limits

The [long-chat follow-up](../chat/README.md) records the later fix for history expanding
past the composer, including scroll-following and keyboard-focus regressions.

Browser emulation is not a physical iPhone or Android device. The visual-viewport test simulates
keyboard resizing; it does not operate an actual OS keyboard. Automated accessibility audits and
keyboard checks do not establish VoiceOver/TalkBack usability. Vibration hardware, native mobile
share sheets, constrained-device frame rates and paid-provider drawing recognition were not
available for this pass. Native share success/cancel/fallback behavior is covered by unit tests;
browser downloads are exercised end to end. Production secrets and provider configuration are unchanged.
