import { useEffect, useRef, useState } from "react";
import {
  RELAY_MIN_PLAYERS,
  type RelayEntry,
  type RelayState,
} from "@iguess/shared/relay";
import type { RoomScreenProps } from "./Room";
import { RelayBoard } from "./RelayBoard";
import { Replay } from "./Replay";
import { Icon } from "./Icon";

function RelayPrint({
  entry,
  actor,
  leg,
}: {
  entry: RelayEntry;
  actor: string;
  leg: number;
}) {
  const [replaying, setReplaying] = useState(false);
  const action = leg % 2 === 0 ? "drew" : "guessed";
  return (
    <li className={entry.kind === "drawing" ? "relay-print" : "relay-caption"}>
      <p className="relay-credit">
        Leg {leg + 1} ·{" "}
        {entry.kind === "skipped" ? "Pass missed" : `${actor} ${action}`}
      </p>
      {"restart" in entry && entry.restart && (
        <p className="relay-credit">Restarted with “{entry.restart}”</p>
      )}
      {entry.kind === "drawing" && (
        <>
          {replaying ? (
            <Replay ops={entry.ops} aspectRatio={3 / 2} />
          ) : (
            <RelayBoard ops={entry.ops} label={`Drawing by ${actor}`} />
          )}
          <button
            type="button"
            className="relay-replay"
            aria-pressed={replaying}
            aria-label={`${replaying ? "Show still" : "Replay drawing"} by ${actor}, leg ${leg + 1}`}
            onClick={() => setReplaying(!replaying)}
          >
            {replaying ? "Show still" : "Replay drawing"}
          </button>
        </>
      )}
      {entry.kind === "guess" && <q>{entry.text}</q>}
    </li>
  );
}

export function RelayReveal({
  state,
  socket,
}: {
  state: Extract<RelayState, { phase: "reveal" }>;
  socket: RoomScreenProps["socket"];
}) {
  const { id, players } = state;
  const { send, connected, relayChain, you } = socket;
  const host = you?.isHost;
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      players.findIndex((player) => player.id === you?.id),
    ),
  );
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (connected)
      send({ type: "relay", action: "chain", id, index, leg: players.length });
  }, [connected, id, index, players.length, send]);
  const chain =
    relayChain?.id === id && relayChain.index === index ? relayChain : null;
  const last = chain?.entries.at(-1);
  const actor = (leg: number) => players[(index + leg) % players.length]!.name;
  const available = socket.players.filter(
    (player) => player.connected !== false,
  ).length;
  return (
    <>
      <div className="relay-reveal-head">
        <div>
          <h1 ref={title} tabIndex={-1}>
            Here’s where it went.
          </h1>
          <p className="relay-lead">
            See how each of the {players.length} chains changed.
          </p>
        </div>
        <div className="relay-reveal-actions">
          <div className="relay-select">
            <label htmlFor="relay-chain">Chain</label>
            <span className="relay-chain-count" aria-live="polite">
              {index + 1} of {players.length}
            </span>
            <select
              id="relay-chain"
              value={index}
              onChange={(event) => setIndex(Number(event.target.value))}
            >
              {players.map((player, i) => (
                <option key={player.id} value={i}>
                  {player.id === you?.id
                    ? "Your chain"
                    : `${player.name}’s chain`}
                </option>
              ))}
            </select>
          </div>
          <div
            className="relay-chain-controls"
            aria-label="Browse chains"
            role="group"
          >
            <button
              type="button"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
              aria-label="Previous chain"
            >
              ←
            </button>
            <button
              type="button"
              disabled={index === players.length - 1}
              onClick={() => setIndex(index + 1)}
              aria-label="Next chain"
            >
              →
            </button>
          </div>
          {host && (
            <button
              type="button"
              className="relay-rematch"
              disabled={!connected || available < RELAY_MIN_PLAYERS}
              onClick={socket.startGame}
            >
              Play again
            </button>
          )}
        </div>
      </div>
      {chain ? (
        <div key={index}>
          <div className="relay-summary">
            <div>
              <span>Starting word</span>
              <strong>{chain.word}</strong>
            </div>
            <Icon name="arrow" />
            <div>
              <span>
                {players.length % 2 === 0 ? "Final guess" : "Final drawing"}
              </span>
              <strong>
                {last?.kind === "guess"
                  ? last.text
                  : last?.kind === "drawing"
                    ? `By ${actor(players.length - 1)}`
                    : "Pass skipped"}
              </strong>
            </div>
          </div>
          <div className="relay-gallery">
            {chain.entries.map((entry, leg) =>
              leg % 2 === 0 ? (
                <ol key={leg} aria-label={`Pass ${leg + 1}`}>
                  <RelayPrint entry={entry} actor={actor(leg)} leg={leg} />
                  {chain.entries[leg + 1] && (
                    <RelayPrint
                      entry={chain.entries[leg + 1]!}
                      actor={actor(leg + 1)}
                      leg={leg + 1}
                    />
                  )}
                </ol>
              ) : null,
            )}
          </div>
        </div>
      ) : (
        <p className="relay-progress" role="status">
          {connected ? "Opening this chain…" : "Reconnecting to the room…"}
        </p>
      )}
    </>
  );
}
