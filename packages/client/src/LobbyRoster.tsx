import type { PlayerInfo } from "@iguess/shared";
import { isAI } from "./roomView";

export function LobbyRoster({ players }: { players: PlayerInfo[] }) {
  if (!players.length) return null;
  return (
    <section className="lobby-roster" aria-labelledby="lobby-roster-title">
      <h2 id="lobby-roster-title">In the room</h2>
      <ul aria-labelledby="lobby-roster-title" tabIndex={0}>
        {players.map((player) => (
          <li key={player.id}>
            <span>
              {player.name}
              {player.isHost && <small>Host</small>}
            </span>
            <strong>
              {isAI(player.id)
                ? "AI"
                : player.connected === false
                  ? "Reconnecting"
                  : player.spectator
                    ? "Watching"
                    : player.ready
                      ? "Ready"
                      : "Here"}
            </strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
