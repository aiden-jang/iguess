# Studio UI review

The current direction is defined in [DESIGN.md](../../../DESIGN.md). The earlier
[drawing-club review](../drawing-club/README.md) records the previous design.
All game captures use disposable local rooms. The public cat is a labeled example;
no QA names, scores, or drawings are inserted into production rooms.

## What changed

- A paper-and-ink landing, oversized Inter headlines, acid-green selections, and
  an illustrated exchange demonstrate the game before asking someone to play.
- The initial form asks for a name and a mode. Room codes, competitive modes,
  and avatars remain available through labeled disclosures. Invitations identify
  their room and explain that the host controls its mode.
- A compact horizontal room header replaces the permanent sidebar. The canvas
  has priority; scores and settings expand on demand and close on outside clicks
  or Escape. Escape returns focus to the disclosure.
- Drawing controls sit below the board. Viewers see their role and Save instead
  of inactive drawing controls. During a drawing turn, disabled chat/reaction
  controls give their space to the canvas; the live room log remains available.
- Results lead with the actual outcome, followed by numbered prints, artist
  attribution, replay and sharing. A single print uses the available desktop
  width; several prints form a grid. AI verdicts describe the recorded result,
  and human-only games do not invent an AI verdict.
- Small paper confetti replaces emoji rain. Only correct guesses and victories
  earn it; reduced motion suppresses it. No-score results stay honest.
- Copy supplies dry asides while labels, errors, permissions, privacy and
  confirmations stay explicit. User names, messages and custom words are preserved.
- Install previews and the social card match the new direction. The service-worker
  cache is refreshed. The existing acid-green favicon already belongs to this palette.

## Captures

| Screens | Files |
| --- | --- |
| Public page | `join-desktop-light.jpg`, `join-desktop-dark.jpg` |
| Phone entry | `join-mobile-light.jpg`, `join-mobile-dark.jpg`, `join-tiny-light.jpg`, `join-tiny-dark.jpg` |
| Room and rules | `lobby-desktop.jpg`, `lobby-mobile.jpg`, `settings-desktop.jpg`, `settings-mobile.jpg` |
| Word selection | `word-choice-desktop.jpg`, `word-choice-mobile.jpg` |
| Drawing and guessing | `drawing-desktop.jpg`, `drawing-desktop-dark.jpg`, `drawing-mobile.jpg`, `drawing-tiny.jpg`, `guessing-mobile.jpg` |
| Turn break | `turn-recap-desktop.jpg` |
| Share outputs | `room-invite.png`, `shared-evidence.png` |
| Finished game | `results-desktop.jpg`, `results-desktop-dark.jpg`, `results-mobile.jpg`, `results-mobile-dark.jpg` |

Refresh with `CAPTURE_UI=1 pnpm test:e2e --workers=1`, then inspect the images.
Capture animation is disabled so phase transitions do not blend two screens into
one image. Tests still exercise normal transitions outside the capture itself.
Invite cards bundle the licensed Inter font, since Workers do not provide system fonts.
The test worker has no Workers AI binding and checks mock health before every AI request.
The install previews retain the dimensions declared by the manifest.

## Verification outcome

Repository verification and the complete Chromium/WebKit browser suite passed.
Desktop, phone and 320 px captures were inspected in both palettes, including
word selection, drawing, guessing, settings, completed games and share outputs.
The final round check confirms post-round jokes do not become guesses or awards.

## Verification boundaries

Repository verification covers types, lint, source checks, package tests and
production builds. Browser flows cover quick entry, invite semantics, modes,
settings, drawing, guessing, results, replay, keyboard controls, dialogs, sound,
connection recovery and drafts. Responsive checks include light/dark palettes,
320 px, 390 px, desktop and phone rotation.

Chromium and WebKit automation does not establish physical-phone performance or
VoiceOver/TalkBack quality. Vision tests use the mock provider; paid vision quality,
latency and cost remain untested. The existing live shared-secret setup is a
separate deployment requirement. No production credentials, live Worker configuration
or production room contents were changed. The Worker bundle includes the licensed
preview font.
