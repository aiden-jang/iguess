import type { RoomBannerProps } from "./roomBanner.types";
import { VisionNotice } from "./VisionNotice";
import { lobbyStatus } from "./labels";
import { HostSettings } from "./HostSettings";
import { styles } from "./styles";
import { StudioSketch } from "./StudioSketch";

export function LobbyControls(p: RoomBannerProps) {
  const needsFriend = p.soloWaiting && !p.isAIMode;
  return (
    <>
      <div className="lobby-welcome">
        <StudioSketch kind="lobby" />
        <span className="eyebrow">The warm-up</span>
        <h1>
          Warm up. <em>Or don’t.</em>
        </h1>
        <p className="lobby-status" role="status">
          {lobbyStatus({
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
          {p.settings.scoreTarget
            ? `First to ${p.settings.scoreTarget}`
            : `${p.settings.rounds} ${p.settings.rounds === 1 ? "round" : "rounds"}`}{" "}
          ·{" "}
          {p.settings.packs.length
            ? `${p.settings.packs.length} word packs`
            : "All word packs"}
        </p>
        <p className="lobby-guidance">
          {p.youAreHost
            ? "You’re hosting. Ready is a signal; you decide when to start."
            : "Ready tells the host you’re here. The host starts the game."}
        </p>
        {p.isAIMode && (
          <VisionNotice
            mode={
              p.players.some((player) => player.id === "ai-drawer")
                ? "ai-drawer"
                : "ai"
            }
          />
        )}
      </div>
      <div className="lobby-actions">
        <HostSettings
          settings={p.settings}
          youAreHost={p.youAreHost && p.connected}
          isAIMode={p.isAIMode}
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
