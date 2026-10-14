import type { PlayerInfo, PublicGameState } from "@iguess/shared";
import { isAI } from "./roomView";
import { ConfirmButton } from "./ConfirmButton";
import { styles } from "./styles";

interface ScoreboardProps {
  ranked: PlayerInfo[];
  game: PublicGameState | null;
  youId: string | null;
  youAreHost: boolean;
  onKick: (playerId: string) => void;
}

export function Scoreboard({
  ranked,
  game,
  youId,
  youAreHost,
  onKick,
}: ScoreboardProps) {
  return (
    <ul
      className="score-list"
      aria-label="Player standings"
      style={styles.scoreList}
    >
      {ranked.map((player, index) => {
        const me = player.id === youId;
        const drawer = game?.drawerId === player.id;
        const guessed = game?.guessedIds.includes(player.id);
        const roles = [
          me && "You",
          player.isHost && "Host",
          player.spectator && "Watching",
          drawer && "Drawing",
          guessed && "Guessed",
          player.ready && "Ready",
        ].filter(Boolean);
        return (
          <li
            key={player.id}
            className="score-row"
            style={{
              ...styles.scoreRow,
              ...(me ? styles.scoreRowMe : null),
              ...(drawer ? styles.scoreRowDrawer : null),
            }}
          >
            <span style={styles.rank}>{index + 1}</span>
            <span className="player-avatar" aria-hidden>
              {isAI(player.id) ? "✳" : (player.avatar ?? "☺")}
            </span>
            <div className="player-identity">
              <span title={player.name} className="player-name">
                {player.name}
              </span>
              <span className="player-role">
                {isAI(player.id)
                  ? "AI · questionable confidence"
                  : roles.join(" · ") || "Here for the art"}
              </span>
            </div>
            <strong
              aria-label={`${game?.scores[player.id] ?? 0} points`}
              style={styles.scoreNum}
            >
              {game?.scores[player.id] ?? 0}
            </strong>
            {youAreHost && !me && !isAI(player.id) && (
              <ConfirmButton
                style={styles.kickButton}
                label={`remove ${player.name}`}
                title={`Remove ${player.name}?`}
                description="They’ll be disconnected from this room. Other players can keep playing."
                confirmLabel="Remove player"
                onConfirm={() => onKick(player.id)}
              >
                ✕
              </ConfirmButton>
            )}
          </li>
        );
      })}
      {ranked.length === 0 && (
        <li style={styles.emptyRoster}>Players will appear here.</li>
      )}
    </ul>
  );
}
