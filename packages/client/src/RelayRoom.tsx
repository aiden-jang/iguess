import { useEffect, useState } from "react";
import type { DrawOp, Point } from "@iguess/shared";
import { RELAY_MIN_PLAYERS } from "@iguess/shared/relay";
import { RoomHeader } from "./RoomHeader";
import { LobbyRoster } from "./LobbyRoster";
import { Scoreboard } from "./Scoreboard";
import { RelayBoard } from "./RelayBoard";
import { RelayTurn } from "./RelayTurn";
import { RelayReveal } from "./RelayReveal";
import { useRoomInvite } from "./useRoomInvite";
import { useRoomViewport } from "./useRoomViewport";
import { useWakeLock } from "./useWakeLock";
import { useMuted } from "./useMuted";
import type { RoomScreenProps } from "./Room";
import "./relay.css";

function sampleStroke(strokeId: string, points: Point[]): DrawOp[] {
  return [
    { kind: "start", strokeId, point: points[0]!, color: "#202522", width: 3 },
    { kind: "move", strokeId, points: points.slice(1) },
    { kind: "end", strokeId },
  ];
}
const snail = [
  ...sampleStroke("shell", [
    { x: 0.48, y: 0.56 },
    { x: 0.52, y: 0.53 },
    { x: 0.53, y: 0.46 },
    { x: 0.5, y: 0.41 },
    { x: 0.46, y: 0.44 },
    { x: 0.45, y: 0.53 },
    { x: 0.48, y: 0.64 },
    { x: 0.55, y: 0.63 },
    { x: 0.58, y: 0.53 },
    { x: 0.58, y: 0.4 },
    { x: 0.55, y: 0.3 },
    { x: 0.49, y: 0.25 },
    { x: 0.43, y: 0.28 },
    { x: 0.38, y: 0.38 },
    { x: 0.37, y: 0.53 },
    { x: 0.41, y: 0.65 },
  ]),
  ...sampleStroke("body", [
    { x: 0.34, y: 0.68 },
    { x: 0.42, y: 0.7 },
    { x: 0.51, y: 0.65 },
    { x: 0.61, y: 0.6 },
    { x: 0.65, y: 0.53 },
    { x: 0.69, y: 0.56 },
    { x: 0.7, y: 0.65 },
    { x: 0.67, y: 0.73 },
    { x: 0.57, y: 0.79 },
    { x: 0.46, y: 0.81 },
    { x: 0.37, y: 0.76 },
    { x: 0.34, y: 0.68 },
  ]),
  ...sampleStroke("eyes", [
    { x: 0.64, y: 0.55 },
    { x: 0.62, y: 0.42 },
    { x: 0.61, y: 0.39 },
  ]),
  ...sampleStroke("antenna", [
    { x: 0.68, y: 0.55 },
    { x: 0.69, y: 0.42 },
    { x: 0.71, y: 0.38 },
  ]),
];

export function RelayRoom({ room, socket, onLeave }: RoomScreenProps) {
  const { connected, relay, players, you } = socket;
  const [everConnected, setEverConnected] = useState(connected);
  useEffect(() => {
    if (connected) setEverConnected(true);
  }, [connected]);
  useRoomViewport();
  useWakeLock(
    connected && relay?.phase === "active" && relay.assignment.kind !== "watch",
  );
  const { muted, toggleMuted } = useMuted();
  const invite = useRoomInvite(room, "relay", "Drawing Relay");
  const host = you?.isHost ?? false;
  const count = players.filter(
    (player) => !player.spectator && player.connected !== false,
  ).length;
  return (
    <div className="relay-room" data-phase={relay?.phase}>
      <RoomHeader
        room={room}
        modeLabel="Drawing Relay"
        showScores={false}
        connected={connected}
        everConnected={everConnected}
        inviteResult={invite.inviteResult}
        inviteUrl={invite.inviteUrl}
        onInvite={invite.handleInvite}
        muted={muted}
        onToggleMute={toggleMuted}
        onLeave={() => {
          socket.leave();
          onLeave();
        }}
      >
        <Scoreboard
          ranked={players}
          game={null}
          showScores={false}
          youId={you?.id ?? null}
          youAreHost={host}
          onKick={socket.kick}
        />
      </RoomHeader>
      <main id="room-main" tabIndex={-1} className="relay-main">
        {!connected && (
          <p className="relay-notice" role="status">
            {relay?.phase === "active" && relay.assignment.kind !== "watch"
              ? "Connection lost. Rejoining… Your seat is held through this handoff."
              : "Connection lost. Rejoining the relay…"}
          </p>
        )}
        {socket.relayNotice && (
          <p className="relay-notice" role="status">
            {socket.relayNotice}
          </p>
        )}
        {!relay && <h1>Opening your relay…</h1>}
        {relay?.phase === "lobby" && (
          <div className="relay-lobby">
            <section>
              <h1>Draw it. Pass it on.</h1>
              <p className="relay-lead">
                Everyone starts a chain. Draw the word you pick, guess someone
                else’s drawing, then see where each idea ends up.
              </p>
              <p className="relay-lead">60s to draw · 30s to guess</p>
              <p className="relay-progress" role="status">
                {count < RELAY_MIN_PLAYERS
                  ? "Drawing Relay needs at least 3 players. Invite friends to start."
                  : `${count} players in the room.`}
              </p>
              <div className="relay-lobby-actions">
                {you && !you.spectator && (
                  <button
                    type="button"
                    aria-pressed={!!you.ready}
                    disabled={!connected}
                    onClick={() => socket.setReady(!you.ready)}
                  >
                    {you.ready ? "Ready" : "I’m ready"}
                  </button>
                )}
                {host ? (
                  <button
                    type="button"
                    className="relay-primary"
                    disabled={!connected || count < RELAY_MIN_PLAYERS}
                    onClick={socket.startGame}
                  >
                    Start relay
                  </button>
                ) : (
                  <p>Waiting for the host to start.</p>
                )}
              </div>
              <div className="relay-example">
                <p>A sample handoff</p>
                <ol>
                  <li>
                    <strong>Snail</strong>
                    <span>Starting word</span>
                  </li>
                  <li>
                    <RelayBoard ops={snail} label="A quick snail drawing" />
                  </li>
                  <li>
                    <strong>“A cinnamon roll”</strong>
                    <span>Next guess</span>
                  </li>
                </ol>
              </div>
            </section>
            <LobbyRoster players={players} />
          </div>
        )}
        {relay?.phase === "active" && (
          <RelayTurn
            key={`${relay.id}:${relay.leg}`}
            state={relay}
            socket={socket}
            room={room}
          />
        )}
        {relay?.phase === "reveal" && (
          <RelayReveal key={relay.id} state={relay} socket={socket} />
        )}
      </main>
    </div>
  );
}
