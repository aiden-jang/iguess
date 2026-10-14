import type { RoomBannerProps } from "./roomBanner.types";
import { LobbyControls } from "./LobbyControls";
import { styles } from "./styles";
import { Countdown } from "./Countdown";
import { TIER_LABEL } from "./gameModes";

export function RoomBanner(props: RoomBannerProps) {
  const {
    phase,
    turnEnd,
    connected,
    settings,
    youAreHost,
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
  } = props;
  const highScore = Math.max(0, ...Object.values(game?.scores ?? {}));
  const leaders = players.filter(
    (player) => !player.spectator && game?.scores[player.id] === highScore,
  );
  return (
    <div className="glass play-banner" data-phase={phase}>
      {phase === "lobby" && <LobbyControls {...props} />}
      {phase === "ended" && (
        <>
          <div className="results-title">
            <span className="eyebrow">Final verdict / very official</span>
            <h1>
              {highScore === 0
                ? "No points. Incredible commitment."
                : leaders.length > 1
                  ? "Joint custody of first place."
                  : `${leaders[0]?.name ?? "Someone"} takes it.`}
            </h1>
            <p>
              {highScore > 0
                ? `${highScore} points at the top.`
                : "Let’s call that experimental."}{" "}
              Another round?
            </p>
          </div>
          <div className="result-actions">
            <button
              className="lift pulse-cta"
              style={styles.button}
              onClick={startGame}
              disabled={!youAreHost || !connected}
            >
              {youAreHost ? "Play again" : "Waiting for the host"}
            </button>
            <button className="result-text-action" onClick={copyResults}>
              {resultsCopied ? "Copied ✓" : "Copy results"}
            </button>
            <button
              className="result-text-action"
              onClick={() => shareToX(resultSummary())}
            >
              Post to X ↗
            </button>
          </div>
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
