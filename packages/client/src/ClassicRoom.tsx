import { useRoomSharing } from "./useRoomSharing";
import { useRoundGallery } from "./useRoundGallery";
import { useGameFeedback } from "./useGameFeedback";
import { RoomBanner } from "./RoomBanner";
import { useEffect, useRef, useState } from "react";
import type { RoomScreenProps } from "./Room";
import { isAI, roomView } from "./roomView";
import { useWakeLock } from "./useWakeLock";
import { useAppBadge } from "./useAppBadge";
import { awardsFor } from "@iguess/shared/awards";
import { RoomHeader } from "./RoomHeader";
import { Scoreboard } from "./Scoreboard";
import { LobbyRoster } from "./LobbyRoster";
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
import { MODES } from "./gameModes";
import { Confetti } from "./Confetti";
export function ClassicRoom({
  room,
  onLeave,
  socket,
  requestedMode,
}: RoomScreenProps & { requestedMode: string }) {
  const {
    connected,
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
  } = socket;
  const effectiveMode = serverMode ?? requestedMode;
  const isAIMode = effectiveMode !== "classic";
  const [everConnected, setEverConnected] = useState(false);
  useEffect(() => {
    if (connected) setEverConnected(true);
  }, [connected]);
  const brush = useBrush(COLORS[0]!);
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
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!you || (phase === "playing" && isDrawer)) return;
    const heading = main.current?.querySelector<HTMLElement>("h1");
    (heading?.offsetParent ? heading : main.current)?.focus({
      preventScroll: true,
    });
  }, [!!you, phase, isDrawer]);
  const {
    gallery,
    botGuess,
    blankRounds,
    ready: galleryReady,
  } = useRoundGallery(socket);
  const resultPlayers = game?.resultPlayers ?? players;
  const resultRanked = game?.resultPlayers
    ? resultPlayers
        .map((player) => ({
          ...player,
          connected: players.some(
            (live) => live.id === player.id && live.connected !== false,
          ),
        }))
        .sort((a, b) => (game.scores[b.id] ?? 0) - (game.scores[a.id] ?? 0))
    : ranked;
  const { burstKey, winConfetti } = useGameFeedback({
    canDraw: canUseCanvas,
    game,
    phase,
    mode: effectiveMode,
    ranked: resultRanked,
    you,
    muted,
    showToast,
  });
  useWakeLock(connected && (inGame || phase === "choosing"));
  useAppBadge(
    connected && isDrawer && (phase === "playing" || phase === "choosing")
      ? 1
      : 0,
  );
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

  const wordLetters = isDrawer
    ? (myWord ?? "").split("")
    : game?.hint
      ? game.hint.split("").map((ch) => (ch === "_" ? "" : ch))
      : Array.from({ length: game?.wordLength ?? 0 }, () => "");

  const modeMeta = MODES.find((m) => m.value === effectiveMode);
  const sharing = useRoomSharing({
    room,
    ended: phase === "ended",
    effectiveMode,
    modeLabel: modeMeta?.label ?? effectiveMode,
    standings: {
      ranked: resultRanked,
      scores: game?.scores ?? {},
      youId: you?.id ?? null,
      teamScore: game?.teamScore,
    },
    gallery,
    players: resultPlayers,
    showToast,
  });

  return (
    <div className="app-layout" data-phase={phase} data-drawing={drawingNow}>
      <Confetti go={phase === "ended" && winConfetti > 0} count={winConfetti} />
      {burstKey > 0 && <Confetti key={burstKey} go count={10} />}
      <RoomHeader
        room={room}
        points={game ? (game.scores[you?.id ?? ""] ?? 0) : undefined}
        modeLabel={modeMeta?.label ?? effectiveMode}
        connected={connected}
        everConnected={everConnected}
        inviteResult={sharing.inviteResult}
        inviteUrl={sharing.inviteUrl}
        onInvite={sharing.handleInvite}
        muted={muted}
        onToggleMute={toggleMuted}
        onLeave={onLeave}
      >
        <Scoreboard
          ranked={phase === "ended" ? resultRanked : ranked}
          game={game}
          youId={you?.id ?? null}
          youAreHost={youAreHost}
          onKick={kick}
        />
      </RoomHeader>

      <main
        ref={main}
        id="room-main"
        tabIndex={-1}
        aria-label="Drawing board"
        className="pane-canvas"
      >
        <RoomBanner
          {...{
            phase,
            turnEnd,
            connected,
            youAreWatching,
            soloWaiting,
            isAIMode,
            effectiveMode,
            readyCount,
            humans,
            watching,
            settings,
            youAreHost,
            updateSettings,
            youAreReady,
            setReady,
            startGame,
            copyResults: sharing.copyResults,
            resultsCopied: sharing.resultsCopied,
            resultsFallback: sharing.resultsFallback,
            resultSummary: sharing.resultSummary,
            game,
            isDrawer,
            wordChoices,
            chooseWord,
            skipWord,
            players,
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
          onCanvas={(el) => (canvasElRef.current = el)}
          hint={connected ? (youAreWatching && hint) || null : "Connecting…"}
          waiting={inGame || !connected}
          aiTake={aiTake}
          phase={phase}
        />

        {phase === "ended" && (
          <EndScreen
            gallery={gallery}
            blankRounds={blankRounds}
            players={resultPlayers}
            awards={awardsFor(gallery, resultPlayers)}
            status={galleryReady ? socket.galleryStatus : "loading"}
            onSave={sharing.saveEvidence}
            onShare={sharing.shareEvidence}
            canShare={sharing.canShareEvidence}
            saving={sharing.savingEvidence}
          />
        )}
      </main>

      <ChatPanel
        ended={phase === "ended"}
        guessed={!!you && !!game?.guessedIds.includes(you.id)}
        notice={toast}
        onDismissNotice={hideToast}
        reconnecting={everConnected && !connected}
        room={room}
        lobbyRoster={phase === "lobby" && <LobbyRoster players={players} />}
        connected={connected}
        log={log}
        drawingNow={drawingNow}
        inGame={phase === "playing"}
        canGuess={phase === "playing" && !youAreWatching && !isDrawer}
        onReact={react}
        onSend={sendChat}
        chatAck={socket.chatAck}
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
