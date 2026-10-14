import {
  sanitizeSettings,
  type ClientMessage,
  type RoomSettings,
  type ServerMessage,
} from "@iguess/shared";
import type { GameEngine } from "./engine.ts";
import type { Connection, RoomRoster } from "./roomRoster.ts";
import type { RoomCanvas } from "./roomCanvas.ts";
export interface RoomActions {
  game: GameEngine;
  roster: RoomRoster;
  canvas: RoomCanvas;
  settings: RoomSettings;
  broadcast(message: ServerMessage, except?: Connection): void;
  send(connection: Connection, message: ServerMessage): void;
  updateSettings(settings: RoomSettings): void;
  revoke(id: string): void;
  started(): void;
  presence(): void;
}
export function handleRoomAction(
  room: RoomActions,
  connection: Connection,
  message: ClientMessage,
) {
  const { game, roster, canvas } = room;
  const id = connection.player.id;
  const spectator = roster.spectator(id);
  switch (message.type) {
    case "chat": {
      const text = message.text.trim();
      if (text && (spectator || !game.handleChat(id, text)))
        room.broadcast({ type: "chat", from: connection.player, text });
      break;
    }
    case "draw": {
      if (spectator || !game.canDraw(id)) return;
      if (message.op.kind === "undo") {
        const strokeId = canvas.undo();
        if (strokeId)
          room.broadcast({ type: "draw", op: { kind: "undo", strokeId } });
      } else if (canvas.apply(message.op))
        room.broadcast({ type: "draw", op: message.op }, connection);
      else {
        room.send(connection, { type: "canvas_sync", ops: canvas.snapshot() });
        room.send(connection, {
          type: "system",
          text: "The canvas is full. Undo a stroke or clear it to keep drawing.",
        });
      }
      break;
    }
    case "start_game":
      if (!roster.isHost(id) || !["lobby", "ended"].includes(game.currentPhase))
        return;
      roster.seatWatchers();
      if (game.startGame(roster.humanIds())) {
        roster.clearReady();
        room.started();
      }
      break;
    case "choose_word":
      if (!spectator) game.handleChooseWord(id, message.word);
      break;
    case "skip_word":
      if (!spectator) game.handleSkipWord(id);
      break;
    case "react":
      room.broadcast({
        type: "react",
        emoji: message.emoji,
        at: Math.random(),
      });
      break;
    case "cursor":
      if (!spectator && game.canDraw(id))
        room.broadcast(
          { type: "cursor", playerId: id, point: message.point },
          connection,
        );
      break;
    case "ready":
      if (!["lobby", "ended"].includes(game.currentPhase)) return;
      roster.ready(id, message.ready);
      room.presence();
      break;
    case "kick": {
      if (!roster.isHost(id) || message.playerId === id) return;
      const target = roster.connections.get(message.playerId);
      if (target) {
        room.revoke(message.playerId);
        roster.detach(target, true, true);
        target.ws.close(4010, "Removed by host.");
      }
      break;
    }
    case "set_settings":
      if (roster.isHost(id) && ["lobby", "ended"].includes(game.currentPhase))
        room.updateSettings(
          sanitizeSettings({ ...room.settings, ...message.settings }),
        );
      break;
  }
}
