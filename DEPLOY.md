# Deploying iguess → iguess.aidenjang.com

**Status: live** at [iguess.aidenjang.com](https://iguess.aidenjang.com). Run the steps below to ship a new version. Two Cloudflare Workers:

- **`iguess-ai`** — the vision worker (`/guess`). Internal: only the game server calls it,
  server-side. Stays on its `*.workers.dev` URL (no custom domain). Mock provider by default.
- **`iguess-game`** — the game server: the `GameRoom` Durable Object (one per room) + serves
  the client SPA (`[assets]`) + the `/rooms/:id/ws` WebSocket. Custom domain, free tier.

The room DO is SQLite-backed and created automatically by the `new_sqlite_classes` migration on
first deploy — no separate command (unlike D1).

## 1. Deploy the ai-worker

```bash
cd packages/ai-worker
pnpm exec wrangler deploy        # → note the URL, e.g. https://iguess-ai.aidenjang.workers.dev
```

Optional real vision (else mock): `echo "<key>" | pnpm exec wrangler secret put ANTHROPIC_API_KEY`
(or `OPENAI_API_KEY`). Mock needs no key and proves the pipeline end-to-end.

## 2. Point the game server at it

The URL goes on the deploy command, not in `wrangler.toml`. A `[vars]` entry there also
reaches `wrangler dev`, which would point local play and the e2e suite at the paid worker. If
step 1 gave you a different URL, edit the `deploy` script in
`packages/game-server/package.json`:

```bash
wrangler deploy --var AI_WORKER_URL:https://iguess-ai.aidenjang.workers.dev
```

(Drop the flag to ship without AI — classic mode is unaffected; AI modes tell the room the AI
is unavailable.)

## 3. Deploy the game server

Since the custom domain is already attached, a redeploy is one command:

```bash
cd packages/game-server
pnpm run deploy                  # builds the client, then wrangler deploy
```

First-time-only (before the domain exists) it's a two-step: comment out the `[[routes]]` block,
`pnpm run deploy`, then uncomment it and `pnpm run deploy` again to attach the domain.
`workers_dev = false` keeps it custom-domain-only. The account already has a workers.dev subdomain.

## Smoke test + two-player playthrough

```bash
curl https://iguess.aidenjang.com/health   # {"status":"ok","service":"iguess"}
```

Then open `https://iguess.aidenjang.com` in **two browser windows** (or two devices):

1. Window A: enter a name, create/join a room (note the room in the URL hash), pick a mode.
2. Window B: open the same invite link → both should appear in the roster (presence).
3. Start the game. The drawer picks a word and draws; strokes stream live to the other window.
4. The guesser types the word → it's consumed as a correct guess (scored, not shown as chat).
5. Watch the turn timer, hint reveals, round rotation, and the scoreboard.
6. (AI mode, if a key is set) the AI joins the roster and guesses/draws.
7. Reconnect check: refresh one window mid-game → it rejoins as the same player with state intact.

## Local dev (no Cloudflare needed)

```bash
# ai-worker (:33400) + game server (:33300, serves client dist + WS) + client dev (:33100)
cd packages/ai-worker   && pnpm exec wrangler dev --port 33400 --inspector-port 9233 --local
cd packages/game-server && pnpm exec wrangler dev --port 33300 --inspector-port 9232 --local --var AI_WORKER_URL:http://localhost:33400
cd packages/client      && pnpm dev   # http://localhost:33100, proxies /rooms → :33300
```
