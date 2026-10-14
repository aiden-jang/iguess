# Deploying iguess → iguess.aidenjang.com

**Status: live** at [iguess.aidenjang.com](https://iguess.aidenjang.com). Run the steps below to ship a new version. Two Cloudflare Workers:

- **`iguess-ai`** is the vision worker (`/guess`). Its `*.workers.dev` URL is public, so real
  vision providers require a shared Bearer secret; it also serves public share-card images at
  `/og`. It prefers configured OpenAI or Anthropic keys, then Cloudflare Workers AI, and uses mock
  only as a last resort.
- **`iguess-game`** is the game server: the `GameRoom` Durable Object (one per room) + serves
  the client SPA (`[assets]`) + the `/rooms/:id/ws` WebSocket. Custom domain and bound assets.

The room DO is SQLite-backed and created automatically by the `new_sqlite_classes` migration on
first deploy. Versioned recovery checkpoints use that existing storage; no new migration
or secret is needed. Inactive checkpoints expire after a day. A recovered game resumes its
clock from the last completed checkpoint. Old clients with only claimed player IDs rejoin
with fresh identities after upgrading; their IDs cannot prove ownership.

`wrangler deploy` also registers the game-server's cron (`[triggers]` in its `wrangler.toml`),
which half-hourly checks that the AI worker is up, uses a real provider, and has its shared
secret configured. It does not confirm that both Workers have matching secrets; verify that
with a game round after deployment. Failures go to Workers Logs as errors.

Run the following commands from the repository root.

## 1. Configure secrets before deploying

Set provider keys as Cloudflare Worker secrets. Do not put keys in source or command history.
Without paid provider keys, the configured Workers AI binding is used; mock is the final fallback.

### Protect the vision endpoint

The worker rejects real vision requests until `AI_SHARED_SECRET` is configured. Mock-only
local development remains available. Set the **same** long random secret on both Workers,
entering it only at the Wrangler prompt. Never commit it. GitHub deploys code but does not
create Worker secrets.

For an existing deployment, set the game server first, then the AI worker. If the AI worker
already enforces a secret, use its existing value when configuring the game server.

```bash
pnpm --filter @iguess/game-server exec wrangler secret put AI_SHARED_SECRET
pnpm --filter @iguess/ai-worker exec wrangler secret put AI_SHARED_SECRET
```

For a first deployment, create both Workers in mock mode before adding provider keys and
secrets. After secrets are configured, deploy the AI worker:

```bash
pnpm --filter @iguess/ai-worker run deploy
```

## 2. Point the game server at it

The URL goes on the deploy command, not in `wrangler.toml`. A `[vars]` entry there also
reaches `wrangler dev`, which would point local play and the e2e suite at the paid worker. If
your AI worker has a different URL, edit the `deploy` script in
`packages/game-server/package.json`:

```bash
pnpm --filter @iguess/game-server exec wrangler deploy --var AI_WORKER_URL:https://iguess-ai.aidenjang.workers.dev
```

(Drop the flag to ship without AI: classic mode is unaffected; AI modes tell the room the AI
is unavailable.)

## 3. Deploy the game server

Since the custom domain is already attached, a redeploy is one command:

```bash
pnpm --filter @iguess/game-server run deploy
```

First-time-only (before the domain exists) it's a two-step: comment out the `[[routes]]` block,
`pnpm --filter @iguess/game-server run deploy`, then uncomment it and repeat that command
to attach the domain.
`workers_dev = false` keeps it custom-domain-only. The account already has a workers.dev subdomain.

## Smoke test + two-player playthrough

```bash
curl https://iguess.aidenjang.com/health   # {"status":"ok","service":"iguess"}
```

Then open `https://iguess.aidenjang.com` in **two browser windows** (or two devices):

1. Window A: enter a name, create/join a room (copy the room’s invite link), pick a mode.
2. Window B: open the same invite link → both should appear in the roster (presence).
3. Start the game. The drawer picks a word and draws; strokes stream live to the other window.
4. The guesser types the word → it's consumed as a correct guess (scored, not shown as chat).
5. Watch the turn timer, hint reveals, round rotation, and the scoreboard.
6. In an AI guessing mode, confirm the configured provider responds to a drawing. AI drawing
   uses curated vector doodles and does not verify the vision connection.
7. Reconnect check: refresh one window mid-game → it rejoins as the same player with state intact.

## Local dev (no Cloudflare account needed)

Build the client once for the game server’s asset binding:

```bash
pnpm --filter @iguess/client build
```

Run each command in a separate terminal, all from the repository root. Pinning the AI worker
to mock mode keeps local play away from real vision providers and needs no shared secret.

```bash
pnpm run dev:ai
pnpm run dev:server
pnpm run dev:client
```

Open the client URL printed by Vite. Mock guesses test delivery, not recognition quality.
