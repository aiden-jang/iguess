import type { RoomBannerProps } from "./roomBanner.types";
import { LobbyControls } from "./LobbyControls";
import { styles } from "./styles";
import { Countdown } from "./Countdown";
import { TIER_LABEL } from "./gameModes";
import { StudioSketch } from "./StudioSketch";
import { isAI } from "./roomView";
import { teamOutcome, teamScoreLine } from "./teamBattle";

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
    resultsFallback,
    resultSummary,
    game,
    isDrawer,
    wordChoices,
    chooseWord,
    skipWord,
    players,
    wordLetters,
    effectiveMode,
  } = props;
  const drawer = game?.drawerId
    ? playerName(players, game.drawerId)
    : "Someone";
  const round =
    (game?.totalRounds ?? 1) > 1
      ? `Round ${game?.round ?? 1} of ${game?.totalRounds}`
      : null;
  const highScore = Math.max(0, ...Object.values(game?.scores ?? {}));
  const teamScore = game?.teamScore;
  const leaders = (game?.resultPlayers ?? players).filter(
    (player) => !player.spectator && game?.scores[player.id] === highScore,
  );
  const minHumans = effectiveMode === "classic" ? 2 : 1;
  const canRematch =
    players.filter((player) => !isAI(player.id) && player.connected !== false)
      .length >= minHumans;
  const letterCount = wordLetters.filter((letter) => letter !== " ").length;
  const choosingTimer = (
    <Countdown
      endsAt={game?.turnEndsAt ?? null}
      serverNow={game?.serverNow}
      durationMs={15_000}
    />
  );
  return (
    <div key={phase} className="play-banner" data-phase={phase}>
      {phase === "lobby" && <LobbyControls {...props} />}
      {phase === "ended" && (
        <>
          <div className="results-title">
            <h1 tabIndex={-1}>
              {teamScore
                ? teamOutcome(teamScore)
                : highScore === 0
                  ? "No points. Incredible commitment."
                  : leaders.length > 1
                    ? "Joint custody of first place."
                    : `${leaders[0]?.name ?? "Someone"} takes it.`}
            </h1>
            {teamScore ? (
              <p className="team-score" role="status" aria-label="Team score">
                {teamScoreLine(teamScore)}
              </p>
            ) : (
              <p>
                {highScore > 0
                  ? `${highScore} ${highScore === 1 ? "point" : "points"} at the top.`
                  : "Let’s call that experimental."}
              </p>
            )}
          </div>
          <div className="result-actions">
            <button
              className="lift pulse-cta"
              style={styles.button}
              onClick={startGame}
              disabled={!youAreHost || !connected || !canRematch}
            >
              {youAreHost ? "Play again" : "Waiting for the host"}
            </button>
            {youAreHost && !canRematch && (
              <small>Invite another player to play again.</small>
            )}
            {resultsFallback && (
              <label className="results-fallback">
                Copy the result summary
                <textarea
                  readOnly
                  value={resultsFallback}
                  onFocus={(event) => event.target.select()}
                />
              </label>
            )}
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
          {isDrawer && wordChoices ? (
            <div className="word-zone">
              <div className="choice-heading">
                <h1 tabIndex={-1}>Pick a word.</h1>
                {round && <span className="turn-meta">{round}</span>}
                {choosingTimer}
              </div>
              <span className="word-tiles">
                {wordChoices.options.map((c) => (
                  <button
                    key={c.word}
                    className="lift word-choice"
                    style={styles.button}
                    disabled={!connected}
                    onClick={() => chooseWord(c.word)}
                    title={`${c.tier} difficulty`}
                  >
                    <small className="word-difficulty">{c.tier}</small>
                    <strong>{c.word}</strong>
                    {effectiveMode !== "team-battle" && (
                      <span style={styles.tierBadge}>
                        {TIER_LABEL[c.tier]} points
                      </span>
                    )}
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
            </div>
          ) : (
            <div className="word-zone">
              <StudioSketch kind="waiting" />
              <div>
                <h1 tabIndex={-1}>
                  {isDrawer
                    ? "Loading your words…"
                    : `${drawer} is picking a word…`}
                </h1>
                {round && <p className="turn-meta">{round}</p>}
              </div>
              {choosingTimer}
            </div>
          )}
        </>
      )}
      {phase === "intermission" && (
        <div className="turn-recap" role="status">
          <h1 tabIndex={-1}>
            {turnEnd ? (
              <>
                The word was <strong>{turnEnd.word}</strong>
              </>
            ) : (
              "Revealing the word…"
            )}
          </h1>
          <p>
            {game?.guessedIds.length
              ? "Recognizable, apparently. Next turn coming up."
              : "An abstract interpretation. Next turn coming up."}
          </p>
        </div>
      )}
      {phase === "playing" && (
        <>
          <div className="turn-heading">
            <h1 tabIndex={-1}>
              {isDrawer ? (
                <>
                  Your word is <strong>{wordLetters.join("") || "…"}</strong>
                </>
              ) : (
                `${isAI(game?.drawerId) ? "The AI" : drawer} is drawing`
              )}
            </h1>
            <p className="turn-meta">
              {round ? `${round} · ` : ""}
              Turn {(game?.turnIndex ?? 0) + 1} of {game?.totalTurns ?? 0}
              {!isDrawer &&
                wordLetters.length > 0 &&
                ` · ${letterCount} ${letterCount === 1 ? "letter" : "letters"}`}
            </p>
          </div>
          <Countdown
            endsAt={game?.turnEndsAt ?? null}
            durationMs={settings.turnSeconds * 1000}
            serverNow={game?.serverNow}
          />
          {!isDrawer && wordLetters.length > 0 && (
            <div
              className="word-tiles"
              role="img"
              aria-label={`Hint: ${wordLetters.map((letter) => (letter === " " ? "word break" : letter || "blank")).join(" ")}`}
            >
              {wordLetters.map((letter, index) => (
                <span
                  key={index}
                  className={letter === " " ? "word-gap" : undefined}
                  style={letter === " " ? undefined : styles.tile}
                >
                  {letter}
                </span>
              ))}
            </div>
          )}
        </>
      )}
      {phase !== "ended" && teamScore && (
        <p className="team-score" role="status" aria-label="Team score">
          {teamScoreLine(teamScore)}
        </p>
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
