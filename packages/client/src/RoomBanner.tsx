import type { useGameSocket } from "./useWebSocket";
import { roomView } from "./roomView";
import { styles } from "./styles";
import { lobbyStatus } from "./labels";
import { HostSettings } from "./HostSettings";
import { Countdown } from "./Countdown";
import { TIER_LABEL } from "./gameModes";

type Socket = ReturnType<typeof useGameSocket>;
type View = ReturnType<typeof roomView>;
type Props = Pick<
  View,
  | "phase"
  | "youAreWatching"
  | "soloWaiting"
  | "readyCount"
  | "humans"
  | "watching"
  | "youAreHost"
  | "youAreReady"
  | "isDrawer"
  | "inGame"
> &
  Pick<
    Socket,
    | "turnEnd"
    | "connected"
    | "settings"
    | "updateSettings"
    | "setReady"
    | "startGame"
    | "game"
    | "wordChoices"
    | "chooseWord"
    | "skipWord"
    | "players"
  > & {
    isAIMode: boolean;
    copyResults: () => Promise<void>;
    resultsCopied: boolean;
    resultSummary: () => string;
    wordLetters: string[];
  };

export function RoomBanner({
  phase,
  turnEnd,
  connected,
  youAreWatching,
  soloWaiting,
  isAIMode,
  readyCount,
  humans,
  watching,
  settings,
  youAreHost,
  updateSettings,
  youAreReady,
  setReady,
  startGame,
  copyResults,
  resultsCopied,
  resultSummary,
  game,
  isDrawer,
  wordChoices,
  chooseWord,
  skipWord,
  players,
  inGame,
  wordLetters,
}: Props) {
  const highScore = Math.max(0, ...Object.values(game?.scores ?? {}));
  const leaders = players.filter(
    (player) => !player.spectator && game?.scores[player.id] === highScore,
  );
  return (
    <div className="glass play-banner" data-phase={phase} style={styles.banner}>
      {phase === "lobby" && (
        <>
          <div className="lobby-welcome">
            <span className="eyebrow">The pre-game scribble</span>
            <h1>
              Everyone’s an artist.
              <br />
              <em>Pending review.</em>
            </h1>
          </div>
          <span
            className="lobby-status"
            role="status"
            style={styles.bannerText}
          >
            {lobbyStatus({
              youAreWatching,
              soloWaiting,
              isAIMode,
              readyCount,
              humanCount: humans.length,
              watchingCount: watching.length,
            })}
          </span>
          <HostSettings
            settings={settings}
            youAreHost={youAreHost && connected}
            isAIMode={isAIMode}
            onChange={updateSettings}
          />
          {!youAreWatching && (
            <button
              className="lift"
              style={{
                ...styles.ghostButton,
                ...(youAreReady ? styles.readyOn : null),
              }}
              disabled={!connected}
              aria-pressed={youAreReady}
              onClick={() => setReady(!youAreReady)}
            >
              {youAreReady ? "✓ Ready" : "I’m ready"}
            </button>
          )}
          <button
            className="lift pulse-cta"
            style={{
              ...styles.button,
              marginLeft: "auto",
              ...(youAreHost ? null : styles.disabled),
            }}
            onClick={startGame}
            disabled={!youAreHost || !connected || (soloWaiting && !isAIMode)}
            title={
              !connected
                ? "Reconnect to start"
                : !youAreHost
                  ? "Only the host can start"
                  : soloWaiting && !isAIMode
                    ? "Classic needs another player"
                    : undefined
            }
          >
            {youAreHost ? "Start game" : "Waiting for the host"}
          </button>
        </>
      )}
      {phase === "ended" && (
        <>
          <div className="results-title">
            <span className="eyebrow">Game over / the evidence remains</span>
            <h1>
              {highScore === 0
                ? "No points. Plenty of material."
                : leaders.length > 1
                  ? "A shared victory. Awkward."
                  : `${leaders[0]?.name ?? "Someone"} takes it.`}
            </h1>
            <p>
              {highScore > 0
                ? `${highScore} points at the top.`
                : "Consider that a rehearsal."}{" "}
              Another round?
            </p>
          </div>
          <button
            className="lift"
            style={{ ...styles.ghostButton, marginLeft: "auto" }}
            onClick={copyResults}
          >
            {resultsCopied ? "Copied ✓" : "Copy results"}
          </button>
          <button
            className="lift"
            style={styles.xButton}
            onClick={() => shareToX(resultSummary())}
          >
            Post to X
          </button>
          <button
            className="lift pulse-cta"
            style={styles.button}
            onClick={startGame}
            disabled={!youAreHost || !connected}
          >
            {youAreHost ? "Play again" : "Waiting for the host"}
          </button>
        </>
      )}
      {phase === "choosing" && (
        <>
          <span style={styles.turnPill}>
            {(game?.totalRounds ?? 1) > 1
              ? `Round ${game?.round ?? 1}/${game?.totalRounds ?? 1}`
              : "Choosing"}
          </span>
          {isDrawer && wordChoices ? (
            <span className="word-zone" style={styles.wordZone}>
              <span style={styles.wordVerb}>
                Pick a word. Believe in yourself, briefly.
              </span>
              <span className="word-tiles" style={styles.tiles}>
                {wordChoices.options.map((c) => (
                  <button
                    key={c.word}
                    className="lift word-choice"
                    style={styles.button}
                    disabled={!connected}
                    onClick={() => chooseWord(c.word)}
                    title={`${c.tier} — worth ${TIER_LABEL[c.tier]}`}
                  >
                    <small className="word-difficulty">{c.tier}</small>
                    <strong>{c.word}</strong>
                    <span style={styles.tierBadge}>
                      {TIER_LABEL[c.tier]} points
                    </span>
                  </button>
                ))}
                {wordChoices.canSkip && (
                  <button
                    className="lift"
                    style={styles.skipButton}
                    disabled={!connected}
                    onClick={skipWord}
                    title="swap all three for new ones (once per game)"
                  >
                    ↻ skip
                  </button>
                )}
              </span>
            </span>
          ) : (
            <span className="word-zone" style={styles.wordZone}>
              <span style={styles.wordVerb}>
                {game?.drawerId
                  ? playerName(players, game.drawerId)
                  : "someone"}{" "}
                is picking a word…
              </span>
            </span>
          )}
        </>
      )}
      {phase === "intermission" && (
        <div className="turn-recap" role="status">
          <span className="eyebrow">The word was</span>
          <strong>{turnEnd?.word ?? "Revealing…"}</strong>
          <p>
            {game?.guessedIds.length
              ? "Recognizable, apparently. Next turn coming up."
              : "An abstract interpretation. Next turn coming up."}
          </p>
        </div>
      )}
      {inGame && phase !== "intermission" && (
        <>
          <span style={styles.turnPill}>
            {(game?.totalRounds ?? 1) > 1
              ? `Round ${game?.round ?? 1}/${game?.totalRounds ?? 1} · Turn ${(game?.turnIndex ?? 0) + 1}/${game?.totalTurns ?? 0}`
              : `Turn ${(game?.turnIndex ?? 0) + 1}/${game?.totalTurns ?? 0}`}
          </span>
          <span className="word-zone" style={styles.wordZone}>
            <span style={styles.wordVerb}>
              {isDrawer ? "Draw this" : "Guess the word"}
            </span>
            <span
              className="word-tiles"
              style={styles.tiles}
              role="img"
              aria-label={
                isDrawer
                  ? `Word to draw: ${wordLetters.join("")}`
                  : `${wordLetters.length} letters. Hint: ${wordLetters.map((letter) => letter || "blank").join(" ")}`
              }
            >
              {wordLetters.map((ch, i) => (
                <span key={i} style={styles.tile}>
                  {ch}
                </span>
              ))}
            </span>
          </span>
          <Countdown
            endsAt={game?.turnEndsAt ?? null}
            durationMs={settings.turnSeconds * 1000}
          />
        </>
      )}
    </div>
  );
}
function playerName(players: { id: string; name: string }[], id: string) {
  return players.find((p) => p.id === id)?.name ?? "Someone";
}
function shareToX(text: string) {
  window.open(
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
    "_blank",
    "noopener,noreferrer",
  );
}
