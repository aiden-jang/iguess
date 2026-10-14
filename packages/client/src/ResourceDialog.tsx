import { useEffect, useRef, useState } from "react";
import { ClubFace } from "./ClubFace";
import "./resources.css";

type Resource = "help" | "privacy" | "terms";
const TITLES: Record<Resource, string> = {
  help: "A brief artistic education.",
  privacy: "Your drawing. Your business.",
  terms: "The house rules.",
};

export function ResourceLinks() {
  const [active, setActive] = useState<Resource | null>(() => {
    const value = new URLSearchParams(location.search).get("info");
    return value === "privacy" || value === "terms" || value === "help"
      ? value
      : null;
  });
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLAnchorElement | null>(null);
  useEffect(() => {
    if (active && !dialog.current?.open) dialog.current?.showModal();
  }, [active]);
  return (
    <>
      <nav className="resource-links" aria-label="Help and information">
        {(["help", "privacy", "terms"] as const).map((item) => (
          <a
            key={item}
            aria-label={
              item === "help"
                ? "How to play"
                : item === "privacy"
                  ? "Privacy"
                  : "Terms"
            }
            href={`?info=${item}`}
            onClick={(event) => {
              event.preventDefault();
              opener.current = event.currentTarget;
              setActive(item);
            }}
          >
            {item === "help"
              ? "How to play"
              : item === "privacy"
                ? "Privacy"
                : "Terms"}
          </a>
        ))}
      </nav>
      <dialog
        ref={dialog}
        className="resource-dialog"
        aria-labelledby="resource-title"
        onClose={() => {
          setActive(null);
          const url = new URL(window.location.href);
          url.searchParams.delete("info");
          window.history.replaceState(
            null,
            "",
            url.pathname + url.search + url.hash,
          );
          opener.current?.focus();
        }}
      >
        {active && (
          <>
            <div className="resource-heading">
              <ClubFace />
              <button
                type="button"
                aria-label="Close information"
                onClick={() => dialog.current?.close()}
              >
                ✕
              </button>
            </div>
            <p className="eyebrow">
              iguess / {active === "help" ? "field notes" : active}
            </p>
            <h2 id="resource-title">{TITLES[active]}</h2>
            <ResourceContent resource={active} />
            <p className="resource-contact">
              Questions? <a href="mailto:me@aidenjang.com">me@aidenjang.com</a>
            </p>
            <nav className="resource-navigation" aria-label="Information pages">
              {(["help", "privacy", "terms"] as const).map((item) => (
                <button
                  type="button"
                  key={item}
                  aria-pressed={active === item}
                  onClick={() => {
                    setActive(item);
                    dialog.current?.scrollTo(0, 0);
                  }}
                >
                  {item === "help"
                    ? "How to play"
                    : item === "privacy"
                      ? "Privacy"
                      : "Terms"}
                </button>
              ))}
            </nav>
          </>
        )}
      </dialog>
    </>
  );
}

function ResourceContent({ resource }: { resource: Resource }) {
  if (resource === "privacy")
    return (
      <div className="resource-copy">
        <p>
          No account is required. Your name, avatar, messages, and drawings are
          visible to people in your room. An invite can be opened by anyone who
          has the link.
        </p>
        <h3>What stays in your browser</h3>
        <p>
          We save your name, room code, avatar, sound preference, and lifetime
          game statistics locally. Unsent chat drafts and a reconnect identifier
          are kept for this browser session. Clear this site’s browser data to
          remove them.
        </p>
        <h3>What leaves it</h3>
        <p>
          Live room state is held in server memory and is not a permanent
          archive. In AI guessing modes, drawing snapshots and masked hints may
          be sent to OpenAI, Anthropic, or Cloudflare, depending on the
          configured provider. The secret answer is not sent to the AI guesser.
        </p>
        <p>
          Anonymous product events count game starts, finishes, and AI
          availability issues, along with mode, AI difficulty, and player or
          turn counts. Cloudflare processes connections and operational logs to
          run and protect the service. Drawings you download or share become
          files outside the room.
        </p>
        <p>
          Avoid sharing personal or sensitive information in a public room.
          Contact us with privacy questions or requests.
        </p>
      </div>
    );
  if (resource === "terms")
    return (
      <div className="resource-copy">
        <p>
          iguess is a casual drawing game provided by Aiden Jang. By playing,
          you agree to these rules.
        </p>
        <h3>Be decent company</h3>
        <p>
          Share only content you have permission to use. Don’t harass people,
          share someone else’s private information, post illegal content, or
          disrupt the service. Hosts can remove players from their rooms.
        </p>
        <h3>Your work stays yours</h3>
        <p>
          You keep ownership of what you draw. You allow the service to transmit
          and display it to your room, and process it through the configured AI
          provider when playing an AI guessing mode.
        </p>
        <h3>It’s a game, with limits</h3>
        <p>
          The service is provided as available, without a guarantee of
          uninterrupted play, saved rooms, or accurate AI guesses. Rooms can end
          after a disconnect or restart. Features may change. Nothing here
          limits rights that applicable law gives you.
        </p>
        <p>
          If you disagree with these rules, stop using the service. Contact us
          about abuse or other concerns.
        </p>
      </div>
    );
  return (
    <div className="resource-copy">
      <ol className="help-steps">
        <li>
          <strong>Pick something drawable.</strong>
          <span>
            When it’s your turn, choose a word. Harder words multiply the
            points. Artistic ambition is optional.
          </span>
        </li>
        <li>
          <strong>Draw. No spelling it out.</strong>
          <span>
            Use the pen, eraser, or fill tool. Undo removes your last stroke.
            With the canvas focused, B selects the pen, E the eraser, F the fill
            tool, and Ctrl/⌘ Z undoes. Clear removes the drawing after
            confirmation.
          </span>
        </li>
        <li>
          <strong>Guess in the chat box.</strong>
          <span>
            Correct guesses score points; faster guesses earn more. The drawer
            can’t send hints in chat. Subtle, we know.
          </span>
        </li>
        <li>
          <strong>Keep the evidence.</strong>
          <span>
            At the end, replay drawings or share the gallery. Your reputation is
            a separate matter.
          </span>
        </li>
      </ol>
      <h3>Playing with the machine</h3>
      <p>
        AI Guesser watches your drawing. AI Drawer reveals a curated doodle.
        Team Battle and You vs AI alternate drawing roles. Classic needs at
        least two humans; the other modes support solo play.
      </p>
      <p>
        During a live AI guessing round, type <kbd>?word</kbd> to bet on what
        the AI will guess. The room reports if vision is unavailable or using
        mock guesses.
      </p>
      <h3>Room etiquette</h3>
      <p>
        The host sets the rules and starts the game. Ready is a signal, not a
        start requirement. Refresh and rejoin to recover a dropped connection;
        rooms are temporary, so save drawings you want to keep.
      </p>
    </div>
  );
}
