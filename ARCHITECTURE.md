# Architecture

iguess has three runtime boundaries: a browser client, a room-owning game server,
and a vision worker. Shared types and pure rules live in `shared/`.

## Client

`App` owns the join draft; `useRoomEntry` owns entry, leaving, and browser Back behavior. `JoinScreen` renders the
join form and a clearly labeled static drawing example. `roomLinks` parses
current and legacy invitations; `playerStats` owns browser-local statistics.

`Room` connects the socket to the board, banner, sidebar, scoreboard and chat.
`roomView` derives roles and permissions from the server snapshot. Component
state does not grant authority to start games, score guesses or choose drawers.

Room effects have separate owners:

- `useGameFeedback`: audio, vibration and result celebrations.
- `useRoundGallery`: capture completed drawings, preserve stroke replays and track AI guesses.
- `useRoomSharing`: invites, copied results and evidence images, including failure feedback.
- `useChatDraft`: session-scoped unsent chat, preserved across refresh and cleared after sending.
- `useDrawingShortcuts`: drawing-area shortcuts that leave text fields and dialogs alone.
- `useGameSocket`: socket connection, server messages, outgoing actions and draw subscriptions.

`DrawingCanvas` renders local strokes immediately for the drawer. It replays
server operations for everyone else. Coordinates are normalized, and shared
undo rules keep client and server stroke handling aligned. The eraser removes
pixels rather than painting white, so fill remains consistent with transparency.

`index.css` owns the palette, game layout, shared motion and responsive rules;
`join.css` owns the public join screen, `game.css` the drawing-club workspace, and
`resources.css` the shared help/legal and confirmation dialogs. `styles.ts` contains typed component
styles. Token-based light and dark palettes follow system preferences. Reduced
motion suppresses decorative animation, and confetti is not constructed when
motion is reduced.

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
live timeline. Room state is currently in memory rather than persisted in the
object’s SQLite storage: eviction can end a game.

## Engine and modes

`GameEngine` owns phase changes, word selection timing, hints, scoring and turn
transitions. A `GameMode` supplies drawing order, word choices and chat rules.
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

AI requests happen outside socket message handling. A slow or failed call does
not pause the room. Guess cadence responds to new ink, and attempt and room
budgets limit paid requests. Provider failures and mock fallback are disclosed
rather than presented as normal vision guesses.

The AI drawer is not an image generator. It reveals curated vector strokes over
time with procedural variation. A generator can be injected through its existing
request-drawing seam without adding AI-specific logic to the engine.

## Reconnects and limits

A reconnecting player has a grace window that preserves their role and score.
The reconnect ID is client-asserted; it is not a signed identity token. This is a
known trust limit, not account authentication.

Room capacity, spectators, connection rate limits, message limits and AI request
budgets bound the app’s abuse surface. Watchers can be promoted into available
seats. The edge rate limiter can be absent in local development; production
bindings are configured in the game Worker’s Wrangler file.

## Validation and deployment

`pnpm run verify` is the local and CI gate. Package tests cover pure rules, engine
behavior, provider adapters and selected client behavior. Repository checks pin
file ceilings, enforce comment constraints and hold package test floors.

End-to-end tests run the real local game Worker and Durable Object. Their AI
worker is pinned to mock, and the game server is started without a paid worker
URL. Browser checks should include drawing/guessing roles, word secrecy, results,
reconnects, keyboard access and narrow layouts.

The game Worker serves the client’s production assets and room sockets on one
origin. GitHub Actions deploys both Workers after checks pass on `main`.
See [DEPLOY.md](DEPLOY.md) for configuration.

## Known limits

- In-memory rooms do not survive eviction.
- Reconnect IDs can be claimed by another client; signed tokens would close that gap.
- Raster fill replay at different sizes is visually close rather than bit-identical.
- Mock-based tests do not establish paid-provider quality or real-device performance.

Persisted room state and signed reconnect tokens are separate product changes;
UI cleanup does not silently implement either.
