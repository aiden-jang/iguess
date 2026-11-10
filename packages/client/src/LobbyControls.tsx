import type { RoomBannerProps } from "./roomBanner.types";
import { VisionNotice } from "./VisionNotice";
import { gameLengthLabel, lobbyStatus } from "./labels";
import { HostSettings } from "./HostSettings";
import { styles } from "./styles";
import { StudioSketch } from "./StudioSketch";

export function LobbyControls(p: RoomBannerProps) {
  const needsFriend = p.soloWaiting && !p.isAIMode;
  const teamBattle = p.effectiveMode === "team-battle";
  const curated = p.effectiveMode === "ai-drawer";
  return (
    <>
      <div className="lobby-welcome">
        <StudioSketch kind="lobby" />
        <h1 tabIndex={-1}>
          Warm up. <em>Or don’t.</em>
        </h1>
        <p className="lobby-status" role="status">
          {curated && p.soloWaiting && !p.youAreWatching
            ? "The AI draws. You guess."
            : lobbyStatus({
                youAreWatching: p.youAreWatching,
                soloWaiting: p.soloWaiting,
                isAIMode: p.isAIMode,
                readyCount: p.readyCount,
                humanCount: p.humans.length,
                watchingCount: p.watching.length,
              })}
        </p>
        <p className="lobby-rules">
          {p.settings.turnSeconds}s turns ·{" "}
          {gameLengthLabel(p.settings, teamBattle)} ·{" "}
          {curated
            ? "Curated doodles"
            : p.settings.packs.length
              ? `${p.settings.packs.length} word packs`
              : "All word packs"}
        </p>
        <p className="lobby-guidance">
          {p.youAreHost
            ? "You’re hosting. Ready tells the room who’s here. Start when you’re ready."
            : "Ready tells the host you’re here. The host starts the game."}
        </p>
      </div>
      <VisionNotice mode={p.effectiveMode} />
      <div className="lobby-actions">
        <HostSettings
          settings={p.settings}
          youAreHost={p.youAreHost}
          connected={p.connected}
          mode={p.effectiveMode}
          onChange={p.updateSettings}
        />
        {!p.youAreWatching && (
          <button
            type="button"
            style={{
              ...styles.ghostButton,
              ...(p.youAreReady ? styles.readyOn : null),
            }}
            disabled={!p.connected}
            aria-pressed={p.youAreReady}
            onClick={() => p.setReady(!p.youAreReady)}
          >
            {p.youAreReady ? "✓ Ready" : "I’m ready"}
          </button>
        )}
        <button
          type="button"
          className="lobby-start"
          style={styles.button}
          onClick={p.startGame}
          disabled={!p.youAreHost || !p.connected || needsFriend}
          title={
            !p.connected
              ? "Reconnect to start"
              : !p.youAreHost
                ? "Only the host can start"
                : needsFriend
                  ? "Classic needs another player"
                  : undefined
          }
        >
          {p.youAreHost ? "Start game" : "Waiting for the host"}
          <span aria-hidden>↗</span>
        </button>
      </div>
    </>
  );
}
