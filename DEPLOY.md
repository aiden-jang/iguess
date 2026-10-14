# Deploying iguess → iguess.aidenjang.com

**Status: live** at [iguess.aidenjang.com](https://iguess.aidenjang.com). Run the steps below to ship a new version. Two Cloudflare Workers:

- **`iguess-ai`** is the vision worker (`/guess`). Its `*.workers.dev` URL is public, so real
  vision providers require a shared Bearer secret; it also serves public share-card images at
  `/og`. It prefers configured OpenAI or Anthropic keys, then Cloudflare Workers AI, and uses mock
  only as a last resort.
- **`iguess-game`** is the game server: the `GameRoom` Durable Object (one per room) + serves
  the client SPA (`[assets]`) + the `/rooms/:id/ws` WebSocket. Custom domain, free tier.

The room DO is SQLite-backed and created automatically by the `new_sqlite_classes` migration on
first deploy, with no separate command (unlike D1).

`wrangler deploy` also registers the game-server's cron (`[triggers]` in its `wrangler.toml`),
which half-hourly checks that the ai-worker is up, not on the mock provider, and ready to accept
authenticated vision requests. Failures go to Workers Logs as errors.

## 1. Deploy the ai-worker

```bash
cd packages/ai-worker
pnpm exec wrangler deploy        # → note the URL, e.g. https://iguess-ai.aidenjang.workers.dev
```

Set provider keys as Cloudflare Worker secrets. Do not put keys in source or command history.
Without paid provider keys, the configured Workers AI binding is used; mock is the final fallback.

### Protect the vision endpoint

The live endpoint currently accepts an anonymous empty-canvas probe. The app does not call a model
for that probe, but the public `/guess` route must be protected before real vision requests are
safe. The updated worker fails closed whenever a real provider is configured without
`AI_SHARED_SECRET`; mock-only local development remains available.

Before pushing a deployment with this guard, set the **same** secret on both Workers. Set the game
server first: it will start sending the token, which the current AI worker ignores until its secret
is set. Then set the AI worker secret, which immediately starts enforcing it. This avoids an AI
interruption during rollout. Use a long random value, enter it only at the Wrangler prompt, and
never commit it. GitHub auto-deploys code but does not set Worker secrets.

```bash
cd packages/game-server && pnpm exec wrangler secret put AI_SHARED_SECRET
cd packages/ai-worker   && pnpm exec wrangler secret put AI_SHARED_SECRET
```

## 2. Point the game server at it

The URL goes on the deploy command, not in `wrangler.toml`. A `[vars]` entry there also
reaches `wrangler dev`, which would point local play and the e2e suite at the paid worker. If
step 1 gave you a different URL, edit the `deploy` script in
`packages/game-server/package.json`:

```bash
wrangler deploy --var AI_WORKER_URL:https://iguess-ai.aidenjang.workers.dev
```

(Drop the flag to ship without AI: classic mode is unaffected; AI modes tell the room the AI
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
