# Architecture

A deep-dive into how _iguess_ is built, why it's structured this way, and
what I'd change to take it to production. Written to be read top-to-bottom; each
section ends with the trade-off I actually made.

## TL;DR: the decisions that matter

The five that shaped everything else:

1. **Engine vs. modes (§1).** The turn timeline and the game rules are separate. `engine.ts` has zero game rules; each of the five modes is a strategy behind a fixed hook interface. Four of the five modes were added after the engine froze, with no engine change.
2. **One Durable Object per room (§4).** Gives single-writer-per-room by construction, so roster + strokes live in memory with no Redis, no lock, no cross-instance race. It's the runtime that happens to be the room-affinity cluster I'd otherwise have hand-rolled.
3. **AI off the hot path (§3).** Vision runs in a separate Worker on an interval with a hard per-turn cap and a provider fallback chain, so a slow or failed guess never blocks the socket loop or the game.
4. **One abstraction, added on demand (§6).** The only engine change the whole project needed was a single transport-agnostic `ctx.draw` verb, introduced when AI-as-drawer actually required it, not speculated up front.
5. **Production concerns are real (§8).** Server-enforced abuse limits at three layers, identity-preserving reconnect with a grace window, a committed test suite, and CI that gates deploys.

The sections below are the long form, each ending with the trade-off I made.

---

## 1. Core engine vs. mode plugins

The central design bet is that **the game timeline and the game rules are
different things and should never be tangled together.**

- `engine.ts` (`GameEngine`) owns the _timeline_: phases
  (`lobby → choosing → playing → intermission → ended`), the per-turn timer, the
  scoreboard, the "who has guessed" set, and broadcasting public state. It
  contains **zero game rules**. It does not know what a "word" means, who is
  allowed to draw, or how points are earned.
- A `GameMode` (the strategy) supplies every rule decision through a fixed
  set of hooks: `configure`, `pickDrawer`, `pickWord`, `pickWordChoices`
  (optional), `onTurnStart`, `onChat`, `canDraw`, `onTurnEnd`, `onGameEnd`.

The two halves meet through two narrow interfaces:

- `EngineDeps` is what the transport layer injects _into_ the engine
  (`broadcast`, `sendToPlayer`, `clearCanvas`, `drawOp`, …). The engine never
  imports the transport or a store; it only knows these verbs. That's what makes
  it unit-testable and transport-agnostic, and it's exactly why the whole thing
  ported from a Node/`ws`/Redis process into a Cloudflare Durable Object without
  the engine or the modes changing at all (see §4).
- `EngineContext` is the set of verbs the engine hands _to_ a mode
  (`awardPoints`, `endTurn`, `addParticipant`, `draw`, `turnFractionRemaining`,
  …). A mode never sees a socket, a store, or even the full engine, just this
  surface.

```
transport (worker.ts → GameRoom Durable Object)
      │  injects EngineDeps
      ▼
  GameEngine ── timeline, scoring bookkeeping
      │  exposes EngineContext
      ▼
  GameMode (strategy)
   ├─ ClassicMode      (humans only)
   ├─ AIGuesserMode    (+ AI guesser)
   ├─ AIDrawerMode     (AI draws)
   ├─ TeamBattleMode   (Humans vs AI)
   └─ DuelMode         (You vs AI)
```

**Why this holds up:** four of the five modes were added _after_ the engine
froze, and none required an engine change. `ClassicMode` is a concrete base;
the four AI modes extend or compose it. The only engine evolution the whole
project needed was a single new verb. See §6.

**Where shared _behavior_ lives (and why not in the engine):** the AI's
interval guess loop and progressive draw-reveal loop are shared by multiple
modes, but they're **mode policy** (cadence, cost caps, reveal speed), not
timeline. So they live in composable helpers (`ai/aiGuessLoop.ts`,
`ai/aiDrawLoop.ts`) that modes _compose_, rather than in the engine or in a mode
base class. `TeamBattleMode` and `DuelMode` each need _both_ loops and can't
extend two mode classes, and that pressure is exactly what proved the helpers
belong outside the inheritance tree.

> **Decision:** strategy + dependency injection over `if (mode === …)` branches
> or a deep inheritance chain. Conditionals would have scattered each mode's
> rules across the engine; a tall inheritance chain breaks the moment one mode
> needs behavior from two ancestors (which `TeamBattleMode` does). Composition +
> a stable hook interface kept the engine at zero churn.

---

## 2. Real-time sync

The server is authoritative: clients never talk to each other, and every fact flows through
`broadcast`/`broadcastExcept`. A stroke travels as a sequence of `start → move → end` ops
(`shared/events.ts`), never a finished bitmap, so watchers see lines grow in real time,
messages stay tiny, and a late joiner is caught up by replaying the same log (`canvas_sync`).

Three consequences:

- Coordinates are normalized 0 to 1, so a drawing made on an 800×600 canvas renders correctly
  on any client size with no server-side rescaling.
- The drawer renders locally and is excluded from its own broadcast (`broadcastExcept`), which
  hides the round trip for the person drawing while keeping everyone else server-driven.
- `clear` truncates the log rather than appending, and every turn starts with a clear, so the
  per-turn log stays bounded.

> **Decision:** an authoritative server over client prediction or P2P. It is a trust boundary
> as much as a latency one: a cheating client cannot fabricate game state because it has no
> authority over it. The cost is a round trip for _remote_ strokes, which I hide only for the
> local drawer. Because there is exactly one drawer per turn (a draw-lock, not a CRDT),
> conflict resolution never comes up, a deliberate simplification versus collaborative drawing.

---

## 3. AI guessing: data flow, latency, cost

The vision model runs in a **separate `ai-worker` Worker**, never in the
WebSocket event loop.

```
game-server (GameRoom DO)           ai-worker (Worker)
  AIGuesserMode (timer)
     │ requestGuess()
     ▼
  aiWorkerClient ── HTTP POST /guess { ops } ──►  strokeSvg(ops) → PNG (resvg-wasm)
     ▲                                                   │
     │            { guess }                              ▼
     └────────────────────────────────────  VisionProvider (OpenAI|Anthropic|Workers AI|Mock)
```

A slow vision call (hundreds of ms to seconds) can't block message handling or other
rooms: it's an awaited HTTP call from inside a timer callback, not inline in the socket
loop. Beyond that:

- A failure is announced, not swallowed. `aiWorkerClient` throws on a real
  failure (no worker configured, worker down, timeout, non-200) and returns `""`
  only for "there was nothing to ask". The guess loop tells the room once a turn
  that the AI can't see the canvas, then keeps trying. The game never stalls on
  the AI, and a mute AI is never mistaken for a thoughtful one.
- Cost is bounded rather than best-effort. The first guess waits 8s at normal skill
  (an empty canvas isn't worth a call, and `requestAIGuess` short-circuits on an
  empty op list). Later looks are paced by how much new ink has appeared: sooner
  after a burst, much later at an untouched canvas, scaled by skill. Attempts per
  turn are capped by skill, and the room carries a whole-lifetime budget on paid
  calls so a "run it back" loop can't run up a bill.
- The secret word never leaves the trusted boundary. Only stroke ops are
  sent to the worker; the word is delivered solely to the drawer via
  `your_word`. Anti-cheat (and privacy) is enforced by the _absence_ of data,
  not by trusting a client.
- Providers are swappable and auto-detected: OpenAI / Anthropic / Workers AI
  / Mock behind one interface, tried in order, so a rate-limited paid key drops
  through to the free tier and then to the fake one. The mock means the whole
  system runs with zero API keys, and because it never throws, the room is told
  when the mock is the one answering.

> **Decision:** interval snapshot polling over per-frame or final-image
> guessing. Per-frame would be accurate but ruinously expensive and pointless
> (the canvas barely changes between frames). Guessing only the _final_ image
> would kill the "AI races you live" feel. Interval polling with a hard cap is
> the middle that's both affordable and fun. **Decision:** a separate worker over
> an inline call, so vision latency is isolated and the model tier can scale
> independently of the socket layer.

---

## 4. One owning process per room

The engine is a single writer. Each room has one authoritative timeline with one running timer,
so if two instances both ran a room's engine you would get two timers, two "turn ended" events
and double scoring. Stateless instances behind a pub/sub relay do not fix this: that solves
message _delivery_, not _authority_, and you still get two timers. The approach that survives is
to route by room rather than by connection, hash each room to one owning instance, keep in-room
broadcast a local fan-out, and make the owner's state rehydratable so a failover is a rehydrate
rather than a rebuild.

A Durable Object is that owner by construction. Each room is one `GameRoom` addressed by
`idFromName(room)`, and the platform guarantees at most one instance per id, globally,
single-threaded. `worker.ts` derives the id from the room in the URL and hands the socket over;
broadcast is then an in-memory loop over that object's own sockets, with no Redis and no
per-message network hop, because there is no other instance to synchronize with.

The one part that needed a decision rather than a default is the socket style. The turn
`setTimeout` lives inside the object, so its sockets are **pinned** (`server.accept()`) rather
than hibernating, because hibernation evicts pending timers. The cost is that a live game keeps
its object resident, so an idle-but-open room is not free the way a hibernating one would be. A
single hot room also cannot be split across instances, which is fine when a room is a handful of
people.

> **Decision:** Durable Objects over a hand-rolled room-affinity cluster. The earlier plan
> (consistent-hash by `roomId`, Redis checkpointing, rehydrate on failover) was the right shape.
> A Durable Object is that shape delivered as a primitive, minus the infrastructure I would
> otherwise be operating.

---

## 5. Smaller calls worth keeping

The sections above cover the structural decisions. These are the small ones a reader would
otherwise have to reverse-engineer, and each exists because the obvious alternative broke
something.

Undo echoes a stroke id instead of rebroadcasting the canvas. Undo was the largest message in
the room, fired by the button people press most, and both sides run the same `dropStroke` so
they cannot disagree about what was removed. The eraser is `destination-out` rather than white
paint, because white pixels are a region the fill bucket treats as its own area to flood, and
erasing back to transparent keeps one background.

The AI gets harder by being more patient, never by lying. A brutal AI looks sooner and more
often; an easy one looks later and sometimes goes with its second thought. Corrupting its
answers would have been easier, but a bot that is wrong on purpose stops being a demonstration
of the model. For the same reason its guesses come back as a ranked shortlist rather than a
confidence percentage: these APIs return no calibrated confidence, so a percentage would be
invented, and the runners-up are the funnier signal anyway.

Words are offered one per difficulty tier, and the harder ones pay more, which makes the pick a
bet rather than a formality.

---

## 6. The one place the engine had to evolve (and why that's a good story)

Until a mode let the AI draw, strokes only ever originated from a human socket, so
the engine never needed a "draw" verb: human draw ops were persisted and
broadcast entirely in the transport layer. **AI-as-drawer broke that
assumption:** the AI must emit strokes _through the engine_, and they must be
persisted, or a mid-turn joiner's `canvas_sync` would miss them.

The fix was a single transport-agnostic verb, `ctx.draw(op)` (backed by
`EngineDeps.drawOp`), that persists to the stroke log _and_ broadcasts,
symmetric with the existing `clearCanvas()`. The engine still has no idea who or
why; it just stopped assuming strokes can only come from a socket. Discovering a
missing abstraction from a concrete new requirement, rather than speculating it
up front, is the design discipline I'm most happy with here.

---

## 7. What a post-change audit turned up

Worth writing down, because none of it was caught by the unit tests that were passing at the time.

- **A feature leaked into the one mode that overrode the hook.** `?word` bets on the AI's next
  guess. `TeamBattleMode` writes its own `onChat` and never called the base, and the guess
  normalizer strips punctuation, so `?dog` was scored as a plain answer and won the round. The
  fix was to move the handling into a `takeCall()` the base class exposes, and say in the comment
  that any override must run it first. **Lesson: an inherited hook that a subclass replaces is a
  place features silently do not arrive.**
- **A capacity rule created a state with no exit.** Spectators are seated when a host starts a
  game, and the host is chosen from players. When every player left a full room, neither
  condition could ever fire again and the room was stuck forever. The rule now promotes watchers
  when nobody is playing. **Lesson: two rules that each depend on the other having run is a
  deadlock, not a policy.**
- **A UI control that did nothing in three of five modes.** The lobby's round-count picker fed
  `ClassicMode`, but the AI modes each hardcoded their own length. **Lesson: adding a setting
  means auditing every implementer, not the one you were looking at.**
- **A first-round bug that predated all of it.** The gallery cleared itself on `turnIndex === 0`,
  and the state broadcast immediately after a turn ends still carries the old index, so round
  one's drawing was wiped the instant it was captured. In a one-round game that is the entire
  gallery. It took an end-to-end test that actually played a game to the results screen to see
  it. **Lesson: unit tests over an engine will not catch a bug in what the client does with the
  engine's output.**

---

## 8. Known limitations & what I'd do next

Honest list:

- **The AI drawer is still curated, not generative:** 40 hand-coded vector
  doodles. What changed is that they no longer _look_ canned: a post-processing
  pass redraws each one with an unsteady hand, so the same word never produces
  the same picture. The seam for a real generator is unchanged
  (`AIDrawerMode`'s injected `requestDrawing`), and the wobble pass would apply
  to a generated drawing just as well.
- **A room's settings, word memory, and host live in memory** alongside the rest
  of the engine state, so they share the same eviction caveat below.
- **The fill tool rasterizes per client.** Replaying a filled drawing at a
  different canvas size gives a near-identical, not bit-identical, result. Fine
  for a doodle; it would not be fine if drawings were ever authoritative
  artifacts.

- **Reconnect now preserves identity** via a client-held `pid` on the connect
  URL: a dropped client (including a sole player) gets an ~8s grace window to
  rejoin as the same player (keeps score, draw order, drawer role) before it's
  removed from the game, the drawer's secret word is re-delivered on reconnect,
  and an overlap reconnect no longer ends the turn or duplicates the roster
  entry. _Remaining:_ the `pid` is client-asserted, and a signed session token would
  stop one client claiming another's id.
- **Error handling hardened:** the connect/close handlers are wrapped and the
  client guards malformed frames. There is no process-level net to add, because a
  Worker isolate has no `process`; Workers Logs (`[observability]`) captures the
  uncaught throws a Node process would have handed to `unhandledRejection`.
- **Abuse limits, server-enforced at three layers.** (1) A per-IP cap on new
  connections via Cloudflare's rate-limit binding, checked at the Worker edge
  _before_ a room's Durable Object is created, so one client can't spin up
  unbounded rooms/objects. (2) A per-room player cap (8) that turns away extra
  joiners with a terminal close code the client renders as a "room's full"
  notice, while always readmitting reconnects (they reclaim an existing slot).
  (3) A coarse per-connection token bucket (200 msg/s) that drops pathological
  message floods without throttling normal play. Paid AI vision is separately
  capped per room (a whole-lifetime budget) so a "run it back" loop can't run up
  a bill. The pure policy (`atCapacity`) is unit-tested; the per-IP layer
  degrades open when the binding is absent (local dev). Rooms now have a host,
  the longest-present player, and only the host can start a game, change
  settings, or remove someone. _Remaining:_ no auth, so the host is whoever
  connected first rather than a verified identity, and anyone with the room code
  can still join.
- **Horizontal scale is now the runtime, not a plan.** §4's design is
  implemented: one Durable Object per room gives single-writer-per-room by
  construction. What's _not_ done is persisting engine state to the DO's SQLite
  storage. Today a room's state is in-memory, so a rare object eviction ends
  that game rather than rehydrating it. That's the cheap, obvious next step now
  that the object owns the state.
- **Unit-tested core; integration coverage is the gap.** The engine, modes, and
  pure helpers have a committed suite (`pnpm --filter @iguess/game-server
test`) that drives the engine through whole games against in-memory
  `EngineDeps`: rounds, scoring, hints, forgiving-guess matching, and the
  word-choice phase. _Remaining:_ no end-to-end test exercising the real
  WebSocket transport through the Durable Object; those paths are validated by
  hand (a two-browser playthrough).
- **No auth, by design.** Anyone can join any room and `start_game`, which is the
  intended "type a name, share a link" flow for a party game. The abuse surface
  is bounded by the per-IP, per-room, and per-connection limits above rather than
  by accounts.

**Next three things, in order:** (1) persist engine state to the DO's SQLite so a
room survives eviction; (2) an end-to-end test across the real WebSocket +
Durable Object; (3) signed session tokens so a `pid` can't be spoofed.

# How it works, moved out of the README

_Moved out of the README, which is the front door and was carrying the whole house._

## Game modes

A mode implements the `GameMode` interface and gets an `EngineContext` of verbs
(`broadcast`, `awardPoints`, `endTurn`, `addParticipant`, and so on). The engine
calls the mode at set points (`configure`, `pickDrawer`, `pickWord`,
`pickWordChoices`, `onTurnStart`, `onChat`, `canDraw`, `onTurnEnd`, `onGameEnd`).
Adding a mode means writing a class, not editing the engine.

- `ClassicMode`: humans take turns drawing, everyone else guesses in chat.
  The other four build on this one.
- `AIGuesserMode`: adds an AI player that guesses off the live canvas on a
  timer.
- `AIDrawerMode`: the AI does all the drawing (its strokes go through the
  engine via `ctx.draw`) and humans guess.
- `TeamBattleMode`: humans vs AI. Rounds alternate who draws, and the first
  correct guess wins the round for that side.
- `DuelMode`: you vs the AI, head-to-head. You trade the drawer role each turn
  (you draw and the AI reads your canvas; then the AI draws and you guess), and
  both sides bank cumulative points, so unlike TeamBattle's round-win race, the
  AI earns points both as guesser and as drawer. Most points beats the machine.

The `pickWordChoices` hook drives the word-choice step: return 2+ words and the
drawer gets to choose one; return `null` to skip it (the AI drawer just picks its
own word).
