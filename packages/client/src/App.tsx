import { useEffect, useRef, useState } from "react";
import { useGameSocket } from "./useWebSocket";
import { DrawingCanvas } from "./DrawingCanvas";
import { renderEvidencePng } from "./evidenceCard";

const COLORS = ["#111111", "#e11d48", "#2563eb", "#16a34a", "#f59e0b", "#ffffff"];

// `needsTwo` mirrors each mode's `minHumans` on the server (see packages/game-server/src/modes).
// Classic is the only one that can't run alone, and it is also the default — so someone arriving on
// their own picked the single unplayable option before they had any way to know, then hit "need at
// least 2 players" from inside a room whose mode is already fixed by whoever created it.
const MODES = [
  { value: "classic", label: "Classic", blurb: "you draw, humans guess", icon: "🎨", needsTwo: true },
  { value: "ai", label: "AI Guesser", blurb: "you draw, an AI races to guess it", icon: "🔍", needsTwo: false },
  { value: "ai-drawer", label: "AI Drawer", blurb: "the AI draws, you guess", icon: "🖌️", needsTwo: false },
  { value: "team-battle", label: "Team Battle", blurb: "humans vs AI, first guess wins", icon: "⚔️", needsTwo: false },
  { value: "duel", label: "You vs AI", blurb: "trade turns drawing, most points beats the machine", icon: "🤖", needsTwo: false },
];

const isAI = (id?: string | null) => !!id && id.startsWith("ai-");

// Rotating join-screen taglines — keeps the landing feeling alive.
const TAGLINES = [
  "probably not. draw it anyway, no cap.",
  "your art skills? questionable. your vibes? immaculate.",
  "warning: contains 100% organic chaos 🧪",
  "the AI is judging your circles rn",
  "ms paint energy, olympic confidence",
  "draw bad, win anyway. that's the lore.",
  "it's not deep. it's a doodle. relax.",
  "9 outta 10 dentists can't draw a molar either",
  "your hand: shaking. your aura: unmatched.",
  "the gworls are doodling. casually.",
];

// Funny throwaway handles for the dice button.
const NAME_ADJ = ["sleepy", "feral", "based", "soggy", "spicy", "chaotic", "lowkey", "sus", "gigarad", "unhinged", "moist", "elite"];
const NAME_NOUN = ["goblin", "pigeon", "raccoon", "doodler", "gamer", "wizard", "shrimp", "menace", "legend", "noodle", "gremlin", "duck"];
function randomName(): string {
  const a = NAME_ADJ[Math.floor(Math.random() * NAME_ADJ.length)];
  const n = NAME_NOUN[Math.floor(Math.random() * NAME_NOUN.length)];
  return `${a}_${n}${Math.floor(Math.random() * 90 + 10)}`;
}

// ---- Win streak (localStorage) ----
const STREAK_KEY = "iguess_streak";
function getStreak(): number {
  return Number(localStorage.getItem(STREAK_KEY) || 0) || 0;
}
function bumpStreak(won: boolean): number {
  const next = won ? getStreak() + 1 : 0;
  localStorage.setItem(STREAK_KEY, String(next));
  return next;
}

// ---- Sound FX (WebAudio, no assets) ----
const MUTE_KEY = "iguess_muted";
let audioCtx: AudioContext | null = null;
function blip(freqs: number[], muted: boolean) {
  if (muted) return;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = audioCtx ?? new Ctor();
    const ctx = audioCtx;
    // A context built before the page has been interacted with starts suspended, and nothing here
    // ever woke it: every cue would schedule correctly and play to nobody, for the whole session.
    if (ctx.state === "suspended") void ctx.resume();
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = f;
      // The 20ms offset is not spacing, it's headroom. The audio thread has already rendered up to
      // currentTime by the time this runs, so the i=0 note booked at exactly currentTime lands in
      // the past and the hardware skips what it missed — which eats the attack rather than the
      // whole note, so it reads as "the first beep is quieter" instead of as a bug.
      const t = ctx.currentTime + 0.02 + i * 0.09;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  } catch {
    /* audio not available — no-op */
  }
}

// Export the canvas as a downloadable PNG (white background baked in).
function saveCanvasPng(canvas: HTMLCanvasElement, room: string) {
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const c = out.getContext("2d");
  if (!c) return;
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, out.width, out.height);
  c.drawImage(canvas, 0, 0);
  const a = document.createElement("a");
  a.download = `iguess-${room}-${Date.now()}.png`;
  a.href = out.toDataURL("image/png");
  a.click();
}

/**
 * A small PNG of whatever is on the board right now.
 *
 * Kept deliberately tiny. These accumulate one per turn and live in React state for the length of
 * a game, so a full-size board (which the download button already offers) would be megabytes of
 * data URL sitting in memory to show something rendered 160px wide.
 */
function thumbnailOf(canvas: HTMLCanvasElement): string {
  const out = document.createElement("canvas");
  out.width = 320;
  out.height = Math.round((canvas.height / canvas.width) * 320);
  const c = out.getContext("2d");
  if (!c) return "";
  // White first: the board is transparent, and a transparent PNG on a dark card is an empty box.
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, out.width, out.height);
  c.drawImage(canvas, 0, 0, out.width, out.height);
  // Skip a turn nobody drew on. Otherwise the gallery collects blank white cards, which read as
  // broken images rather than as "the drawer went afk", and there is no joke in an empty rectangle.
  if (isBlank(c, out.width, out.height)) return "";
  return out.toDataURL("image/png");
}

/**
 * Any non-white pixel?
 *
 * Stride of 3 pixels, not 7. At 7 a thin single-stroke drawing could be missed entirely and thrown
 * away as blank, which is worse than the empty card this check exists to prevent: a drawing someone
 * actually made is the whole point of the gallery. 3 still samples a third of a 320px thumbnail,
 * which is nothing, and a real stroke is many pixels wide once it has been downscaled and
 * anti-aliased.
 */
function isBlank(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const { data } = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < data.length; i += 4 * 3) {
    if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) return false;
  }
  return true;
}

// Open a pre-filled X/Twitter compose window — the actual viral loop.
function shareToX(text: string) {
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

// Lightweight emoji confetti — no deps. Renders a burst of falling emoji that
// auto-clears after the animation. Fired on a win.
function Confetti({ go, count = 48 }: { go: boolean; count?: number }) {
  const [pieces, setPieces] = useState<
    { id: number; left: number; delay: number; dur: number; emoji: string }[]
  >([]);
  useEffect(() => {
    if (!go) return;
    const emojis = ["🎉", "🎨", "🐶", "🔥", "💀", "✨", "🏆", "💅", "🤖"];
    const burst = Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      dur: 2.4 + Math.random() * 1.8,
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
    }));
    setPieces(burst);
    const t = setTimeout(() => setPieces([]), 4800);
    return () => clearTimeout(t);
  }, [go, count]);
  if (pieces.length === 0) return null;
  return (
    <>
      {pieces.map((p) => (
        <span
          key={p.id}
          aria-hidden
          className="confetti-piece"
          style={{
            left: `${p.left}vw`,
            animation: `confettiFall ${p.dur}s linear ${p.delay}s forwards`,
          }}
        >
          {p.emoji}
        </span>
      ))}
    </>
  );
}

const REACTIONS = ["😂", "🔥", "💀", "👏", "😭", "🐶"];

// Randomized end-of-game stings so the payoff hits different every time.
const WIN_LINES = [
  "🏆 you ate that up",
  "🏆 no crumbs left. devoured.",
  "🏆 first place, zero notes",
  "🏆 certified W, frame it",
];
const LOSS_LINES = [
  "💀 it's giving L… run it back",
  "💀 not the algorithm cooking you",
  "💀 took an L with full chest, respect",
  "💀 we move. silently. run it back",
];
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

// Animated "…" — three bouncing dots for live status text.
function Dots() {
  return (
    <span aria-hidden>
      <span className="dot">.</span>
      <span className="dot">.</span>
      <span className="dot">.</span>
    </span>
  );
}

// Copy text to the clipboard with a graceful fallback for older/insecure
// contexts (clipboard API needs https or localhost).
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

// Build a shareable deep link that drops a friend straight into this room +
// mode. Name is left out so they pick their own.
function inviteLink(room: string, mode: string): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  const q = new URLSearchParams({ room, mode });
  return `${base}#${q.toString()}`;
}

// Read room/mode/name from the URL hash so an invite link pre-fills the gate.
function readInvite(): { room?: string; mode?: string; name?: string } {
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) return {};
  const q = new URLSearchParams(raw);
  return {
    room: q.get("room") ?? undefined,
    mode: q.get("mode") ?? undefined,
    name: q.get("name") ?? undefined,
  };
}

function widthDot(w: number, c: string, on: boolean): React.CSSProperties {
  return {
    width: Math.max(6, Math.min(28, w)),
    height: Math.max(6, Math.min(28, w)),
    borderRadius: "50%",
    background: c === "#ffffff" ? "#ffffff" : c,
    border: c === "#ffffff" ? "1px solid #44495a" : "none",
    opacity: on ? 1 : 0.35,
    flexShrink: 0,
  };
}

export function App() {
  // An invite link (#room=…&mode=…) pre-fills the gate so a friend lands in the
  // same room + mode and only has to type a name.
  const invite = readInvite();
  const invited = !!invite.room;
  // Returning players skip the typing: remember the last name/room locally.
  const [draftName, setDraftName] = useState(
    invite.name ?? localStorage.getItem("iguess_name") ?? ""
  );
  const [draftRoom, setDraftRoom] = useState(
    invite.room ?? localStorage.getItem("iguess_room") ?? "lobby"
  );
  const [draftMode, setDraftMode] = useState(invite.mode ?? "classic");
  const [joined, setJoined] = useState<{
    name: string;
    room: string;
    mode: string;
  } | null>(null);

  // Cycle taglines while sitting on the join screen.
  const [tagIdx, setTagIdx] = useState(() => Math.floor(Math.random() * TAGLINES.length));
  useEffect(() => {
    if (joined) return;
    const t = setInterval(() => setTagIdx((i) => (i + 1) % TAGLINES.length), 3200);
    return () => clearInterval(t);
  }, [joined]);

  const doJoin = () => {
    const name = draftName.trim();
    if (!name) return;
    const room = draftRoom.trim() || "lobby";
    localStorage.setItem("iguess_name", name);
    localStorage.setItem("iguess_room", room);
    // Reflect the room in the URL so the address bar (and a copy-paste) points at THIS room, not the
    // bare origin. Matches the invite-link format, so a reload lands on the same room's join screen.
    const q = new URLSearchParams({ room, mode: draftMode });
    window.history.pushState(null, "", `#${q.toString()}`);
    setJoined({ name, room, mode: draftMode });
  };

  // Leave the room back to the join screen. Also strip any invite hash so a refresh doesn't drop
  // you straight back in (setJoined(null) tears down the WebSocket via the effect that owns it).
  const leaveRoom = () => {
    setJoined(null);
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  };

  if (!joined) {
    return (
      <div style={styles.gate}>
        <div className="glass pop-in" style={styles.card}>
          <div style={styles.brand}>
            <span style={styles.brandMark}>✏️</span>
            <div>
              <h1 className="grad-anim" style={styles.title}>iguess</h1>
              <p key={tagIdx} className="pop-in" style={styles.subtitle}>
                {TAGLINES[tagIdx]}
              </p>
            </div>
          </div>

          {getStreak() > 0 && (
            <div style={styles.streakBadge}>
              🔥 {getStreak()}-win streak, don't choke
            </div>
          )}

          {invited && (
            <div style={styles.inviteRibbon}>
              🎉 you got the invite to <strong>#{draftRoom}</strong>, drop a name
              and pull up
            </div>
          )}

          <label style={styles.fieldLabel}>Your name</label>
          <div style={styles.nameRow}>
            <input
              placeholder="whatever you want, really"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doJoin()}
              style={{ ...styles.input, flex: 1 }}
              autoFocus
            />
            <button
              type="button"
              className="lift wiggle"
              style={styles.diceButton}
              title="gimme a random name"
              aria-label="random name"
              onClick={() => setDraftName(randomName())}
            >
              🎲
            </button>
          </div>

          <label style={styles.fieldLabel}>Room</label>
          <input
            placeholder="lobby"
            value={draftRoom}
            onChange={(e) => setDraftRoom(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doJoin()}
            style={styles.input}
          />

          <label style={styles.fieldLabel}>Game mode</label>
          <div style={styles.modeGrid}>
            {MODES.map((m) => {
              const active = m.value === draftMode;
              return (
                <button
                  key={m.value}
                  className="lift"
                  onClick={() => setDraftMode(m.value)}
                  style={{
                    ...styles.modeCard,
                    ...(active ? styles.modeCardActive : null),
                  }}
                >
                  <span style={styles.modeIcon}>{m.icon}</span>
                  <span style={styles.modeLabel}>{m.label}</span>
                  <span style={styles.modeBlurb}>{m.blurb}</span>
                  <span style={styles.modeNeeds}>{m.needsTwo ? "needs a friend" : "no friends needed"}</span>
                </button>
              );
            })}
          </div>
          <small style={styles.hint}>
            first one in the room picks the mode. snooze, lose, etc.
          </small>

          <div style={styles.howto}>
            <span style={styles.howtoTitle}>how it works</span>
            <ol style={styles.howtoList}>
              <li>one person draws a secret word</li>
              <li>everyone else (and the AI) races to guess it in chat</li>
              <li>the faster you guess, the more points. most points wins</li>
            </ol>
          </div>

          <button
            className={draftName.trim() ? "lift pulse-cta" : undefined}
            style={{
              ...styles.button,
              ...styles.buttonBig,
              ...(draftName.trim() ? null : styles.buttonDisabled),
            }}
            disabled={!draftName.trim()}
            onClick={doJoin}
          >
pull up →
          </button>
        </div>
        <p style={styles.privacyNote}>
          no account, no sign-in. we only hold the live game room while you play, and analytics are
          cookieless, so there's nothing personal to collect.
        </p>
        <p style={styles.credit}>
          made by{" "}
          <a href="https://aidenjang.com" target="_blank" rel="noopener" style={styles.creditLink}>
            aiden jang
          </a>
        </p>
      </div>
    );
  }

  return <Room name={joined.name} room={joined.room} mode={joined.mode} onLeave={leaveRoom} />;
}

// Server turn length — mirrors TURN_MS in engine.ts. Only used to size the
// draining progress bar; the authoritative deadline is still turnEndsAt.
const TURN_MS = 60_000;

function Countdown({ endsAt }: { endsAt: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 120);
    return () => clearInterval(id);
  }, [endsAt]);
  if (!endsAt) return null;
  const msLeft = Math.max(0, endsAt - now);
  const secs = Math.ceil(msLeft / 1000);
  const frac = Math.max(0, Math.min(1, msLeft / TURN_MS));
  const low = secs <= 10;
  return (
    <span style={styles.timerWrap}>
      <span style={styles.timerBarTrack}>
        <span
          style={{
            ...styles.timerBarFill,
            width: `${frac * 100}%`,
            background: low ? "var(--bad)" : "var(--grad)",
          }}
        />
      </span>
      <span style={{ ...styles.timer, ...(low ? styles.timerLow : null) }}>
        ⏱ {secs}s
      </span>
    </span>
  );
}

function Room({ name, room, mode, onLeave }: { name: string; room: string; mode: string; onLeave: () => void }) {
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
    turnEnd,
    chooseWord,
  } = useGameSocket(room, name, mode);
  // Show the room's real mode once the server confirms it; the requested mode is just the
  // placeholder shown for the split second before `welcome` arrives.
  const effectiveMode = serverMode ?? mode;
  // Every non-classic mode has a built-in AI opponent, so a lone player can start right away.
  const isAIMode = effectiveMode !== "classic";

  // Track whether we've ever connected, so a mid-game drop shows a banner but the initial
  // handshake doesn't flash one. The sidebar pill can be off-screen on mobile; this is always visible.
  const [everConnected, setEverConnected] = useState(false);
  useEffect(() => {
    if (connected) setEverConnected(true);
  }, [connected]);
  // On mobile the layout stacks (canvas, chat, sidebar), and the gate's autofocused name input can
  // leave the page scrolled. Land at the top on entry so the banner and its "send it" button are
  // the first thing you see, not a blank canvas. No-op on desktop (the grid is a fixed 100vh).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  const [text, setText] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(4);
  // Chat auto-scroll: follow the newest message while pinned to the bottom; if the user has scrolled
  // up to read history, stop following and surface a "new messages" button instead of yanking them down.
  const chatLogRef = useRef<HTMLDivElement>(null);
  const followChatRef = useRef(true);
  const [hasNewChat, setHasNewChat] = useState(false);
  const scrollChatToBottom = () => {
    const el = chatLogRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    followChatRef.current = true;
    setHasNewChat(false);
  };
  const onChatScroll = () => {
    const el = chatLogRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    followChatRef.current = nearBottom;
    if (nearBottom) setHasNewChat(false);
  };
  useEffect(() => {
    if (followChatRef.current) {
      const el = chatLogRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    } else {
      setHasNewChat(true);
    }
  }, [log.length]);
  const [copied, setCopied] = useState(false);
  const [flexed, setFlexed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [muted, setMuted] = useState(() => localStorage.getItem(MUTE_KEY) === "1");
  const [burstKey, setBurstKey] = useState(0);
  // The bot's most recent REAL guess, shown briefly in the canvas bubble then cleared to a
  // "thinking" state. Driven by actual AI chat, not a canned-line timer.
  const [botGuess, setBotGuess] = useState<string | null>(null);
  const aiMsgCount = useRef(0);
  const [winConfetti, setWinConfetti] = useState(48);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);

  /*
   * Every drawing from this game, kept so the end screen can show them back.
   *
   * The funniest thing this app produces is the drawings, and until now every one of them was
   * wiped the instant the turn ended. The score was already shareable as text; the actual artifact
   * was thrown away. Client-side only: nobody else needs a copy, and a gallery that outlived the
   * game would be an account feature in an app that deliberately has no accounts.
   */
  const [savingEvidence, setSavingEvidence] = useState(false);
  const [gallery, setGallery] = useState<{ word: string; png: string; guess: string | null; right: boolean }[]>([]);
  /*
   * The AI's last guess, held past the moment it's cleared from the canvas bubble.
   *
   * `botGuess` is deliberately transient: it flashes in the bubble and resets to "thinking", so by
   * the time the turn ends it is usually already null. The gallery needs whatever it said *last*,
   * which is the actual punchline: you drew a cactus, the machine said broccoli.
   */
  const lastGuess = useRef<{ guess: string | null; right: boolean }>({ guess: null, right: false });
  const prevGuessed = useRef<string[]>([]);

  const phase = game?.phase ?? "lobby";
  const isDrawer = !!game && game.drawerId === you?.id;
  const canDraw = phase === "playing" && isDrawer;
  const inGame = phase === "playing" || phase === "intermission";

  // Why the canvas is inert right now, so a disabled board never just reads as "broken".
  const drawDisabledReason: string | null = canDraw
    ? null
    : phase === "lobby"
      ? "hit “send it” to start a round"
      : phase === "ended"
        ? "round over — run it back"
        : phase === "choosing"
          ? isDrawer
            ? "pick a word to start drawing ☝️"
            : `${playerName(players, game?.drawerId ?? "")} is picking a word`
          : isAI(game?.drawerId)
            ? "🤖 the AI is cooking"
            : `${playerName(players, game?.drawerId ?? "")} is cooking 👨‍🍳`;

  // Live tab title — nudges people back to the tab when it's their turn.
  useEffect(() => {
    document.title = canDraw
      ? "✏️ YOUR TURN · iguess"
      : inGame
      ? "🎨 playing · iguess"
      : "iguess ✏️";
    return () => {
      document.title = "iguess ✏️";
    };
  }, [canDraw, inGame]);

  // Pop a transient toast the moment it becomes your turn to draw.
  useEffect(() => {
    if (canDraw) {
      setToast("🎨 you're up, cook!");
      blip([523, 784], muted); // little "ping!"
      const t = setTimeout(() => setToast(null), 2600);
      return () => clearTimeout(t);
    }
  }, [canDraw]);

  // Celebrate correct guesses: a tick for anyone, a full burst + sting + toast
  // when it's YOU who just nailed it.
  useEffect(() => {
    const cur = game?.guessedIds ?? [];
    const prev = prevGuessed.current;
    const fresh = cur.filter((id) => !prev.includes(id));
    prevGuessed.current = cur;
    if (fresh.length === 0) return;
    if (you && fresh.includes(you.id)) {
      setBurstKey((k) => k + 1);
      blip([659, 880, 1175], muted);
      setToast("✅ nailed it! big brain 🧠");
      const t = setTimeout(() => setToast(null), 2400);
      return () => clearTimeout(t);
    } else {
      blip([880], muted); // someone else got it
    }
  }, [game?.guessedIds]);

  // Grab the board the moment the word is revealed, before the next turn clears it.
  useEffect(() => {
    if (!turnEnd) return;
    const el = canvasElRef.current;
    if (!el) return;
    const png = thumbnailOf(el);
    if (!png) return;
    const { guess, right } = lastGuess.current;
    setGallery((g) => [...g, { word: turnEnd.word, png, guess, right }]);
    lastGuess.current = { guess: null, right: false };
  }, [turnEnd?.at]);

  // A new game starts a new gallery. Keyed on the turn index returning to zero rather than on the
  // phase, because "run it back" goes ended → playing without passing through the lobby.
  useEffect(() => {
    if (phase === "lobby" || game?.turnIndex === 0) setGallery([]);
  }, [phase, game?.turnIndex]);

  // On game end: figure out if you won, update the streak, and play a sting.
  useEffect(() => {
    if (phase !== "ended") return;
    const won = ranked.length > 0 && ranked[0].id === you?.id;
    const streak = bumpStreak(won);
    if (won) {
      setWinConfetti(Math.min(48 + streak * 16, 160)); // bigger party per streak
      blip([523, 659, 784, 1047], muted); // ascending fanfare
      setToast(streak > 1 ? `🏆 dub! ${streak} in a row 🔥` : pick(WIN_LINES));
    } else {
      setWinConfetti(48);
      blip([330, 247], muted); // sad trombone-ish
      setToast(pick(LOSS_LINES));
    }
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [phase]);

  // Word line: the drawer sees the real word; guessers see one tile per
  // letter, with letters filling in as the server reveals hints over the turn
  // ("_" → blank tile). Falls back to wordLength tiles before any hint lands.
  const wordLetters = isDrawer
    ? (myWord ?? "").split("")
    : game?.hint
      ? game.hint.split("").map((ch) => (ch === "_" ? "" : ch))
      : Array.from({ length: game?.wordLength ?? 0 }, () => "");

  // Players sorted by score for the scoreboard.
  const ranked = [...players].sort(
    (a, b) => (game?.scores[b.id] ?? 0) - (game?.scores[a.id] ?? 0)
  );

  const modeMeta = MODES.find((m) => m.value === effectiveMode);
  const hasAI = players.some((p) => isAI(p.id));
  const aiGuessedRight = hasAI && (game?.guessedIds ?? []).some((id) => isAI(id));
  // When it actually gets there, that is the fact worth keeping, not its last wrong stab.
  if (aiGuessedRight) lastGuess.current = { ...lastGuess.current, right: true };
  // Nobody to guess: it's just you, no AI in the room. Nudge toward inviting or an AI mode.
  const soloWaiting = !hasAI && players.filter((p) => !isAI(p.id)).length <= 1;

  // Surface the bot's REAL guesses in the canvas bubble (the whole hook) — briefly, then fall back
  // to a "thinking" state — instead of random canned lines that ignore what's on the canvas.
  useEffect(() => {
    const aiMsgs = log.filter((l) => isAI(l.from?.id));
    if (aiMsgs.length <= aiMsgCount.current) return;
    aiMsgCount.current = aiMsgs.length;
    const latest = aiMsgs[aiMsgs.length - 1]?.text ?? null;
    setBotGuess(latest);
    // Remembered separately from the bubble, which clears itself after four seconds.
    if (latest) lastGuess.current = { guess: latest, right: false };
    const t = setTimeout(() => setBotGuess(null), 4200);
    return () => clearTimeout(t);
  }, [log]);

  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      localStorage.setItem(MUTE_KEY, next ? "1" : "0");
      if (!next) blip([659], false); // little confirmation chirp when unmuting
      return next;
    });
  };

  const handleInvite = async () => {
    const ok = await copyText(inviteLink(room, effectiveMode));
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  // Wordle-style flex text: a copy-pasteable recap of how you stacked up. This
  // is the share loop — text + a link is what actually spreads.
  /**
   * One PNG of the whole game: every drawing, its word, and what the AI thought it was.
   *
   * The text share (a block grid of scores) travels anywhere but shares the least interesting part.
   * This shares the part people actually laugh at. Best-effort: a failure leaves the strip on screen
   * and says nothing, because the game is over and there is nothing to recover.
   */
  const saveEvidence = async () => {
    if (savingEvidence || gallery.length === 0) return;
    setSavingEvidence(true);
    try {
      const line = ranked
        .slice(0, 4)
        .map((p) => `${p.id === you?.id ? "you" : isAI(p.id) ? "🤖" : p.name} ${game?.scores[p.id] ?? 0}`)
        .join("  ·  ");
      const blob = await renderEvidencePng(gallery, line);
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.download = `iguess-evidence-${room}.png`;
      a.href = href;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch {
      /* nothing to do about it, and nothing worth interrupting the end screen for */
    } finally {
      setSavingEvidence(false);
    }
  };

  const flexText = () => {
    const place = you ? ranked.findIndex((p) => p.id === you.id) + 1 : 0;
    const beatAI =
      ranked.some((p) => isAI(p.id)) &&
      you != null &&
      (game?.scores[you.id] ?? 0) >
        Math.max(...ranked.filter((p) => isAI(p.id)).map((p) => game?.scores[p.id] ?? 0));
    const streak = getStreak();

    // Wordle-style visual grid: each player is a row of blocks sized to their
    // score (fixed-width emoji, so it stays aligned when pasted anywhere).
    // 🟪 = you, 🤖 = the bot, ⬜ = everyone else. This is the shareable hook.
    const top = Math.max(1, ...ranked.map((p) => game?.scores[p.id] ?? 0));
    const medals = ["🥇", "🥈", "🥉"];
    const rows = ranked.slice(0, 4).map((p, i) => {
      const score = game?.scores[p.id] ?? 0;
      const filled = Math.max(1, Math.round((score / top) * 8));
      const block = p.id === you?.id ? "🟪" : isAI(p.id) ? "🤖" : "⬜";
      return `${medals[i] ?? "▪️"} ${block.repeat(filled)} ${score}`;
    });

    const brags = [
      beatAI ? "cooked the AI too 🤖💥 no cap" : null,
      streak > 1 ? `🔥 ${streak}-win streak` : null,
    ].filter(Boolean);

    return [
      `iguess ✏️ · ${modeMeta?.label ?? effectiveMode}`,
      `i came #${place || "?"}/${ranked.length} and that's on periodt`,
      "",
      ...rows,
      ...(brags.length ? ["", ...brags] : []),
      "",
      `pull up: ${inviteLink(room, effectiveMode)}`,
    ].join("\n");
  };

  const handleFlex = async () => {
    const ok = await copyText(flexText());
    if (ok) {
      setFlexed(true);
      setTimeout(() => setFlexed(false), 1800);
    }
  };

  // A terminal rejection (e.g. the room is full): dead-end card, not the game. The socket won't
  // reconnect, so there's nothing to render but the reason and a way back to the gate.
  if (fatal) {
    return (
      <div style={styles.gate}>
        <div className="glass pop-in" style={styles.card}>
          <div style={styles.brand}>
            <span style={{ fontSize: 40 }}>🚪</span>
            <div style={{ fontWeight: 800, fontSize: 24 }}>room's packed</div>
          </div>
          <p style={{ color: "#c9cde0", lineHeight: 1.5, margin: "0 0 20px" }}>{fatal}</p>
          <button className="lift" style={{ ...styles.button, ...styles.buttonBig }} onClick={onLeave}>
            back to the lobby
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout" style={styles.layout}>
      <Confetti go={phase === "ended"} count={winConfetti} />
      {burstKey > 0 && <Confetti key={burstKey} go count={28} />}
      {toast && (
        <div
          className="toast-in"
          role="status"
          aria-live="polite"
          style={styles.toast}
          onClick={() => setToast(null)}
          title="tap to dismiss"
        >
          {toast}
        </div>
      )}
      {everConnected && !connected && (
        <div role="alert" style={styles.reconnectBanner}>
          ⚠ connection dropped. reconnecting<Dots />
        </div>
      )}
      {/* ---- Sidebar: roster + scores ---- */}
      <aside className="glass" style={styles.sidebar}>
        <div style={styles.roomHead}>
          <span style={styles.roomMark}>✏️</span>
          <div style={{ minWidth: 0 }}>
            <div className="grad-anim" style={styles.roomName}>#{room}</div>
            <div style={styles.roomMode}>
              {modeMeta?.icon} {modeMeta?.label ?? effectiveMode}
            </div>
          </div>
        </div>

        <div
          style={{
            ...styles.statusPill,
            ...(connected ? styles.statusOk : styles.statusBad),
          }}
        >
          <span style={styles.statusDot} />{" "}
          {connected ? "we're so back" : everConnected ? "hang on…" : "connecting…"}
        </div>

        <button
          className="lift"
          style={{ ...styles.inviteButton, ...(copied ? styles.inviteButtonOk : null) }}
          onClick={handleInvite}
        >
          {copied ? "✅ copied, go spam it" : "🔗 invite the squad"}
        </button>

        <button className="lift" style={styles.muteButton} onClick={toggleMute}>
          {muted ? "🔇 sound off" : "🔊 sound on"}
        </button>

        <button className="lift" style={styles.leaveButton} onClick={onLeave}>
          ← leave room
        </button>

        <div style={styles.sectionLabel}>Scoreboard</div>
        <ul style={styles.scoreList}>
          {ranked.map((p, i) => {
            const me = p.id === you?.id;
            const drawer = game?.drawerId === p.id;
            const guessed = game?.guessedIds.includes(p.id);
            return (
              <li
                key={p.id}
                style={{
                  ...styles.scoreRow,
                  ...(me ? styles.scoreRowMe : null),
                  ...(drawer ? styles.scoreRowDrawer : null),
                }}
              >
                <span style={styles.rank}>{i + 1}</span>
                <span style={styles.playerName}>
                  {isAI(p.id) ? <span style={styles.aiBadge}>AI</span> : null}
                  <span style={styles.nameText}>{p.name}</span>
                  {me ? <span style={styles.youTag}>you</span> : null}
                  {drawer ? <span title="drawing">✏️</span> : null}
                  {guessed ? <span title="guessed">✅</span> : null}
                </span>
                <strong style={styles.scoreNum}>{game?.scores[p.id] ?? 0}</strong>
              </li>
            );
          })}
          {ranked.length === 0 && (
            <li style={styles.emptyRoster}>nobody here but us 🦗</li>
          )}
        </ul>
      </aside>

      {/* ---- Canvas pane ---- */}
      <section className="pane-canvas" style={styles.canvasPane}>
        <div className="glass play-banner" style={styles.banner}>
          {phase === "lobby" && (
            <>
              <span style={styles.bannerText}>
                {!soloWaiting
                  ? `lowkey waiting · ${players.length} pulled up`
                  : isAIMode
                    ? "it's you vs the 🤖 AI. hit send it whenever you're ready."
                    : "just you so far. classic needs someone to guess, so hit 🔗 invite the squad."}
              </span>
              <button className="lift pulse-cta" style={{ ...styles.button, marginLeft: "auto" }} onClick={startGame}>
                send it
              </button>
            </>
          )}
          {phase === "ended" && (
            <>
              <span className="pop-in" style={styles.bannerText}>🏁 and that's on periodt</span>
              <button
                className="lift"
                style={{ ...styles.ghostButton, marginLeft: "auto" }}
                onClick={handleFlex}
              >
                {flexed ? "✅ copied, go flex" : "📋 copy dub"}
              </button>
              <button
                className="lift"
                style={styles.xButton}
                onClick={() => shareToX(flexText())}
              >
                𝕏 post it
              </button>
              <button className="lift pulse-cta" style={styles.button} onClick={startGame}>
                run it back
              </button>
            </>
          )}
          {phase === "choosing" && (
            <>
              <span style={styles.turnPill}>
                {(game?.totalRounds ?? 1) > 1
                  ? `Round ${game?.round ?? 1}/${game?.totalRounds ?? 1}`
                  : "Choosing"}
              </span>
              {isDrawer && wordChoices ? (
                <span style={styles.wordZone}>
                  <span style={styles.wordVerb}>pick one</span>
                  <span className="word-tiles" style={styles.tiles}>
                    {wordChoices.map((w) => (
                      <button
                        key={w}
                        className="lift"
                        style={styles.button}
                        onClick={() => chooseWord(w)}
                      >
                        {w}
                      </button>
                    ))}
                  </span>
                </span>
              ) : (
                <span style={styles.wordZone}>
                  <span style={styles.wordVerb}>
                    {(game?.drawerId ? playerName(players, game.drawerId) : "someone")} is
                    picking a word…
                  </span>
                </span>
              )}
            </>
          )}
          {inGame && (
            <>
              <span style={styles.turnPill}>
                {(game?.totalRounds ?? 1) > 1
                  ? `Round ${game?.round ?? 1}/${game?.totalRounds ?? 1} · Turn ${(game?.turnIndex ?? 0) + 1}/${game?.totalTurns ?? 0}`
                  : `Turn ${(game?.turnIndex ?? 0) + 1}/${game?.totalTurns ?? 0}`}
              </span>
              <span style={styles.wordZone}>
                <span style={styles.wordVerb}>{isDrawer ? "cook this" : "guess fr"}</span>
                <span className="word-tiles" style={styles.tiles}>
                  {wordLetters.map((ch, i) => (
                    <span key={i} style={styles.tile}>
                      {ch}
                    </span>
                  ))}
                </span>
              </span>
              <Countdown endsAt={game?.turnEndsAt ?? null} />
            </>
          )}
        </div>

        <div className="glass draw-toolbar" style={styles.toolbar}>
          {COLORS.map((c) => (
            <button
              key={c}
              disabled={!canDraw}
              onClick={() => setColor(c)}
              style={{
                ...styles.swatch,
                background: c,
                cursor: canDraw ? "pointer" : "default",
                opacity: canDraw ? 1 : 0.35,
                boxShadow:
                  c === color ? "0 0 0 2px var(--panel), 0 0 0 4px var(--accent)" : "none",
                border: c === "#ffffff" ? "1px solid #44495a" : "none",
              }}
              aria-label={`color ${c}`}
            />
          ))}
          <div style={styles.toolDivider} />
          <input
            type="range"
            min={1}
            max={32}
            value={width}
            disabled={!canDraw}
            aria-label="brush size"
            onChange={(e) => setWidth(Number(e.target.value))}
            style={{ accentColor: "var(--accent)" }}
          />
          <span style={widthDot(width, color, canDraw)} />
          <button
            className="lift"
            style={{
              ...styles.ghostButton,
              ...(color === "#ffffff" ? { boxShadow: "0 0 0 2px var(--accent)" } : {}),
            }}
            onClick={() => setColor("#ffffff")}
            disabled={!canDraw}
            aria-pressed={color === "#ffffff"}
            title="eraser (paints white)"
          >
            ⌫ erase
          </button>
          <button
            className="lift"
            style={{ ...styles.ghostButton, marginLeft: "auto" }}
            onClick={() => sendDraw({ kind: "undo" })}
            disabled={!canDraw}
            title="undo the last stroke"
          >
            ↶ undo
          </button>
          <button
            className="lift"
            style={styles.ghostButton}
            onClick={() => canvasElRef.current && saveCanvasPng(canvasElRef.current, room)}
            title="save the masterpiece"
          >
            🖼️ save
          </button>
          <button
            className="lift"
            style={styles.ghostButton}
            onClick={clearBoard}
            disabled={!canDraw}
          >
            Clear
          </button>
        </div>

        <div className="canvas-wrap" style={styles.canvasWrap}>
          <DrawingCanvas
            sendDraw={sendDraw}
            subscribeDraw={subscribeDraw}
            color={color}
            width={width}
            canDraw={canDraw}
            onCanvas={(el) => (canvasElRef.current = el)}
          />
          {drawDisabledReason && (
            <div style={styles.canvasHintBadge}>
              {drawDisabledReason}
              {inGame && <Dots />}
            </div>
          )}
          {hasAI && inGame && !isAI(game?.drawerId) && (
            <div
              key={aiGuessedRight ? "win" : (botGuess ?? "thinking")}
              className="pop-in"
              style={styles.hotTake}
            >
              {aiGuessedRight ? (
                "🤖 nailed it! 🎉"
              ) : botGuess ? (
                <>🤖 "{botGuess}"</>
              ) : (
                <>🤖 thinking<Dots /></>
              )}
            </div>
          )}
        </div>

        {/*
          The gallery. Only at the end, and only if anything was drawn.

          Placed under the board rather than in the banner because it is the thing worth looking
          at when the game is over: the score is two numbers, but nobody has seen these drawings
          side by side before, and the joke is cumulative.
        */}
        {phase === "ended" && gallery.length > 0 && (
          <div style={styles.gallery}>
            <div style={styles.galleryHead}>
              <span style={styles.sectionLabel}>the evidence</span>
              <button
                className="lift"
                style={styles.ghostButton}
                onClick={() => void saveEvidence()}
                title="one image of every drawing and what the AI thought it was"
              >
                {savingEvidence ? "rendering…" : "🖼️ save the evidence"}
              </button>
            </div>
            <div style={styles.galleryStrip}>
              {gallery.map((g, i) => (
                <figure key={i} style={styles.galleryItem}>
                  <img src={g.png} alt={`the drawing for "${g.word}"`} style={styles.galleryImg} />
                  <figcaption style={styles.galleryCaption}>{g.word}</figcaption>
                  {/*
                    What the machine thought it was.
                    This is the actual joke of the whole app and it was being thrown away every
                    turn: the drawing alone is just a bad drawing, but "cactus / 🤖 broccoli" is the
                    thing you screenshot. A correct guess gets said plainly rather than quoted,
                    because being right is not funny and pretending it is would be smug.
                  */}
                  {g.right ? (
                    <p style={{ ...styles.galleryGuess, color: "#a3e635" }}>🤖 got it</p>
                  ) : g.guess ? (
                    <p style={styles.galleryGuess}>🤖 &ldquo;{g.guess}&rdquo;</p>
                  ) : (
                    <p style={{ ...styles.galleryGuess, opacity: 0.45 }}>🤖 no idea</p>
                  )}
                </figure>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ---- Chat ---- */}
      <main className="glass" style={styles.main}>
        <div style={styles.sectionLabel}>the group chat</div>
        <div style={styles.chatWrap}>
          <div
            ref={chatLogRef}
            onScroll={onChatScroll}
            style={styles.chatLog}
            role="log"
            aria-live="polite"
            aria-label="game chat and guesses"
          >
          {log.map((line, i) =>
            line.kind === "system" ? (
              <div key={i} style={styles.system}>
                {line.text}
              </div>
            ) : (
              <div key={i} style={styles.chatLine}>
                <span
                  style={{
                    ...styles.chatFrom,
                    ...(isAI(line.from?.id) ? styles.chatFromAI : null),
                  }}
                >
                  {isAI(line.from?.id) ? "🤖 " : ""}
                  {line.from?.name}
                </span>
                <span style={styles.chatText}>{line.text}</span>
              </div>
            )
          )}
          {log.length === 0 && <div style={styles.system}>crickets… break the ice bestie 👀</div>}
          </div>
          {hasNewChat && (
            <button
              type="button"
              className="lift"
              style={styles.newMsgBtn}
              onClick={scrollChatToBottom}
            >
              ↓ new messages
            </button>
          )}
        </div>
        <div style={styles.reactRow}>
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="lift"
              style={styles.reactBtn}
              onClick={() => sendChat(emoji)}
              disabled={canDraw}
              title={`react ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
        <form
          style={styles.inputRow}
          onSubmit={(e) => {
            e.preventDefault();
            const t = text.trim();
            if (t) {
              sendChat(t);
              setText("");
            }
          }}
        >
          <input
            style={{ ...styles.input, flex: 1, margin: 0 }}
            placeholder={
              canDraw
                ? "eyes on the canvas, picasso ✋"
                : inGame
                ? "guess it bestie…"
                : "say something fr"
            }
            disabled={canDraw}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="lift" style={styles.button} type="submit" disabled={canDraw}>
            Send
          </button>
        </form>
      </main>
    </div>
  );
}

function playerName(players: { id: string; name: string }[], id: string) {
  return players.find((p) => p.id === id)?.name ?? "Someone";
}

const styles: Record<string, React.CSSProperties> = {
  // ---- Join gate ----
  gate: {
    minHeight: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 24,
  },
  privacyNote: {
    maxWidth: 440,
    margin: 0,
    textAlign: "center",
    fontSize: 12,
    lineHeight: 1.5,
    color: "var(--muted)",
  },
  credit: {
    margin: "10px 0 0",
    textAlign: "center",
    fontSize: 12,
    color: "var(--muted)",
  },
  creditLink: {
    color: "var(--text)",
    textDecoration: "underline",
    textUnderlineOffset: "2px",
  },
  card: {
    width: "100%",
    maxWidth: 440,
    border: "1px solid var(--line)",
    borderRadius: 20,
    padding: 28,
    boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
  },
  brand: { display: "flex", alignItems: "center", gap: 14, marginBottom: 22 },
  brandMark: {
    fontSize: 42,
    lineHeight: 1,
    filter: "drop-shadow(0 4px 14px rgba(168,85,247,0.6))",
    animation: "floaty 3.5s ease-in-out infinite",
  },
  title: {
    margin: 0,
    fontFamily: "'Fredoka', sans-serif",
    fontSize: 32,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    background: "var(--grad)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  subtitle: { margin: "2px 0 0", color: "var(--muted)", fontSize: 13 },
  fieldLabel: {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--muted)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    margin: "14px 0 6px",
  },
  modeGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  modeCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 2,
    padding: "12px 14px",
    borderRadius: 12,
    // Longhand (not the `border` shorthand) so modeCardActive can override borderColor alone without
    // React warning about mixing shorthand + longhand for the same property across re-renders.
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--line)",
    background: "var(--panel-2)",
    color: "var(--text)",
    cursor: "pointer",
    textAlign: "left",
    transition: "all .12s ease",
  },
  modeCardActive: {
    borderColor: "var(--accent)",
    background: "linear-gradient(180deg, rgba(99,102,241,0.18), rgba(99,102,241,0.06))",
    boxShadow: "0 0 0 1px var(--accent)",
  },
  modeIcon: { fontSize: 20 },
  modeLabel: { fontWeight: 600, fontSize: 14 },
  modeBlurb: { fontSize: 11, color: "var(--muted)" },
  modeNeeds: {
    fontSize: 10,
    marginTop: 6,
    letterSpacing: "0.04em",
    textTransform: "uppercase" as const,
    color: "var(--muted)",
    opacity: 0.75,
  },
  hint: { display: "block", color: "var(--muted)", fontSize: 12, margin: "12px 0 4px" },
  howto: {
    margin: "16px 0 4px",
    padding: "12px 14px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  howtoTitle: {
    display: "block",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--muted)",
    marginBottom: 6,
  },
  howtoList: {
    margin: 0,
    paddingLeft: 18,
    display: "grid",
    gap: 4,
    fontSize: 13,
    color: "var(--text)",
    lineHeight: 1.4,
  },
  inviteRibbon: {
    margin: "16px 0 4px",
    padding: "10px 12px",
    borderRadius: 12,
    fontSize: 13,
    background: "linear-gradient(180deg, rgba(99,102,241,0.18), rgba(99,102,241,0.06))",
    border: "1px solid var(--accent)",
    color: "var(--text)",
  },
  inviteButton: {
    width: "100%",
    padding: "9px 12px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    borderRadius: 10,
    border: "1px dashed var(--accent)",
    background: "rgba(99,102,241,0.08)",
    color: "var(--accent-2)",
    transition: "all .12s ease",
  },
  inviteButtonOk: {
    border: "1px solid var(--good)",
    background: "rgba(34,197,94,0.12)",
    color: "#4ade80",
  },
  streakBadge: {
    margin: "16px 0 0",
    padding: "8px 12px",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 600,
    background: "rgba(251,146,60,0.14)",
    border: "1px solid rgba(251,146,60,0.5)",
    color: "#fdba74",
  },
  muteButton: {
    width: "100%",
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    borderRadius: 10,
    border: "1px solid var(--line)",
    background: "var(--panel-2)",
    color: "var(--text)",
  },
  leaveButton: {
    width: "100%",
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    borderRadius: 10,
    border: "1px solid var(--line)",
    background: "transparent",
    color: "var(--muted)",
  },

  // ---- Layout ----
  layout: {
    display: "grid",
    gridTemplateColumns: "240px minmax(0,1fr) 320px",
    // A single row bounded to the viewport (minmax(0,1fr), not the default content-sized auto row)
    // so the flex:1 canvas fills the height instead of growing unbounded and overflowing the page.
    gridTemplateRows: "minmax(0, 1fr)",
    height: "100vh",
    gap: 1,
    background: "var(--line)",
  },
  sidebar: {
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    overflow: "hidden",
    minHeight: 0,
  },
  roomHead: { display: "flex", alignItems: "center", gap: 10 },
  roomMark: { fontSize: 26 },
  roomName: {
    fontFamily: "'Fredoka', sans-serif",
    fontSize: 20,
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    background: "var(--grad)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  roomMode: { fontSize: 12, color: "var(--muted)" },
  statusPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    fontSize: 12,
    fontWeight: 600,
    padding: "5px 10px",
    borderRadius: 999,
  },
  statusOk: { background: "rgba(34,197,94,0.12)", color: "#4ade80" },
  statusBad: { background: "rgba(239,68,68,0.12)", color: "#f87171" },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "currentColor",
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--muted)",
  },
  scoreList: { listStyle: "none", padding: 0, margin: 0, overflowY: "auto", flex: 1 },
  scoreRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 10,
    marginBottom: 4,
    background: "var(--panel-2)",
  },
  scoreRowMe: { boxShadow: "inset 0 0 0 1px var(--accent)" },
  scoreRowDrawer: {
    background: "linear-gradient(180deg, rgba(99,102,241,0.16), rgba(99,102,241,0.04))",
  },
  rank: {
    width: 18,
    textAlign: "center",
    color: "var(--muted)",
    fontSize: 12,
    fontWeight: 700,
  },
  playerName: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
    flex: 1,
    fontSize: 14,
  },
  nameText: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  aiBadge: {
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: "0.05em",
    padding: "2px 5px",
    borderRadius: 6,
    background: "rgba(129,140,248,0.2)",
    color: "var(--accent-2)",
  },
  youTag: {
    fontSize: 10,
    color: "var(--muted)",
    background: "var(--line)",
    padding: "1px 6px",
    borderRadius: 6,
  },
  scoreNum: { fontVariantNumeric: "tabular-nums", fontSize: 15 },
  emptyRoster: { color: "var(--muted)", fontSize: 13, padding: 8 },

  // ---- Canvas pane ----
  galleryHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 6,
  },
  gallery: {
    marginTop: 12,
  },
  // Horizontal scroll rather than a wrap: eight turns wrapped into rows pushes the whole end
  // screen off the fold, and a strip you drag through reads as a filmstrip, which is what it is.
  galleryStrip: {
    display: "flex",
    gap: 10,
    overflowX: "auto",
    paddingBottom: 6,
  },
  galleryItem: {
    margin: 0,
    flex: "0 0 auto",
    width: 132,
  },
  galleryImg: {
    width: "100%",
    display: "block",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,.18)",
    background: "#fff",
  },
  // Tighter and dimmer than the word: the word is what it was, the guess is the aside.
  galleryGuess: {
    margin: "2px 0 0",
    fontSize: 11.5,
    textAlign: "center",
    opacity: 0.8,
    lineHeight: 1.25,
  },
  galleryCaption: {
    marginTop: 4,
    fontSize: 12,
    textAlign: "center",
    opacity: 0.85,
  },
  canvasPane: {
    background: "var(--bg)",
    display: "flex",
    flexDirection: "column",
    padding: 18,
    gap: 12,
    minWidth: 0,
    minHeight: 0,
  },
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "10px 14px",
    border: "1px solid var(--line)",
    borderRadius: 12,
    minHeight: 30,
  },
  bannerText: { fontSize: 15, fontWeight: 600 },
  turnPill: {
    fontSize: 12,
    fontWeight: 700,
    color: "var(--accent-2)",
    background: "rgba(99,102,241,0.14)",
    padding: "4px 10px",
    borderRadius: 999,
  },
  wordZone: { display: "flex", alignItems: "center", gap: 10, margin: "0 auto" },
  wordVerb: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--muted)",
  },
  tiles: { display: "flex", gap: 5 },
  tile: {
    minWidth: 22,
    height: 30,
    padding: "0 4px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 16,
    background: "var(--panel-2)",
    borderBottom: "2px solid var(--accent)",
    borderRadius: 6,
    textTransform: "uppercase",
  },
  timerWrap: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  timerBarTrack: {
    width: 70,
    height: 6,
    borderRadius: 999,
    background: "var(--panel-2)",
    overflow: "hidden",
  },
  timerBarFill: {
    display: "block",
    height: "100%",
    borderRadius: 999,
    transition: "width .12s linear",
  },
  timer: {
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
    color: "var(--muted)",
    minWidth: 40,
    textAlign: "right",
  },
  timerLow: { color: "#f87171" },

  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    border: "1px solid var(--line)",
    borderRadius: 12,
    flexWrap: "wrap",
  },
  swatch: { width: 26, height: 26, borderRadius: "50%", padding: 0 },
  toolDivider: { width: 1, height: 22, background: "var(--line)" },
  canvasWrap: {
    flex: 1,
    minHeight: 0,
    position: "relative",
    borderRadius: 14,
    overflow: "hidden",
    boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
  },
  hotTake: {
    position: "absolute",
    bottom: 12,
    left: 12,
    maxWidth: "70%",
    background: "rgba(15,17,23,0.82)",
    color: "#fbbf24",
    fontSize: 13,
    fontWeight: 600,
    fontStyle: "italic",
    padding: "7px 13px",
    borderRadius: 14,
    border: "1px solid rgba(251,191,36,0.35)",
    backdropFilter: "blur(6px)",
    pointerEvents: "none",
  },
  canvasHintBadge: {
    position: "absolute",
    top: 12,
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(15,17,23,0.78)",
    color: "var(--text)",
    fontSize: 12,
    fontWeight: 600,
    padding: "5px 12px",
    borderRadius: 999,
    backdropFilter: "blur(6px)",
    pointerEvents: "none",
  },

  // ---- Chat ----
  main: {
    display: "flex",
    flexDirection: "column",
    padding: 18,
    gap: 12,
    minWidth: 0,
    minHeight: 0,
  },
  chatWrap: {
    position: "relative",
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  },
  chatLog: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    paddingRight: 4,
  },
  newMsgBtn: {
    position: "absolute",
    bottom: 8,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 2,
    padding: "6px 14px",
    borderRadius: 999,
    border: "none",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
    color: "white",
    background: "var(--grad)",
    boxShadow: "0 6px 18px rgba(168,85,247,0.5)",
    whiteSpace: "nowrap",
  },
  chatLine: { fontSize: 14, lineHeight: 1.4 },
  chatFrom: { fontWeight: 700, marginRight: 6, color: "var(--accent-2)" },
  chatFromAI: { color: "#fbbf24" },
  chatText: { color: "var(--text)", wordBreak: "break-word" },
  system: { color: "var(--muted)", fontStyle: "italic", fontSize: 13 },
  toast: {
    position: "fixed",
    top: "calc(18px + env(safe-area-inset-top))",
    left: "50%",
    zIndex: 10000,
    padding: "10px 18px",
    borderRadius: 20,
    fontWeight: 700,
    fontSize: 14,
    color: "white",
    background: "var(--grad)",
    boxShadow: "0 10px 30px rgba(168,85,247,0.5)",
    // Compact pill that wraps instead of stretching a long line across the whole top of the screen;
    // tappable to dismiss early (see onClick) so it never sits in the way.
    maxWidth: "min(80vw, 340px)",
    textAlign: "center",
    cursor: "pointer",
  },
  reconnectBanner: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10001,
    // Full-bleed yellow to the top edge (covers the notch), but pad the text below the safe area.
    padding: "calc(10px + env(safe-area-inset-top)) 16px 10px",
    textAlign: "center",
    fontWeight: 700,
    fontSize: 14,
    color: "#111",
    background: "#fbbf24",
    boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
  },
  inputRow: { display: "flex", gap: 8 },
  reactRow: { display: "flex", gap: 6, marginBottom: 8 },
  reactBtn: {
    flex: 1,
    padding: "6px 0",
    fontSize: 17,
    cursor: "pointer",
    border: "1px solid var(--line)",
    borderRadius: 10,
    background: "var(--panel-2)",
  },

  // ---- Shared controls ----
  input: {
    width: "100%",
    padding: "10px 12px",
    fontSize: 14,
    background: "var(--panel-2)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    color: "var(--text)",
    outline: "none",
  },
  button: {
    padding: "10px 16px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    border: "none",
    borderRadius: 10,
    background: "var(--grad)",
    color: "white",
    boxShadow: "0 6px 18px rgba(168,85,247,0.35)",
  },
  buttonBig: { width: "100%", marginTop: 18, padding: "13px 16px", fontSize: 15 },
  nameRow: { display: "flex", gap: 8, alignItems: "stretch" },
  diceButton: {
    width: 46,
    fontSize: 20,
    cursor: "pointer",
    borderRadius: 10,
    border: "1px solid var(--line)",
    background: "var(--panel-2)",
    flexShrink: 0,
  },
  xButton: {
    padding: "10px 14px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    border: "none",
    borderRadius: 10,
    background: "#111111",
    color: "white",
  },
  buttonDisabled: { opacity: 0.45, cursor: "not-allowed" },
  ghostButton: {
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    border: "1px solid var(--line)",
    borderRadius: 10,
    background: "transparent",
    color: "var(--text)",
  },
};
