import type { PlayerInfo, PublicGameState } from "@iguess/shared";
import { isAI } from "./roomView";
import { styles } from "./styles";

interface ScoreboardProps {
  /** Best first. */
  ranked: PlayerInfo[];
  game: PublicGameState | null;
  youId: string | null;
  youAreHost: boolean;
  onKick: (playerId: string) => void;
}

export function Scoreboard({ ranked, game, youId, youAreHost, onKick }: ScoreboardProps) {
  return (
    <ul style={styles.scoreList}>
      {ranked.map((p, i) => {
        const me = p.id === youId;
        const drawer = game?.drawerId === p.id;
        const guessed = game?.guessedIds.includes(p.id);
        return (
          <li
            key={p.id}
            style={{
              ...styles.scoreRow,
              ...(me ? styles.scoreRowMe : null),
              ...(drawer ? styles.scoreRowDrawer : null),
            }}
          >
            <span style={styles.rank}>{i + 1}</span>
            <span style={styles.playerName}>
              {isAI(p.id) ? (
                <span style={styles.aiBadge}>AI</span>
              ) : p.avatar ? (
                <span aria-hidden>{p.avatar}</span>
              ) : null}
              <span style={styles.nameText}>{p.name}</span>
              {me ? <span style={styles.youTag}>you</span> : null}
              {p.isHost ? <span title="host">👑</span> : null}
              {p.spectator ? <span title="watching">👀</span> : null}
              {drawer ? <span title="drawing">✏️</span> : null}
              {guessed ? <span title="guessed">✅</span> : null}
            </span>
            {youAreHost && !me && !isAI(p.id) && (
              <button
                style={styles.kickButton}
                title={`remove ${p.name}`}
                aria-label={`remove ${p.name}`}
                onClick={() => onKick(p.id)}
              >
                ✕
              </button>
            )}
            <strong style={styles.scoreNum}>{game?.scores[p.id] ?? 0}</strong>
          </li>
        );
      })}
      {ranked.length === 0 && <li style={styles.emptyRoster}>nobody here but us 🦗</li>}
    </ul>
  );
}
