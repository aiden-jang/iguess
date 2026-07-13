import type { Env } from './env.ts';
import { GameRoom } from './GameRoom.ts';
import { withSecurityHeaders } from './harden.ts';

// The room id maps 1:1 to a Durable Object instance (idFromName), so all of a room's players
// land on the same object — the single authority for that game.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

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
      const roomId = decodeURIComponent(match[1]).slice(0, 32);
      url.searchParams.set('room', roomId); // the DO echoes this back in `welcome`
      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(roomId));
      return stub.fetch(new Request(url.toString(), request));
    }

    // Everything else is the client SPA (real files + index.html fallback for client routes).
    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },
};

export { GameRoom };
