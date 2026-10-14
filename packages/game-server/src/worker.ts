import { decodeRoomCode } from "@iguess/shared/roomCode";
import type { Env } from './env.ts';
import { aiWorkerProblem } from './aiHealth.ts';
import { playStatus } from "./playStatus.ts";
import { GameRoom } from './GameRoom.ts';
import { withSecurityHeaders } from './harden.ts';
import { rewriteInviteMeta } from './inviteMeta.ts';

// The room id maps 1:1 to a Durable Object instance (idFromName), so all of a room's players
// land on the same object — the single authority for that game.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/play-status') return withSecurityHeaders(Response.json(await playStatus(env.AI_WORKER_URL), { headers: { 'Cache-Control': 'public, max-age=30' } }));

    if (url.pathname === '/health') {
      return withSecurityHeaders(
        new Response(JSON.stringify({ status: 'ok', service: 'iguess' }), {
          headers: { 'content-type': 'application/json' },
        }),
      );
    }

    // WebSocket join: /rooms/:id/ws?name=&mode=&pid=
    const match = url.pathname.match(/^\/rooms\/([^/]+)\/ws$/);
    if (match) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected a WebSocket upgrade.', { status: 426 });
      }
      // Throttle new connections per client IP at the edge, BEFORE the room DO is created — so one
      // IP can't spin up unbounded rooms/objects. Degrades open if the binding is unconfigured.
      const ip = request.headers.get('CF-Connecting-IP');
      if (env.RATE_LIMITER && ip) {
        const { success } = await env.RATE_LIMITER.limit({ key: ip });
        if (!success) return new Response('Too many connections, slow down.', { status: 429 });
      }
      const roomId = decodeRoomCode(match[1]!).slice(0, 32);
      url.searchParams.set('room', roomId); // the DO echoes this back in `welcome`
      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(roomId));
      return stub.fetch(new Request(url.toString(), request));
    }

    // /r/:room is an invite. The room has to be in the PATH, not the hash, for any of this to
    // work: a hash never leaves the browser, so a scraper fetching an invite link would only
    // ever see the generic card.
    const invite = url.pathname.match(/^\/r\/([^/]+)\/?$/);
    if (invite) {
      const room = decodeRoomCode(invite[1]!).slice(0, 32);
      const mode = (url.searchParams.get('mode') ?? '').slice(0, 32);
      const shell = await env.ASSETS.fetch(new Request(new URL('/', url), request));
      if (!shell.ok) return withSecurityHeaders(shell);
      const html = await shell.text();
      return withSecurityHeaders(
        new Response(rewriteInviteMeta(html, room, mode, env.AI_WORKER_URL), {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
      );
    }

    // Everything else is the client SPA (real files + index.html fallback for client routes).
    const asset = withSecurityHeaders(await env.ASSETS.fetch(request));
    // Vite's hashed bundles cannot change under a given name, so a year and `immutable`. Workers
    // Assets serves them `max-age=0, must-revalidate`, which spends a round trip per chunk on
    // every repeat visit. index.html keeps its name and is left to revalidate.
    if (url.pathname.startsWith('/assets/')) {
      asset.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    }
    return asset;
  },

  // Cron: cross-check the ai-worker, since nothing else does until a player starts an AI mode.
  // Anything wrong lands in Workers Logs as an error, which a Cloudflare notification can email.
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const problem = await aiWorkerProblem(env.AI_WORKER_URL);
    if (problem) console.error(`ai-worker health: ${problem}`);
  },
};

export { GameRoom };
