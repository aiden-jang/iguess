# is-it-a-dog

A real-time, multiplayer drawing-and-guessing game (skribbl.io style) where an
**AI vision model competes as one of the guessers** — looking at the live canvas
and shouting out answers alongside the humans. (Spoiler: it guesses "dog" a lot.)

The interesting part isn't the game; it's the architecture. The core game engine
knows nothing about AI. Game **modes** are pluggable strategies layered on top, so
"AI as guesser", "AI as drawer", or "Humans vs AI" are additions, not rewrites.

---

## Highlights

- **Authoritative server.** The drawer paints locally for zero perceived latency;
  the server is the source of truth, persists every stroke, and relays to others.
  No client can cheat the game state.
- **Word secrecy by construction.** The secret word is only ever *sent* to the
  drawer (`your_word`), and is **never** sent to the AI worker. Anti-cheat is
  enforced by the absence of data, not by client-side trust.
- **Engine / mode separation.** `engine.ts` owns the turn timeline and scoring
  machinery and is mode-agnostic. A `GameMode` (strategy pattern + dependency
  injection) decides drawer order, word choice, and how chat is interpreted.
  `AIGuesserMode` adds a whole feature in ~70 lines without touching the engine.
- **AI as a virtual player.** The AI is injected into the roster as a normal
  participant, so it flows through the *same* presence, scoring, and turn-end
  logic as humans — no special cases in the engine.
- **Vision off the hot path.** A separate `ai-worker` process renders the stroke
  log to a PNG and calls a vision model. Slow/failed calls never block the
  WebSocket event loop; failures degrade gracefully to "no guess".
- **Pluggable vision providers.** Mock / OpenAI / Anthropic behind one interface,
  auto-selected by environment. Runs with **zero API keys** via the mock provider.

---

## Architecture

```
            Browser (React + Canvas)
        ┌──────────────────────────────┐
        │  DrawingCanvas   Chat/Score   │
        │      │  ▲            │  ▲      │
        │  draw│  │remote   chat│  │state│
        └──────┼──┼────────────┼──┼─────┘
               │  │            │  │
               ▼  │            ▼  │        WebSocket (raw `ws`)
        ╔══════════════════════════════════════╗
        ║            game-server                ║
        ║                                       ║
        ║   index.ts  (WS plumbing, rooms)      ║
        ║       │                               ║
        ║       ▼                               ║
        ║   engine.ts  ── stable turn timeline ─║──► Redis
        ║       │        scoring, draw-lock     ║   (presence hash,
        ║       ▼                               ║    stroke LIST)
        ║   GameMode (strategy)                 ║
        ║   ├─ ClassicMode   (humans only)      ║
        ║   └─ AIGuesserMode (adds virtual AI)  ║
        ║              │                        ║
        ╚══════════════┼═══════════════════════ ╝
                       │ HTTP POST /guess { ops }
                       ▼
        ┌───────────────────────────────────────┐
        │            ai-worker (Express)         │
        │   canvasRenderer: ops → PNG            │
        │   VisionProvider: Mock|OpenAI|Anthropic│
        └───────────────────────────────────────┘
```

**Why these choices:**

| Decision | Choice | Rationale |
|---|---|---|
| State authority | Authoritative server | Prevents cheating; one source of truth. Drawer renders locally to hide latency. |
| Transport | Raw `ws` (not Socket.IO) | Visibility into the protocol; no hidden reconnection/room magic. |
| Stroke format | Normalized 0–1 coords, streamed ops | Resolution-independent; small messages; replayable for late joiners and the AI. |
| AI guess timing | Interval (≈8s first, every 10s, max 4/turn) | Bounds cost/latency; live guessing feels alive without spamming the model. |
| AI process | Separate worker | Vision calls are slow; isolating them keeps the WS loop responsive. |
| AI identity | Virtual player in roster | Reuses all human scoring/turn logic; no engine special-casing. |

---

## Project layout

```
shared/events.ts                 the typed client↔server contract
packages/game-server/            WebSocket server + engine + modes
  src/index.ts                   WS plumbing, rooms, presence
  src/engine.ts                  mode-agnostic turn timeline & scoring
  src/modes/GameMode.ts          EngineContext + GameMode interface
  src/modes/ClassicMode.ts       base mode (humans take turns)
  src/modes/AIGuesserMode.ts     extends ClassicMode, adds AI guesser
  src/services/aiWorkerClient.ts resilient HTTP client to ai-worker
  src/words.{ts,json}            configurable word list
packages/ai-worker/              vision service (Express)
  src/canvasRenderer.ts          DrawOps → PNG via @napi-rs/canvas
  src/visionProviders.ts         Mock | OpenAI | Anthropic
packages/client/                 React + Vite + Canvas UI
```

---

## Running locally

Requires **Node 22** (see `.nvmrc`) and a Redis on `:6379`.

```bash
nvm use 22
npm install
cp .env.example .env        # optional: add an API key for a real vision model

# terminal 1 — Redis (or use an existing local instance)
npm run redis

# terminal 2 — game server (ws://localhost:8080)
npm run dev:server

# terminal 3 — AI worker (http://localhost:8090)
npm run dev --workspace=ai-worker

# terminal 4 — client (http://localhost:5173)
npm run dev:client
```

Open two browser tabs, join the same room, and pick the **AI** mode from the
join screen (or append `?mode=ai`) to play against the vision model. With no API
key configured the mock provider makes random guesses so everything still works.

### Docker Compose

```bash
docker compose up
```

Brings up Redis, the AI worker, and the game server together. Pass an
`OPENAI_API_KEY` or `ANTHROPIC_API_KEY` in your environment (or `.env`) to use a
real vision model.

---

## Game modes

A mode implements the `GameMode` interface and receives an `EngineContext` of
verbs (`broadcast`, `awardPoints`, `endTurn`, `addParticipant`, …). The engine
calls into the mode at well-defined points (`configure`, `pickDrawer`,
`pickWord`, `onTurnStart`, `onChat`, `canDraw`, `onTurnEnd`). To add a mode you
write a class — you don't modify the engine.

- **ClassicMode** — humans take turns drawing; everyone else guesses via chat.
- **AIGuesserMode** — extends ClassicMode, injects a virtual AI participant that
  guesses off the live canvas on an interval.

Planned: AI-as-drawer, Humans-vs-AI team battle — both as new modes.
