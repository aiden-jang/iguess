# iguess

A multiplayer drawing-and-guessing game in the skribbl.io vein, with one twist:
an AI vision model plays as one of the guessers. It looks at the live canvas and
types answers into chat along with everyone else. (It guesses "dog" a lot.)

**Live:** [iguess.aidenjang.com](https://iguess.aidenjang.com)

`TypeScript` · `Cloudflare Workers` · `Durable Objects` · `raw WebSockets` · `React` · `Vite` · `Canvas`

The game itself is straightforward; I built it mostly to work on the structure.
The game engine has no idea AI exists. Everything AI-related lives in game
*modes*, which plug into the engine, so "AI guesser", "AI drawer", "humans vs
AI", and "you vs AI" are separate modes rather than changes to the core.

> Part of a [platform of apps](https://github.com/aiden-jang/platform/blob/main/PLATFORM.md) that share one sign-in. For the design decisions and
> how I'd scale it, see **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

---

## Screenshots

The drawer sees the word and sketches it; the AI is in chat guessing off the
canvas. Here, "GUITAR":

![Drawer's view: the word GUITAR, a sketch on the canvas, and the AI guessing in chat](docs/gameplay.png)

The same canvas in a guesser's window. They only see masked letters, not the
word. Proof the strokes sync live and the word stays secret:

![Guesser's view: masked word tiles and the same live canvas](docs/gameplay-guesser.png)

| Join screen | Word choice |
|---|---|
| ![Join screen with name, room, and mode picker](docs/join.png) | ![Drawer picking one of three offered words](docs/choosing.png) |

<!--
  Screenshots captured by driving two browser sessions through a real game with
  Playwright; the script lives outside the repo. To refresh them, run the app
  (see "Running locally"), play a round, and replace the PNGs in docs/.
  A short GIF of the live sync would be even better if you record one.
-->

---

## What's in it

- The server is authoritative. The drawer paints locally so their own strokes
  feel instant, but the server holds the real state, saves every stroke, and
  relays them to everyone else. Clients can't fake game state.
- The secret word is only ever sent to the drawer (`your_word`), and never to the
  AI worker. So there's nothing to cheat with: the word just isn't in the data a
  client or the AI receives.
- The engine and the modes are separate. `engine.ts` runs the turn timeline and
  scoring and doesn't know any game rules. A `GameMode` decides who draws, what
  the word is, and how chat is read. `AIGuesserMode` is about 70 lines and
  doesn't touch the engine.
- Full game loop: multiple rounds with a rotating drawer, a word-choice step
  (pick one of three), letter hints that reveal as the timer runs down, scoring
  that rewards guessing fast, and guess matching that ignores case, accents, and
  punctuation (plus a private "so close!" when you're one letter off).
- The AI joins the roster as a regular player, so it goes through the same
  presence, scoring, and turn-end code as a human. The engine has no AI branch.
- Vision runs in a separate `ai-worker` Worker that turns the stroke log into a
  PNG and calls a model. A slow or failed call won't block the WebSocket loop; it
  just means no guess that round.
- Vision providers (mock / OpenAI / Anthropic) sit behind one interface and are
  picked based on env vars. With no API key it uses the mock and still runs.

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
               ▼  │            ▼  │        WebSocket (wss, raw)
        ╔══════════════════════════════════════╗
        ║   game-server Worker                   ║
        ║                                        ║
        ║   worker.ts  (routing, SPA assets)     ║
        ║       │  /rooms/:id/ws → Durable Object ║
        ║       ▼                                ║
        ║   GameRoom (Durable Object, 1/room)    ║
        ║       │   in-memory roster + stroke log ║  (single-threaded per room;
        ║       ▼   pinned WebSockets for timers   ║   no external store needed)
        ║   engine.ts ── turn timeline, scoring ─ ║
        ║       ▼                                ║
        ║   GameMode (strategy)                  ║
        ║   ├─ ClassicMode   (humans only)       ║
        ║   ├─ AIGuesserMode (adds virtual AI)   ║
        ║   ├─ AIDrawerMode  (AI draws)          ║
        ║   ├─ TeamBattleMode(humans vs AI)      ║
        ║   └─ DuelMode      (you vs AI)         ║
        ║              │                         ║
        ╚══════════════┼════════════════════════ ╝
                       │ HTTP POST /guess { ops }
                       ▼
        ┌───────────────────────────────────────┐
        │            ai-worker (Worker)          │
        │   strokeRender: ops → PNG (resvg-wasm) │
        │   VisionProvider: Mock|OpenAI|Anthropic│
        └───────────────────────────────────────┘
```

A few of the choices and why:

| Decision | Choice | Why |
|---|---|---|
| State authority | Authoritative server | One source of truth, and clients can't cheat. The drawer renders locally to hide latency. |
| Room runtime | One Durable Object per room | A room is single-threaded per its id, so roster + stroke log live in the object's memory: no external store, no lock, no cross-instance race. An idle room costs nothing. |
| Dropped Redis | In-memory in the DO | The old Node build used Redis for presence + strokes across instances. A Durable Object *is* the single instance for a room, so that entire dependency (and its ops cost) went away in the port. |
| WebSocket style | Pinned (`server.accept()`), not hibernation | The turn timeline runs on `setTimeout`/`setInterval`; hibernation evicts timers, so a room stays pinned while a game is live. |
| Transport | Raw `ws`, not Socket.IO | I wanted to see the actual protocol instead of relying on hidden reconnection/room behavior. |
| Player identity | Client-asserted `pid` in `sessionStorage` | A reconnect has to be the *same* player or you lose your score, your place in the draw order and your turn. The server gives a returning `pid` an 8-second grace window and rejoins it silently. Keeping that id in `sessionStorage` rather than a variable is what makes it survive a refresh — the most common reconnect there is — while staying per-tab, so two tabs on one device are still two players. |
| Stroke format | Normalized 0–1 coords, streamed ops | Works at any canvas size, messages stay small, and the op log replays for late joiners and the AI. |
| AI guess timing | Interval (~8s first, then every 10s, max 4/turn) | Keeps cost and latency bounded without spamming the model. |
| AI process | Separate Worker | Vision calls are slow, so I kept them off the WebSocket loop. |
| AI identity | Virtual player in roster | Lets it reuse the human scoring/turn code instead of adding AI special cases. |

---

## Project layout

```
shared/events.ts                 the typed client↔server contract
packages/game-server/            game Worker: routing + Durable Object + engine + modes
  src/worker.ts                  fetch handler: routes /rooms/:id/ws → DO, serves the SPA
  src/GameRoom.ts                Durable Object: one per room, holds roster + stroke log
  src/engine.ts                  mode-agnostic turn timeline & scoring
  src/modes/GameMode.ts          EngineContext + GameMode interface
  src/modes/ClassicMode.ts       base mode (humans take turns)
  src/modes/AIGuesserMode.ts     extends ClassicMode, adds AI guesser
  src/modes/AIDrawerMode.ts      AI is the sole drawer
  src/modes/TeamBattleMode.ts    Humans vs AI, round-win race
  src/modes/DuelMode.ts          You vs AI, alternating drawer, cumulative points
  src/ai/{aiGuessLoop,aiDrawLoop}.ts  composable AI cadence helpers
  src/text.ts                    guess normalization + close-match
  src/services/aiWorkerClient.ts resilient HTTP client to ai-worker
  src/words.{ts,json}            configurable word list
packages/ai-worker/              vision Worker
  src/worker.ts                  fetch handler: POST /guess, /health
  src/strokeSvg.ts               DrawOps → SVG (pure)
  src/strokeRender.ts            SVG → PNG via @resvg/resvg-wasm
  src/visionProviders.ts         Mock | OpenAI | Anthropic
packages/client/                 React + Vite + Canvas UI
```

---

## Running locally

Requires **Node 22** (repo `.nvmrc`) and pnpm. No Redis, no Docker. The game
server, the Durable Object, and the AI worker all run under `wrangler dev`
(Miniflare), and the client runs under Vite.

```bash
pnpm install

# terminal 1: game-server on :33300 + GameRoom Durable Object. For AI modes, point it at the
# local ai-worker (terminal 2); classic mode works without this override.
pnpm --filter @iguess/game-server dev -- --var AI_WORKER_URL:http://localhost:33400

# terminal 2: ai-worker (vision) on :33400
pnpm --filter @iguess/ai-worker dev

# terminal 3: client (http://localhost:33100, proxies /rooms to the game server)
pnpm --filter @iguess/client dev
```

Open two browser tabs, join the same room, and pick the **AI** mode from the
join screen (or append `?mode=ai`) to play against the vision model. With no API
key configured the mock provider makes random guesses so everything still works;
set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` as a `wrangler secret` on the
ai-worker for a real model. See [DEPLOY.md](DEPLOY.md) for production.

### Quick demo

The thing worth showing is live sync plus the AI guessing on one screen. Open two
browser windows side by side.

1. Window A: join room `demo` as `Alice`, mode "AI guesser (🤖 competes)".
2. Window B: join room `demo` as `Bob`, then click Start game.
3. Whoever's drawing, start drawing. The strokes show up in the other window
   right away.
4. After ~8s the AI starts guessing in the same chat as the human. Land a guess
   and the scoreboard updates.

For the other modes, start a fresh room as "AI drawer" (the AI draws, you guess),
"Team battle" (humans vs AI), or "You vs AI" (trade turns with the machine).
Same engine, different mode.

### Tests

```bash
pnpm -r test                              # 65 tests: 44 game-server, 21 ai-worker
pnpm --filter @iguess/game-server test    # engine + modes + helpers
pnpm --filter @iguess/ai-worker test      # stroke→SVG + vision providers
```

The engine tests run whole games through the `GameEngine` with in-memory deps
(no sockets or real timers), covering rounds, scoring, hints, the word-choice
step, and guess matching.

---

## Talking about this

[ARCHITECTURE.md](ARCHITECTURE.md) is the long version and it's written for exactly this. The short
version is below.

**The short version.** Realtime draw-and-guess rooms like skribbl.io, except an AI actually looks at
the canvas and races you to name the drawing. Five modes on one engine that doesn't know AI exists.

**The shape.** One Durable Object per room owns the WebSocket connections and the game state, so the
roster and stroke log sit in memory with no Redis and no cross-instance race. A separate Worker
rasterizes the strokes to a PNG and calls a vision model, on an interval, off the socket loop.

**The call I'd defend.** The game timeline and the game rules are different things. `engine.ts` owns
turns, scoring and phases and contains zero game rules. Each mode is a strategy behind a fixed set of
hooks. Four of the five modes were added after the engine froze without touching it. The one time the
engine did have to change was a single transport-agnostic `draw` verb, added when AI-as-drawer
actually needed it rather than guessed at up front.

**Why Durable Objects, said properly.** A room needs one writer. On a normal stack that means a
room-affinity cluster plus Redis plus a lock, and you spend real time on the case where two instances
think they own the same room. A Durable Object is that cluster, already built. This project started
on Node with ws and Redis and ported over with the engine and modes unchanged, which is the cleanest
evidence the split was in the right place.

**AI is never on the hot path.** Vision runs on an interval with a hard per-turn cap and a fallback
chain: a paid key, then free Workers AI, then a mock. A slow or failed guess degrades to no guess. It
never blocks the socket loop, and a per-room lifetime spend budget means a "run it back" loop can't
run up a bill.

**What breaks first.** Nothing shared, because rooms don't talk to each other. The per-room limits are
the real ones: 8 players, a 200 msg/s token bucket per connection, and a per-IP cap checked at the
edge before the Durable Object is even created, so one client can't spin up unbounded rooms.

**What I'd change.** Reconnect identity is a `pid` the client asserts on the connect URL. It preserves
score and drawer role across a drop, which is what it was for, but nothing stops one client claiming
another's id. A signed token would fix it and I'd do that before this had real users.

## Game modes

A mode implements the `GameMode` interface and gets an `EngineContext` of verbs
(`broadcast`, `awardPoints`, `endTurn`, `addParticipant`, and so on). The engine
calls the mode at set points (`configure`, `pickDrawer`, `pickWord`,
`pickWordChoices`, `onTurnStart`, `onChat`, `canDraw`, `onTurnEnd`, `onGameEnd`).
Adding a mode means writing a class, not editing the engine.

- **ClassicMode.** Humans take turns drawing, everyone else guesses in chat.
  The other four build on this one.
- **AIGuesserMode.** Adds an AI player that guesses off the live canvas on a
  timer.
- **AIDrawerMode.** The AI does all the drawing (its strokes go through the
  engine via `ctx.draw`) and humans guess.
- **TeamBattleMode.** Humans vs AI. Rounds alternate who draws, and the first
  correct guess wins the round for that side.
- **DuelMode.** You vs the AI, head-to-head. You trade the drawer role each turn
  (you draw and the AI reads your canvas; then the AI draws and you guess), and
  both sides bank cumulative points — so unlike TeamBattle's round-win race, the
  AI earns points both as guesser and as drawer. Most points beats the machine.

The `pickWordChoices` hook drives the word-choice step: return 2+ words and the
drawer gets to choose one; return `null` to skip it (the AI drawer just picks its
own word).

## Observability

- **Errors + requests:** Workers Logs is enabled (`[observability]` in both workers'
  `wrangler.toml`), so uncaught throws are captured for the game-server and the ai-worker. Tail live
  with `pnpm --filter @iguess/game-server exec wrangler tail` (or `@iguess/ai-worker`).
- **Uptime:** each worker exposes `GET /health`, ready for a free external monitor (e.g.
  UptimeRobot).
