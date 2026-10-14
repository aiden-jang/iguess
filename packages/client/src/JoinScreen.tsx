import { ClubFace } from "./ClubFace";
import { ResourceLinks } from "./ResourceDialog";
import { AVATARS } from "@iguess/shared";
import { newRoomCode } from "@iguess/shared/roomCode";
import { MODES, randomName } from "./gameModes";
import type { LifetimeStats } from "./playerStats";
import "./join.css";

type Props = {
  draftName: string;
  setDraftName: (name: string) => void;
  draftRoom: string;
  setDraftRoom: (room: string) => void;
  draftMode: string;
  setDraftMode: (mode: string) => void;
  avatar: string;
  setAvatar: (avatar: string) => void;
  invited: boolean;
  stats: LifetimeStats;
  doJoin: () => void;
};

export function JoinScreen(p: Props) {
  return (
    <div className="join-page">
      <header className="join-header">
        <a href="/" className="wordmark" aria-label="iguess home">
          iguess<span aria-hidden>✳</span>
        </a>
        <a className="join-jump" href="#join-form">
          Play ↗
        </a>
      </header>
      <main className="join-layout">
        <section className="join-intro" aria-labelledby="join-title">
          <p className="eyebrow">
            <span className="club-dot" /> The drawing club. Talent not checked.
          </p>
          <h1 id="join-title">
            Good guesses.
            <br />
            <em>Questionable art.</em>
          </h1>
          <p className="join-description">
            Draw a secret word. Race your friends and an AI to guess it.
            Absolutely no one is checking your art degree.
          </p>
          <div className="example-stage">
            <DoodleExample />
            <div className="club-sticker">
              <ClubFace />
              <span>
                art is
                <br />
                subjective.
              </span>
            </div>
          </div>
          <ol className="join-steps">
            <li>
              <span>01</span> Pick a word. Draw the thing.
            </li>
            <li>
              <span>02</span> Guess quickly. Collect points.
            </li>
            <li>
              <span>03</span> Keep the evidence. Deny nothing.
            </li>
          </ol>
        </section>
        <form
          id="join-form"
          className="join-card"
          onSubmit={(event) => {
            event.preventDefault();
            p.doJoin();
          }}
          aria-labelledby="join-form-title"
        >
          <div className="join-card-heading">
            <span className="eyebrow">No account. No audition.</span>
            <h2 id="join-form-title">
              {p.invited ? "You’re invited." : "Let’s make a mess."}
            </h2>
          </div>
          {p.invited && (
            <p className="invite-note">
              Joining room <strong>{p.draftRoom}</strong>. Bring a name. That’s
              it.
            </p>
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
              required
            />
            <button
              type="button"
              aria-label="Random name"
              onClick={() => p.setDraftName(randomName())}
            >
              ↻
            </button>
          </div>
          <fieldset className="avatar-picker">
            <legend>Pick your face</legend>
            <details className="avatar-options">
              <summary>
                <span aria-hidden>{p.avatar}</span> Change face{" "}
                <span aria-hidden>⌄</span>
              </summary>
              <div>
                {AVATARS.map((avatar) => (
                  <button
                    key={avatar}
                    type="button"
                    aria-label={`Avatar ${avatar}`}
                    aria-pressed={avatar === p.avatar}
                    onClick={() => p.setAvatar(avatar)}
                  >
                    {avatar}
                  </button>
                ))}
              </div>
            </details>
          </fieldset>
          <label htmlFor="room-code">
            Room code <span>Use this new code, or enter a friend’s.</span>
          </label>
          <div className="join-input-row">
            <input
              id="room-code"
              value={p.draftRoom}
              maxLength={32}
              onChange={(e) => p.setDraftRoom(e.target.value)}
              placeholder="A new room, or a friend’s code"
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
          <fieldset className="mode-picker">
            <legend>How are we playing?</legend>
            <div>
              {MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  aria-pressed={mode.value === p.draftMode}
                  onClick={() => p.setDraftMode(mode.value)}
                >
                  <span aria-hidden>{mode.icon}</span>
                  <span>
                    <strong>{mode.label}</strong>
                    <small>{mode.blurb}</small>
                  </span>
                  <span className="mode-check" aria-hidden>
                    {mode.value === p.draftMode ? "✓" : ""}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
          <p className="join-mode-note">
            {p.draftMode === "classic"
              ? "Classic needs two people. Invite a friend after joining."
              : "Play solo or bring friends. One person is enough."}{" "}
            The first person in sets the room’s mode.
          </p>
          <button
            className="join-submit"
            type="submit"
            disabled={!p.draftName.trim()}
          >
            {p.invited ? "Join the room" : "Enter room"}
            <span aria-hidden>↗</span>
          </button>
          {p.stats.games > 0 && (
            <p className="join-stats">
              {p.stats.games} games · {p.stats.wins} wins · best streak{" "}
              {p.stats.bestStreak}
            </p>
          )}
          <p className="join-small-print">
            Your name and drawings are shared with the room. AI guessing may
            send drawings to a vision provider. By playing, you agree to the
            Terms below.
          </p>
        </form>
      </main>
      <footer className="join-footer">
        <span>Low stakes. High opinions.</span>
        <ResourceLinks />
        <a
          href="https://aidenjang.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          Made by Aiden ↗
        </a>
        <a href="mailto:me@aidenjang.com">Help / feedback ↗</a>
      </footer>
    </div>
  );
}

function DoodleExample() {
  return (
    <figure className="doodle-example">
      <div className="doodle-meta">
        <span>EXAMPLE / allegedly a cat</span>
        <span aria-hidden>✳</span>
      </div>
      <svg
        viewBox="0 0 420 240"
        role="img"
        aria-label="A wonky cat drawing with pointy ears and uneven whiskers"
      >
        <path
          d="M133 112 126 44 181 78 Q210 66 239 81 L286 43 279 116 Q302 171 258 191 Q212 214 159 190 Q119 175 133 112Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="m168 125 4 2m65-1 4-2m-43 26 12 1-7 9Zm-34 1-64-8m63 18-64 7m131-16 59-15m-55 29 60 3m-100-8q-8 19-18 7m18-7q9 17 18 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="m310 63 13-9m-6 28 15 2"
          stroke="var(--accent)"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
      <figcaption>
        <span className="example-bot">AI</span>
        <span>A toaster?</span>
        <span className="example-reply">Close. Emotionally.</span>
      </figcaption>
    </figure>
  );
}
