# is-it-a-dog

A real-time, multiplayer drawing-and-guessing game (skribbl.io style) where an
**AI vision model competes as one of the guessers** — looking at the live canvas
and shouting out answers alongside the humans. (Spoiler: it guesses "dog" a lot.)

The interesting part isn't the game; it's the architecture. The core game engine
knows nothing about AI. Game **modes** are pluggable strategies layered on top, so
"AI as guesser", "AI as drawer", or "Humans vs AI" are additions, not rewrites.

> 📐 For the design rationale, trade-offs, and how I'd scale it, see
> **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

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
- **A polished play loop.** Multiple rounds with a rotating drawer, a skribbl-style
  **word-choice phase** (the drawer picks one of three before drawing), progressive
  letter hints that reveal as the clock drains, speed-weighted scoring, and
  forgiving guess matching (case/accents/punctuation-insensitive, with a private
  "so close!" nudge on a one-letter miss).
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
        ║   ├─ AIGuesserMode (adds virtual AI)  ║
        ║   ├─ AIDrawerMode  (AI draws)         ║
        ║   └─ TeamBattleMode(humans vs AI)     ║
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
  src/modes/AIDrawerMode.ts      AI is the sole drawer
  src/modes/TeamBattleMode.ts    Humans vs AI, round-win race
  src/ai/{aiGuessLoop,aiDrawLoop}.ts  composable AI cadence helpers
  src/text.ts                    guess normalization + close-match
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

### 30-second demo script

The most compelling thing to show is **real-time sync + a live AI competitor in
one screen.** Use two browser windows side by side.

1. **Window A:** join room `demo`, name `Alice`, mode **"AI guesser (🤖 competes)"**.
2. **Window B:** join room `demo`, name `Bob`. Click **Start game**.
3. Whoever is the drawer: **start drawing** — point at Window B and note the
   strokes appear there instantly (authoritative server relaying live ops).
4. Within ~8s, **🤖 AI** starts dropping guesses into the same chat feed,
   racing the human guesser. Land a guess and watch the scoreboard update.
5. Punchline line to say out loud: *"The AI is a vision model looking at the
   canvas in a separate worker process — and the engine has no idea it exists.
   It's just another player plugged in through the mode interface."*

Want to show range? Re-join a fresh room as **"AI drawer"** — the AI draws and
you guess — or **"Team battle"** for Humans-vs-AI. Same engine, different mode.

### Tests

```bash
npm test    # engine + modes + helpers, via Node's built-in test runner
```

The suite drives the `GameEngine` through whole games against in-memory deps —
no sockets, Redis, or timers required — covering rounds, scoring, hints, the
word-choice phase, and forgiving guess matching.

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
`pickWord`, `pickWordChoices`, `onTurnStart`, `onChat`, `canDraw`, `onTurnEnd`,
`onGameEnd`). To add a mode you write a class — you don't modify the engine.

- **ClassicMode** — humans take turns drawing; everyone else guesses via chat.
  The base class the other three extend or compose.
- **AIGuesserMode** — extends ClassicMode, injects a virtual AI participant that
  guesses off the live canvas on an interval.
- **AIDrawerMode** — the AI is the sole drawer (strokes arrive through the engine
  via `ctx.draw`); humans race to guess.
- **TeamBattleMode** — Humans vs AI: rounds alternate who draws, and the first
  correct guess wins the round for its side.

The optional `pickWordChoices` hook is what powers the word-choice phase: a mode
returns 2+ words to trigger a "choosing" phase (human drawers), or `null` to skip
it (AI drawers pick their own renderable word).
