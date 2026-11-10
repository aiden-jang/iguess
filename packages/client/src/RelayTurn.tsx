import { useEffect, useRef, useState } from "react";
import type { DrawOp } from "@iguess/shared";
import {
  normalizeRelayGuess,
  normalizeRelayWord,
  RELAY_DRAW_MS,
  RELAY_GUESS_LIMIT,
  RELAY_GUESS_MS,
  RELAY_PICK_MS,
  RELAY_WORD_LIMIT,
  type RelayAssignment,
  type RelayClientMessage,
  type RelayState,
} from "@iguess/shared/relay";
import type { RoomScreenProps } from "./Room";
import { Countdown } from "./Countdown";
import { RelayBoard } from "./RelayBoard";
import { useChatDraft } from "./useChatDraft";

function RelayTextEntry({
  draftKey,
  name,
  label,
  placeholder,
  limit,
  button,
  canSend,
  onSend,
  normalize = (value) => value.trim(),
}: {
  draftKey: string;
  name: string;
  label: string;
  placeholder: string;
  limit: number;
  button: string;
  canSend: boolean;
  onSend: (value: string) => void;
  normalize?: (value: string) => string | null;
}) {
  const [draft, setDraft] = useChatDraft(draftKey, "relay");
  const input = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const value = normalize(draft);
  const invalid = Boolean(draft && !value);
  return (
    <form
      className="relay-compose"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend && !composing.current && value) onSend(value);
      }}
    >
      <label htmlFor={`relay-${name}`}>{label}</label>
      <input
        ref={input}
        id={`relay-${name}`}
        name={name}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        autoComplete="off"
        enterKeyHint="send"
        maxLength={limit}
        placeholder={placeholder}
        aria-invalid={invalid}
        aria-describedby={invalid ? `relay-${name}-error` : undefined}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
        }}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            (composing.current ||
              event.nativeEvent.isComposing ||
              event.keyCode === 229)
          )
            event.preventDefault();
        }}
      />
      <button
        type="submit"
        className="relay-primary"
        disabled={!canSend || !value}
        onMouseDown={(event) => {
          // Safari blurs on mousedown, moving the button before the click.
          if (
            event.button === 0 &&
            document.documentElement.dataset.keyboard === "true" &&
            document.activeElement === input.current
          )
            event.preventDefault();
        }}
      >
        {button}
      </button>
      {invalid && (
        <p
          id={`relay-${name}-error`}
          className="relay-entry-error"
          role="status"
        >
          Enter visible text on one line.
        </p>
      )}
    </form>
  );
}

export function RelayTurn({
  state,
  socket,
  room,
}: {
  state: Extract<RelayState, { phase: "active" }>;
  socket: RoomScreenProps["socket"];
  room: string;
}) {
  const { assignment, id, leg, passed, total, endsAt } = state;
  const kind = assignment.kind;
  const [sending, setSending] = useState<{
    assignment: RelayAssignment;
    notice: string | null;
  }>();
  const pending =
    socket.connected &&
    sending?.assignment === assignment &&
    sending.notice === socket.relayNotice;
  const canSend = socket.connected && !pending;
  const commit = (message: RelayClientMessage) => {
    if (canSend && socket.send(message))
      setSending({ assignment, notice: socket.relayNotice });
  };
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, [id, leg, kind]);

  const pass = (text?: string) =>
    commit({ type: "relay", id, leg, action: "pass", guess: text });
  const sendInk = (op: DrawOp) =>
    socket.send({ type: "relay", id, leg, action: "ink", op });
  const heading = {
    choose: "Pick your starting word.",
    draw:
      assignment.kind === "draw" ? (
        <>
          Draw <strong>“{assignment.prompt}”</strong>
        </>
      ) : null,
    guess: "What did they draw?",
    passed:
      leg < 0
        ? "Word picked."
        : leg % 2 === 0
          ? "Drawing passed."
          : "Guess passed.",
    missed: "This pass was skipped.",
    watch: "You’re watching.",
  }[kind];
  const detail = {
    choose: "Your word stays private until the reveal.",
    draw:
      assignment.kind === "draw" && assignment.restart
        ? "The previous guess was missed. The relay continues with a fresh word."
        : leg === 0
          ? "This is the first drawing in your chain."
          : "This is the guess you received from the previous pass.",
    guess: "Your guess becomes the next player’s drawing prompt.",
    passed: "The next leg starts when everyone passes or time runs out.",
    missed: "The relay will continue on the next pass.",
    watch: "You can watch the reveal and join the next relay.",
  }[kind];
  const duration =
    leg < 0 ? RELAY_PICK_MS : leg % 2 === 0 ? RELAY_DRAW_MS : RELAY_GUESS_MS;
  return (
    <>
      <div className="relay-turn">
        <div>
          <h1 ref={title} tabIndex={-1}>
            {heading}
          </h1>
          <p className="relay-lead">{detail}</p>
        </div>
        <div className="relay-step">
          {leg >= 0 && (
            <strong>
              Leg {leg + 1} of {total}
            </strong>
          )}
          <Countdown
            endsAt={endsAt}
            serverNow={state.serverNow}
            durationMs={duration}
          />
        </div>
      </div>
      {assignment.kind === "choose" && (
        <>
          <div className="relay-choices">
            {assignment.words.map((word) => (
              <button
                type="button"
                key={word}
                disabled={!canSend}
                onClick={() =>
                  commit({ type: "relay", id, leg, action: "choose", word })
                }
              >
                {word}
              </button>
            ))}
          </div>
          <RelayTextEntry
            draftKey={`${room}:${id}:${leg}`}
            name="word"
            label="Write your own"
            placeholder="A word or short phrase…"
            limit={RELAY_WORD_LIMIT}
            button={pending ? "Saving…" : "Use word"}
            canSend={canSend}
            normalize={normalizeRelayWord}
            onSend={(word) =>
              commit({ type: "relay", id, leg, action: "write", word })
            }
          />
        </>
      )}
      {assignment.kind === "draw" && (
        <RelayBoard
          label="Drawing canvas"
          ops={assignment.ops}
          editing={{
            room,
            connected: canSend,
            pending,
            send: sendInk,
            pass: () => pass(),
            backlog: socket.socketBacklog,
          }}
        />
      )}
      {assignment.kind === "guess" && (
        <div className="relay-workspace">
          <RelayBoard label="Drawing to guess" ops={assignment.ops} />
          <RelayTextEntry
            draftKey={`${room}:${id}:${leg}`}
            name="guess"
            label="Your guess"
            placeholder="A guess…"
            limit={RELAY_GUESS_LIMIT}
            button={pending ? "Passing…" : "Pass guess"}
            canSend={canSend}
            normalize={normalizeRelayGuess}
            onSend={pass}
          />
        </div>
      )}
      <p className="relay-progress" role="status">
        {passed} of {total} players {leg < 0 ? "picked a word" : "have passed"}
      </p>
    </>
  );
}
