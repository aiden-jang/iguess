import { RoomError } from "./RoomError";
import { useRoomSharing } from "./useRoomSharing";
import { useRoundGallery } from "./useRoundGallery";
import { useGameFeedback } from "./useGameFeedback";
import { RoomBanner } from "./RoomBanner";
import { useEffect, useRef, useState } from "react";
import { useGameSocket } from "./useWebSocket";
import { isAI, roomView } from "./roomView";
import { useWakeLock } from "./useWakeLock";
import { useAppBadge } from "./useAppBadge";
import type { DrawOp } from "@iguess/shared";
import { awardsFor } from "@iguess/shared/awards";
import { styles } from "./styles";
import { RoomSidebar } from "./RoomSidebar";
import { Scoreboard } from "./Scoreboard";
import { ChatPanel } from "./ChatPanel";
import { useToast } from "./useToast";
import { useMuted } from "./useMuted";
import { saveCanvasPng } from "./canvasExport";
import { COLORS } from "./brushStyle";
import { useBrush } from "./useBrush";
import { DrawToolbar } from "./DrawToolbar";
import { EndScreen } from "./EndScreen";
import { boardHint } from "./labels";
import { GameBoard } from "./GameBoard";
import { Dots } from "./Dots";
import { MODES } from "./gameModes";
import { Confetti } from "./Confetti";
export function Room({
  name,
  room,
  mode,
  avatar,
  onLeave,
}: {
  name: string;
  room: string;
  mode: string;
  avatar: string;
  onLeave: () => void;
}) {
  const {
    connected,
    fatal,
    you,
    serverMode,
    players,
    log,
    game,
    myWord,
    sendChat,
    sendDraw,
    subscribeDraw,
    clearBoard,
    startGame,
    wordChoices,
    skipWord,
    settings,
    updateSettings,
    kick,
    setReady,
    peerCursor,
    sendCursor,
    reactions,
    react,
    socketBacklog,
    turnEnd,
    chooseWord,
  } = useGameSocket(room, name, mode, avatar);
  const effectiveMode = serverMode ?? mode;
  const isAIMode = effectiveMode !== "classic";

  const [everConnected, setEverConnected] = useState(false);
  useEffect(() => {
    if (connected) setEverConnected(true);
  }, [connected]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  const brush = useBrush(COLORS[0]!);
  const roundOps = useRef<DrawOp[]>([]);
  const { toast, showToast, hideToast } = useToast();
  const { muted, toggleMuted } = useMuted();
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);

  const {
    phase,
    isDrawer,
    youAreHost,
    humans,
    watching,
    youAreWatching,
    readyCount,
    youAreReady,
    canDraw,
    drawingNow,
    inGame,
    ranked,
    hasAI,
    aiGuessedRight,
    soloWaiting,
  } = roomView(game, players, you);
  const canUseCanvas = connected && canDraw;
  const { gallery, botGuess } = useRoundGallery({
    turnEnd,
    game,
    phase,
    log,
    aiGuessedRight,
    hasAI,
    canvasElRef,
    roundOps,
  });
  const { burstKey, winConfetti } = useGameFeedback({
    canDraw: canUseCanvas,
    game,
    phase,
    ranked,
    you,
    muted,
    showToast,
  });
  const awards = phase === "ended" ? awardsFor(gallery, players) : [];
  useWakeLock(inGame || phase === "choosing");
  useAppBadge(canDraw || (phase === "choosing" && isDrawer) ? 1 : 0);

  const hint = boardHint({
    canDraw,
    youAreWatching,
    phase,
    isDrawer,
    drawerName: playerName(players, game?.drawerId ?? ""),
    drawerIsAI: isAI(game?.drawerId),
  });
  const aiTake =
    hasAI && inGame && !isAI(game?.drawerId)
      ? { won: aiGuessedRight, guess: botGuess }
      : null;

  // The drawer sees the word. Everyone else sees one tile per letter, filling in over time.
  const wordLetters = isDrawer
    ? (myWord ?? "").split("")
    : game?.hint
      ? game.hint.split("").map((ch) => (ch === "_" ? "" : ch))
      : Array.from({ length: game?.wordLength ?? 0 }, () => "");

  const modeMeta = MODES.find((m) => m.value === effectiveMode);
  const {
    inviteResult,
    resultsCopied,
    savingEvidence,
    handleInvite,
    copyResults,
    saveEvidence,
    resultSummary,
  } = useRoomSharing({
    room,
    effectiveMode,
    modeLabel: modeMeta?.label ?? effectiveMode,
    standings: { ranked, scores: game?.scores ?? {}, youId: you?.id ?? null },
    gallery,
    players,
    showToast,
  });

  if (fatal) return <RoomError reason={fatal} onLeave={onLeave} />;

  return (
    <div className="app-layout" data-phase={phase} style={styles.layout}>
      <Confetti go={phase === "ended"} count={winConfetti} />
      {burstKey > 0 && <Confetti key={burstKey} go count={28} />}
      {toast && (
        <div
          className="toast-in"
          role="status"
          aria-live="polite"
          style={styles.toast}
          onClick={hideToast}
          title="tap to dismiss"
        >
          {toast}
        </div>
      )}
      {everConnected && !connected && (
        <div role="alert" style={styles.reconnectBanner}>
          ⚠ connection dropped. reconnecting
          <Dots />
        </div>
      )}
      <RoomSidebar
        room={room}
        modeIcon={modeMeta?.icon}
        modeLabel={modeMeta?.label ?? effectiveMode}
        connected={connected}
        everConnected={everConnected}
        inviteResult={inviteResult}
        onInvite={handleInvite}
        muted={muted}
        onToggleMute={toggleMuted}
        onLeave={onLeave}
      >
        <Scoreboard
          ranked={ranked}
          game={game}
          youId={you?.id ?? null}
          youAreHost={youAreHost}
          onKick={kick}
        />
      </RoomSidebar>

      <section className="pane-canvas" style={styles.canvasPane}>
        <RoomBanner
          {...{
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
          }}
        />

        <DrawToolbar
          brush={brush}
          canDraw={canUseCanvas}
          onUndo={() => sendDraw({ kind: "undo" })}
          onSave={() =>
            canvasElRef.current && saveCanvasPng(canvasElRef.current, room)
          }
          onClear={clearBoard}
        />

        <GameBoard
          socket={{
            sendDraw,
            subscribeDraw,
            socketBacklog,
            sendCursor,
            peerCursor,
            reactions,
          }}
          brush={brush}
          canDraw={canUseCanvas}
          opsRef={roundOps}
          onCanvas={(el) => (canvasElRef.current = el)}
          hint={!connected ? "Connecting to the room…" : hint}
          waiting={inGame || !connected}
          aiTake={aiTake}
          phase={phase}
        />

        {phase === "ended" && (
          <EndScreen
            gallery={gallery}
            awards={awards}
            onSave={saveEvidence}
            saving={savingEvidence}
          />
        )}
      </section>

      <ChatPanel
        room={room}
        connected={connected}
        log={log}
        drawingNow={drawingNow}
        inGame={phase === "playing"}
        onReact={react}
        onSend={sendChat}
        onSendFailed={() =>
          showToast("Not sent. Reconnecting—your message is still here.")
        }
      />
    </div>
  );
}
function playerName(players: { id: string; name: string }[], id: string) {
  return players.find((p) => p.id === id)?.name ?? "Someone";
}
