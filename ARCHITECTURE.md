# Architecture

Current analytics: `analytics/` holds the fixed browser/Worker event contract, bounded
anonymous ingestion and credential-free transport. See [Analytics](docs/ANALYTICS.md) for
coverage, privacy and dashboard queries. Private app paths are not traffic dimensions.

iguess has three runtime boundaries: a browser client, a room-owning game server,
and a vision worker. Shared types and pure rules live in `shared/`.

## Client

`useJoinDraft` owns entry drafts, explicit fresh/rejoin intent, invitations and avatar selection; `useRoomEntry` owns entry, leaving, and browser Back behavior. `App` composes them. `JoinScreen` renders the
join form and a clearly labeled static drawing example through `JoinForm` and `DoodlePoster`. `roomLinks` parses
current and legacy invitations; `playerStats` owns browser-local statistics.
After entry, the join draft prepares a fresh room so Leave and browser Back cannot
silently reuse a running game. Rejoin explicitly selects the previous room. Entry writes
the current room and requested mode into the URL so refresh preserves the destination.

`RoomGate` loads the game chunk only after entry, with a loading screen and error boundary.
`Room` connects the socket to the board, banner, compact room header, scoreboard and chat.
`roomView` derives roles and permissions from the server snapshot. Component
state does not grant authority to start games, score guesses or choose drawers.

Room effects have separate owners:

- `useGameFeedback`: event-specific audio, vibration and result celebrations; only observed participation updates lifetime stats.
- `usePreference` and `FeedbackSettings`: synchronized browser-local sound, haptics and motion choices.
- `useRoomViewport`: keeps composition inside a reduced visual viewport when a mobile keyboard opens.
- `useRoundGallery`: capture completed drawings, preserve stroke replays and track explicitly marked AI guesses, excluding post-round commentary.
- `useRoomSharing`: invitations and copied results, including pending requests and selectable link recovery.
- `useEvidenceSharing`: gallery image preparation, downloads and native sharing from a fresh click; stale work cannot download after leaving or starting another gallery.
- `Replay`: one-pass stroke playback with pause, restart, progress and background-tab pause.
- `evidenceCard`: bounded image export with artist captions and missing-preview fallbacks; `share.ts` owns file capability checks and delivery.
- `useChatDraft`: session-scoped unsent chat, preserved across refresh and cleared after sending.
- `useDrawingShortcuts`: drawing-area shortcuts that leave text fields and dialogs alone.
- `useGameSocket`: composes transport, state and outgoing actions. `roomTransport` owns retries and listeners; `roomMessages` reduces checked server messages. Drawing subscriptions bypass React state.

Transport construction failures enter the retry loop. Sending returns false if the owner is
disposed or the socket fails during submission, so the composer keeps its draft. Clipboard
fallback removes its temporary field and restores focus. Invitations coalesce pending requests;
unmounted sharing work cannot update the next room or start a fallback download.

`DrawingCanvas` owns rendering and resize replay; `useCanvasPointer` owns pointer identity, animation-frame batching and final-batch flushing. The canvas renders local strokes immediately for the drawer. It replays
server operations for everyone else. Coordinates are normalized, and shared
undo rules keep client and server stroke handling aligned. The eraser removes
pixels rather than painting white, so fill remains consistent with transparency.

`index.css` owns the palette, typography and shared motion;
`join.css` owns the public join screen, `game.css` the studio workspace, and
`resources.css` the shared help/legal and confirmation dialogs. `styles.ts` contains typed component
styles. `useDismissibleDetails` gives room disclosures consistent outside-click and Escape behavior. Token-based light and dark palettes follow system preferences. Reduced
motion and the personal motion preference suppress decorative animation. Phase changes animate the banner locally; the canvas stays stable.

## One room, one owner

The game Worker routes each room socket to a named `GameRoom` Durable Object.
That object owns its connections, roster, settings, stroke log and engine. It
broadcasts locally within the room; no external pub/sub layer is needed.

The server is authoritative. Only the active drawer can submit drawing
operations during play. Guess scoring, turn order and game phases are calculated
by the engine, and server validation applies even if a modified client sends
invalid actions. The secret word is sent only to the drawer.

Sockets are pinned rather than hibernating because the engine’s timers need the
object to stay resident. This trades idle-room efficiency for a straightforward
live timeline. `RoomPersistence` coalesces changes into versioned checkpoints through
`CheckpointStore`, using the existing durable storage. Checkpoints expire after a day of
inactivity. Atomic bounded chunks retain the engine, mode progress, roster, settings, ink,
word memory, AI budget and hashed reconnect credentials. Chat and browser galleries are not
server history. After a restart the clock resumes from the last completed checkpoint;
previous seats have a short reconnect window.

`visionTypes.ts` defines the vision-provider port independently of selection and configuration.
Paid adapters implement that contract without importing the provider factory.

## Engine and modes

`GameEngine` owns phase changes, word selection timing, hints, scoring and turn
transitions. `EngineState` owns serializable game data; `GameClock` owns cancellable
deadlines. Disposing an engine cancels all deadlines and mode loops. Modes snapshot their
rotation, bets and AI progress and resume without starting a fresh turn. A `GameMode` supplies drawing order, word choices and chat rules.
`engineContext.ts` owns the room-I/O port used by the engine and context adapter. Neither the
context adapter nor a mode needs to import the concrete engine to name its dependencies.
The engine does not contain separate branches for human and AI players.

Classic is the base human mode. AI Guesser adds a virtual player; AI Drawer emits
curated doodle strokes through the engine’s draw operation. Team Battle scores
round wins between humans and AI. Duel alternates drawing roles and accumulates
points. Mode-specific behavior stays in these strategies.

Shared functions define word matching, difficulty, undo operations and awards.
Rules consumed by both client and server should stay in `shared/` rather than
being reimplemented on each side.

## AI guessing

The game server submits a drawing snapshot to the separate AI worker. That worker
renders stroke operations to an image and asks a configured vision provider.
The request includes a masked hint, never the secret answer. Providers share an
interface; mock behavior keeps tests independent of credentials.

The public `/play-status` route checks cached worker health, never a vision request; entry can offer the curated drawer when live vision is unavailable.

AI requests happen outside socket message handling. A slow or failed call does
not pause the room. Guess cadence responds to new ink, and attempt and room
budgets limit paid requests. Provider attempts have deadlines; late responses cannot
speak, draw or score after loop disposal. The AI Worker validates bounded input and
shares one WASM initializer with explicit renderer resource disposal for vision and invite cards. Vision exports preserve fills, transparent erasing, pressure widths, stroke order and undo through shared drawing rules. Provider failures and mock fallback are disclosed
rather than presented as normal vision guesses. Per-room commentary avoids recent punchlines and acknowledges unavailable vision.

The AI drawer is not an image generator. It reveals curated vector strokes over
time with procedural variation. A generator can be injected through its existing
request-drawing seam without adding AI-specific logic to the engine.

## Reconnects and limits

A reconnecting player has a grace window that preserves their role and score.
The server issues an opaque room-local reconnect credential; a public player ID cannot
reclaim a seat. Only the credential digest is checkpointed. WebSocket negotiation carries the credential
without putting it in request URLs or invitation links. The browser keeps the credential
in session storage with an in-memory fallback when storage is blocked. Opening the same
credential again replaces the former socket, and a host kick revokes it. Legacy claimed IDs
are ignored. This proves possession of a room credential, not account authentication.

`RoomRoster` owns seats, ready states, host transfer and reconnect reservations. `RoomCanvas`
bounds retained operations. `roomActions` checks host/player permissions. Shared wire
decoders validate message shapes, point ranges, batch sizes and reactions before dispatch.
Cross-origin browser socket requests are rejected. Room capacity, spectators, connection
rate limits, message limits and AI request
budgets bound the app’s abuse surface. Watchers can be promoted into available
seats. The edge rate limiter can be absent in local development; production
bindings are configured in the game Worker’s Wrangler file.

## Validation and deployment

`pnpm run verify` is the local and CI gate. Package tests cover pure rules, engine
behavior, provider adapters and selected client behavior. Repository checks pin
file ceilings, enforce comment constraints and hold package test floors.

End-to-end tests run the real local game Worker and Durable Object. Their AI
worker is pinned to mock, and the game server is started without a paid worker
URL. Journeys use the production client served by that Worker. Two pure rendering/export
probes use a separate Vite origin to import source modules. Browser checks include
drawing/guessing roles, word secrecy, results, reconnects, keyboard access and narrow layouts.

The service worker caches only same-origin static responses. Successful public homepage HTML
refreshes the offline shell; invitation HTML, query-bearing pages and server failures cannot
replace it. Cache writes extend the fetch event lifetime, and activation removes only older
iguess caches. The installed-shell journey checks real cache behavior and offline reopening.

The game Worker serves the client’s production assets and room sockets on one
origin. GitHub Actions deploys both Workers after checks pass on `main`.
See [DEPLOY.md](DEPLOY.md) for configuration.
The [quality guide](docs/quality.md) records browser setup, local HTTP policy and coverage limits.

## Known limits

- Recovery resumes the last completed checkpoint, not every in-flight pointer event.
- Room-local possession credentials are not accounts or private-room authorization.
- Vision and browser rendering share stroke geometry and scanline fill rules; antialiasing can differ between renderers.
- Raster fill replay at different sizes is visually close rather than bit-identical.
- Mock-based tests do not establish paid-provider quality or real-device performance.
