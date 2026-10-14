import { AvatarPicker } from "./AvatarPicker";
import { newRoomCode } from "@iguess/shared/roomCode";
import { useState } from "react";
import { VisionNotice } from "./VisionNotice";
import { ClubFace } from "./ClubFace";
import { MODES, randomName } from "./gameModes";
import type { JoinProps } from "./join.types";

export function JoinForm(p: JoinProps) {
  const extraMode = !["classic", "ai", "ai-drawer"].includes(p.draftMode);
  const [optionsOpen, setOptionsOpen] = useState(extraMode);
  return (
    <form
      id="join-form"
      className="join-card"
      aria-labelledby="join-form-title"
      onSubmit={(event) => {
        event.preventDefault();
        p.doJoin();
      }}
    >
      <div className="join-card-top">
        <span className="eyebrow">Your very unofficial debut</span>
        <ClubFace />
      </div>
      <h2 id="join-form-title">
        {p.invited ? "You’re on the list." : "Make yourself known."}
      </h2>
      <p className="join-form-aside">
        {p.invited ? (
          <>
            Room <strong>{p.draftRoom}</strong>. Your people are in there.
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
          autoComplete="nickname"
          maxLength={24}
          pattern=".*\S.*"
          title="Enter a name with at least one non-space character."
          value={p.draftName}
          onChange={(e) => p.setDraftName(e.target.value)}
          placeholder="A name you can defend"
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
            {MODES.slice(0, 3).map((mode) => (
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
                      : "It draws. You judge."}
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
        disabled={!p.draftName.trim()}
      >
        {p.invited ? "Join the room" : "Enter room"}
        <span aria-hidden>↗</span>
      </button>
      <p className="join-mode-note">
        {p.invited
          ? "The host sets the mode. You bring the opinions."
          : p.draftMode === "classic"
            ? "Needs two humans. Invite a friend once you’re in."
            : "Solo is fine. Friends are also tolerated."}
      </p>
      {!p.invited && (
        <p className="mode-explanation">
          {p.draftMode === "ai-drawer"
            ? "Curated doodles, drawn stroke by stroke. You guess."
            : p.draftMode === "classic"
              ? "Humans draw and guess. Bring at least one friend."
              : "The AI guesses from your drawing. Confidence varies."}
        </p>
      )}
      {!p.invited && (
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
              value={p.draftRoom}
              maxLength={32}
              onChange={(e) => p.setDraftRoom(e.target.value)}
              placeholder="A room code"
              autoCapitalize="none"
              spellCheck={false}
            />
            <button
              type="button"
              aria-label="New room code"
              onClick={() => p.setDraftRoom(newRoomCode())}
            >
              ↻
            </button>
          </div>
          {!p.invited && (
            <fieldset className="extra-modes">
              <legend>A little more competitive</legend>
              <div>
                {MODES.slice(3).map((mode) => (
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
          <p className="join-options-note">
            The first person in sets a new room’s mode. Existing rooms keep
            their host’s choice.
          </p>
        </div>
      </details>
      <AvatarPicker value={p.avatar} onChange={p.setAvatar} />
      {p.stats.games > 0 && (
        <p className="join-stats">
          {p.stats.games} games · {p.stats.wins} wins · best streak{" "}
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
