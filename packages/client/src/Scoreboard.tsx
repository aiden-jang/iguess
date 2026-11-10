import type { PlayerInfo, PublicGameState } from "@iguess/shared";
import { isAI } from "./roomView";
import { AvatarFace } from "./AvatarFace";
import { ConfirmButton } from "./ConfirmButton";
import { styles } from "./styles";

interface ScoreboardProps {
  ranked: PlayerInfo[];
  game: PublicGameState | null;
  youId: string | null;
  youAreHost: boolean;
  showScores?: boolean;
  onKick: (playerId: string) => void;
}

export function Scoreboard({
  ranked,
  game,
  youId,
  youAreHost,
  onKick,
  showScores = true,
}: ScoreboardProps) {
  return (
    <ul
      className="score-list"
      aria-label={showScores ? "Player standings" : "Players in the room"}
      style={styles.scoreList}
    >
      {ranked.map((player, index) => {
        const me = player.id === youId;
        const duplicate = ranked.some(
          (other) => other.id !== player.id && other.name === player.name,
        );
        const identity = duplicate
          ? `${player.name} (player ${index + 1})`
          : player.name;
        const drawer = game?.drawerId === player.id;
        const guessed = game?.guessedIds.includes(player.id);
        const roles = [
          me && "You",
          player.isHost && "Host",
          player.connected === false && "Reconnecting",
          player.spectator && "Watching",
          drawer && "Drawing",
          guessed && "Guessed",
          player.ready && "Ready",
        ].filter(Boolean);
        return (
          <li
            key={player.id}
            className="score-row"
            data-guessed={guessed}
            style={{
              ...styles.scoreRow,
              ...(me ? styles.scoreRowMe : null),
              ...(drawer ? styles.scoreRowDrawer : null),
            }}
          >
            {showScores && <span style={styles.rank}>{index + 1}</span>}
            <span
              className="player-avatar"
              data-avatar={player.avatar}
              aria-hidden
            >
              {isAI(player.id) ? (
                "✳"
              ) : (
                <AvatarFace value={player.avatar ?? "🐶"} />
              )}
            </span>
            <div className="player-identity">
              <span title={player.name} className="player-name">
                {identity}
              </span>
              <span className="player-role">
                {isAI(player.id)
                  ? "AI · questionable confidence"
                  : roles.join(" · ") || "Here for the art"}
              </span>
            </div>
            {showScores && (
              <strong
                aria-label={`${game?.scores[player.id] ?? 0} points`}
                style={styles.scoreNum}
              >
                {game?.scores[player.id] ?? 0}
              </strong>
            )}
            {youAreHost &&
              !me &&
              !isAI(player.id) &&
              player.connected !== false && (
                <ConfirmButton
                  style={styles.kickButton}
                  label={`remove ${identity}`}
                  title={`Remove ${identity}?`}
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
