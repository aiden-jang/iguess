import { AvatarPicker } from "./AvatarPicker";
import { useEffect, useState } from "react";
import { VisionNotice } from "./VisionNotice";
import { ClubFace } from "./ClubFace";
import { MODES, randomName } from "./gameModes";
import type { JoinProps } from "./join.types";
import { useOnline } from "./useOnline";
import { preloadRoom } from "./RoomGate";

export function JoinForm(p: JoinProps) {
  const online = useOnline();
  const preload = () => {
    if (online) preloadRoom(p.draftMode);
  };
  const extraMode = !MODES.slice(0, 4).some(
    (mode) => mode.value === p.draftMode,
  );
  const [optionsOpen, setOptionsOpen] = useState(extraMode);
  useEffect(() => {
    if (p.roomError) {
      setOptionsOpen(true);
      requestAnimationFrame(() =>
        document.getElementById("room-code")?.focus(),
      );
    } else if (p.entryError) document.getElementById("player-name")?.focus();
  }, [p.roomError, p.entryError]);
  return (
    <form
      id="join-form"
      className="join-card"
      aria-labelledby="join-form-title"
      onSubmit={(event) => {
        event.preventDefault();
        if (!online) return;
        preload();
        p.doJoin();
      }}
    >
      <div className="join-card-heading">
        <h2 id="join-form-title">
          {p.invited ? "You’re on the list." : "Get a room."}
        </h2>
        <ClubFace />
      </div>
      <p className="join-form-aside">
        {p.invited ? (
          <>
            Room <strong translate="no">{p.draftRoom}</strong>. Your people are
            in there.
          </>
        ) : (
          "A name. That’s the paperwork."
        )}
      </p>
      {!p.invited && p.lastRoom && (
        <div className="returning-room">
          <span>
            New room: <strong>{p.draftRoom}</strong>
          </span>
          <button type="button" onClick={() => p.selectRoom(p.lastRoom!)}>
            Rejoin {p.lastRoom} ↗
          </button>
        </div>
      )}
      {p.invited && (
        <button
          className="start-fresh"
          type="button"
          onClick={() => p.selectRoom()}
        >
          Start a new room instead ↗
        </button>
      )}
      <label htmlFor="player-name">Your name</label>
      <div className="join-input-row">
        <input
          id="player-name"
          name="name"
          autoComplete="nickname"
          maxLength={24}
          pattern=".*\S.*"
          title="Enter a name with at least one non-space character."
          value={p.draftName}
          onChange={(e) => p.setDraftName(e.target.value)}
          placeholder="Your nickname…"
          enterKeyHint="go"
          aria-describedby="entry-feedback"
          aria-invalid={!!p.entryError}
          required
        />
        <button
          type="button"
          aria-label="Random name"
          title="Let fate name you"
          onClick={() => p.setDraftName(randomName())}
        >
          ↻
        </button>
      </div>
      <p
        id="entry-feedback"
        className="entry-feedback"
        role={p.entryError ? "alert" : undefined}
      >
        {p.entryError ||
          (!p.draftName.trim()
            ? "Add your name to enter. Full legal identity unnecessary."
            : "Your name is shared with this room.")}
      </p>
      {!p.invited && (
        <fieldset className="mode-picker">
          <legend>Choose your company</legend>
          <div>
            {MODES.slice(0, 4).map((mode) => (
              <button
                key={mode.value}
                type="button"
                aria-pressed={mode.value === p.draftMode}
                onClick={() => p.setDraftMode(mode.value)}
              >
                <span className="mode-name">
                  <strong>{mode.label}</strong>
                  <span aria-hidden>
                    {mode.value === p.draftMode ? "↗" : "+"}
                  </span>
                </span>
                <small>
                  {mode.value === "classic"
                    ? "Your friends. Their opinions."
                    : mode.value === "ai"
                      ? "You draw. It overthinks."
                      : mode.value === "ai-drawer"
                        ? "It draws. You judge."
                        : "Draw it. Pass it on."}
                </small>
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {extraMode && (
        <p className="selected-extra">
          Playing {MODES.find((mode) => mode.value === p.draftMode)?.label} ↗
        </p>
      )}
      <button
        className="join-submit"
        type="submit"
        disabled={!online || !p.draftName.trim()}
        aria-describedby={online ? undefined : "join-offline"}
        onFocus={preload}
        onPointerEnter={preload}
      >
        {p.invited ? "Join the room" : "Enter room"}
        <span aria-hidden>↗</span>
      </button>
      {!online && (
        <p className="join-mode-note" id="join-offline" role="status">
          You’re offline. Reconnect to enter a room.
        </p>
      )}
      <p className="join-mode-note">
        {p.invited
          ? "The host sets the mode. You bring the opinions."
          : p.draftMode === "classic"
            ? "Needs two humans. Invite a friend once you’re in."
            : p.draftMode === "relay"
              ? "For 3–8 friends. Everyone plays at once."
              : "Solo is fine. Friends are also tolerated."}
      </p>
      {!p.invited && (
        <p className="mode-explanation">
          {p.draftMode === "ai-drawer"
            ? "Curated doodles, drawn stroke by stroke. You guess."
            : p.draftMode === "classic"
              ? "Humans draw and guess. Bring at least one friend."
              : p.draftMode === "relay"
                ? "Draw, guess, and reveal how each word changed."
                : p.draftMode === "team-battle"
                  ? "Your group faces the AI. The first correct guess wins the turn for its team."
                  : p.draftMode === "duel"
                    ? "Take turns drawing with the AI. The highest score wins."
                    : "The AI guesses from your drawing. Confidence varies."}
        </p>
      )}
      {online && !p.invited && p.draftMode !== "relay" && (
        <VisionNotice mode={p.draftMode} onMode={p.setDraftMode} />
      )}
      <details
        className="join-options"
        open={optionsOpen}
        onToggle={(event) => setOptionsOpen(event.currentTarget.open)}
      >
        <summary>
          <span>Room code & more ways to play</span>
          <span aria-hidden>+</span>
        </summary>
        <div className="join-options-body">
          <label htmlFor="room-code">
            Room code <span>Use this one, or enter a friend’s.</span>
          </label>
          <div className="join-input-row">
            <input
              id="room-code"
              name="room"
              aria-invalid={Boolean(p.roomError)}
              aria-describedby="room-code-note"
              value={p.draftRoom}
              maxLength={32}
              onChange={(e) => p.setDraftRoom(e.target.value)}
              placeholder="A room code…"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            <button
              type="button"
              aria-label="New room code"
              onClick={p.regenerateRoom}
            >
              ↻
            </button>
          </div>
          {!p.invited && (
            <fieldset className="extra-modes">
              <legend>More ways to play</legend>
              <div>
                {MODES.slice(4).map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    aria-pressed={mode.value === p.draftMode}
                    onClick={() => p.setDraftMode(mode.value)}
                  >
                    <strong>{mode.label}</strong>
                    <small>{mode.blurb}</small>
                    <span aria-hidden>
                      {mode.value === p.draftMode ? "✓" : "↗"}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <p
            className="join-options-note"
            id="room-code-note"
            role={p.roomError ? "alert" : undefined}
          >
            {p.roomError ||
              "Room codes are case-sensitive. Existing rooms keep the host’s mode."}
          </p>
        </div>
      </details>
      <AvatarPicker value={p.avatar} onChange={p.setAvatar} />
      {p.stats.games > 0 && (
        <p className="join-stats">
          {p.stats.games} scored games · {p.stats.wins} wins · best streak{" "}
          {p.stats.bestStreak}
        </p>
      )}
      <p className="join-small-print">
        No account needed. Your name and drawings are shared with the room. AI
        guessing may send drawings to a vision provider. By playing, you agree
        to the Terms below.
      </p>
    </form>
  );
}
