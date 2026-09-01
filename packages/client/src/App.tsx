import { useEffect, useRef, useState } from "react";
import { useGameSocket } from "./useWebSocket";
import { DrawingCanvas } from "./DrawingCanvas";
import { renderEvidencePng } from "./evidenceCard";
import { useWakeLock } from "./useWakeLock";
import { useAppBadge } from "./useAppBadge";
import type { WordTier } from "@iguess/shared";
import { newRoomCode } from "@iguess/shared/roomCode";
import { PACK_NAMES } from "@iguess/shared/words";
import { REACTIONS, AVATARS } from "@iguess/shared";
import type { DrawOp } from "@iguess/shared";
import { Replay } from "./Replay";
import { awardsFor } from "@iguess/shared/awards";
import { styles } from "./styles";
import { blip, buzz, MUTE_KEY } from "./feedback";
import { saveCanvasPng, thumbnailOf } from "./canvasExport";

// What each tier pays, mirroring TIER_MULTIPLIER on the server.
const TIER_LABEL: Record<WordTier, string> = { easy: "1x", medium: "1.25x", hard: "1.6x" };

// Ink colours. Fixed hexes, not theme tokens: a drawing has to look the same to everyone
// regardless of which theme each player is using.
const COLORS = [
  "#111111", "#6b7280", "#ffffff",
  "#e11d48", "#f97316", "#f59e0b",
  "#16a34a", "#0891b2", "#2563eb",
  "#7c3aed", "#db2777", "#92400e",
];

// `needsTwo` mirrors each mode's `minHumans` on the server (see packages/game-server/src/modes).
// Classic is the only one that can't run alone, so first-time visitors start in AI Guesser: the
// app's hook is immediately playable by one person rather than leading with a dead-end room.
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
const AVATAR_KEY = "iguess_avatar";
const STATS_KEY = "iguess_stats";

function getStreak(): number {
  return Number(localStorage.getItem(STREAK_KEY) || 0) || 0;
}

export interface LifetimeStats {
  games: number;
  wins: number;
  bestStreak: number;
}

// Kept locally rather than on the server: there are no accounts, and a number that survives a
// reload is the whole point. A corrupt or absent blob reads as a fresh player.
export function lifetimeStats(): LifetimeStats {
  try {
    const raw = JSON.parse(localStorage.getItem(STATS_KEY) ?? "");
    return {
      games: Number(raw?.games) || 0,
      wins: Number(raw?.wins) || 0,
      bestStreak: Number(raw?.bestStreak) || 0,
    };
  } catch {
    return { games: 0, wins: 0, bestStreak: 0 };
  }
}

function bumpStreak(won: boolean): number {
  const next = won ? getStreak() + 1 : 0;
  localStorage.setItem(STREAK_KEY, String(next));
  const s = lifetimeStats();
  localStorage.setItem(
    STATS_KEY,
    JSON.stringify({
      games: s.games + 1,
      wins: s.wins + (won ? 1 : 0),
      bestStreak: Math.max(s.bestStreak, next),
    })
  );
  return next;
}

function shareToX(text: string) {
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

// The stylesheet hides confetti under prefers-reduced-motion, but hidden pieces are still
// built and mounted — up to 160 nodes for someone who asked for no motion. Skip the work.
const stillPlease = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// Lightweight emoji confetti — no deps. Renders a burst of falling emoji that
// auto-clears after the animation. Fired on a win.
function Confetti({ go, count = 48 }: { go: boolean; count?: number }) {
  const [pieces, setPieces] = useState<
    { id: number; left: number; delay: number; dur: number; emoji: string }[]
  >([]);
  useEffect(() => {
    if (!go || stillPlease()) return;
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
// The room goes in the PATH, not the hash: a hash never reaches the server, so a link
// preview would only ever show the generic card. /r/:room lets the worker name the room.
function inviteLink(room: string, mode: string): string {
  const q = new URLSearchParams({ mode });
  return `${window.location.origin}/r/${encodeURIComponent(room)}?${q.toString()}`;
}

// Read room/mode/name from the URL hash so an invite link pre-fills the gate.
function readInvite(): { room?: string; mode?: string; name?: string } {
  // An invite can arrive two ways: the hash on a link someone sent, or the query string when
  // the OS share sheet hands us a link that was shared INTO the installed app (share_target).
  // A /r/:room path is the current invite shape. The hash form is still read, because links
  // people already sent each other are out in the world and should keep working.
  const path = window.location.pathname.match(/^\/r\/([^/]+)\/?$/);
  if (path) {
    const q = new URLSearchParams(window.location.search);
    return {
      room: decodeURIComponent(path[1]!),
      mode: q.get("mode") ?? undefined,
      name: q.get("name") ?? undefined,
    };
  }
  const shared = new URLSearchParams(window.location.search);
  const sharedLink = shared.get("url") ?? shared.get("text") ?? "";
  const fromShare = sharedLink.includes("#")
    ? sharedLink.slice(sharedLink.indexOf("#") + 1)
    : (sharedLink.match(/\/r\/([^/?#\s]+)/)?.[1] ?? "");
  const raw = window.location.hash.replace(/^#/, "") || (fromShare.includes("=") ? fromShare : "");
  if (!raw && fromShare) return { room: decodeURIComponent(fromShare) };
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
  // A generated code rather than a shared default: two groups opening the site at once used
  // to land in the same room. A returning player keeps the room they last used.
  const [draftRoom, setDraftRoom] = useState(
    invite.room ?? localStorage.getItem("iguess_room") ?? newRoomCode()
  );
  const [draftMode, setDraftMode] = useState(invite.mode ?? "ai");
  const [avatar, setAvatar] = useState(
    () => localStorage.getItem(AVATAR_KEY) ?? AVATARS[Math.floor(Math.random() * AVATARS.length)]!
  );
  const stats = lifetimeStats();
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
    const room = draftRoom.trim() || newRoomCode();
    localStorage.setItem("iguess_name", name);
    localStorage.setItem("iguess_room", room);
    localStorage.setItem(AVATAR_KEY, avatar);
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

          <label style={styles.fieldLabel}>You</label>
          <div style={styles.avatarGrid}>
            {AVATARS.map((a) => (
              <button
                key={a}
                type="button"
                className="lift"
                style={{ ...styles.avatarChip, ...(a === avatar ? styles.avatarChipOn : null) }}
                aria-pressed={a === avatar}
                aria-label={`avatar ${a}`}
                onClick={() => setAvatar(a)}
              >
                {a}
              </button>
            ))}
          </div>
          {stats.games > 0 && (
            <p style={styles.statsLine}>
              {stats.games} games · {stats.wins} wins · best streak {stats.bestStreak}
            </p>
          )}

          <label style={styles.fieldLabel}>Room</label>
          <div style={styles.nameRow}>
            <input
              placeholder="your room code"
              value={draftRoom}
              onChange={(e) => setDraftRoom(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doJoin()}
              style={{ ...styles.input, flex: 1 }}
            />
            <button
              type="button"
              className="lift wiggle"
              style={styles.diceButton}
              title="start a fresh room"
              aria-label="new room code"
              onClick={() => setDraftRoom(newRoomCode())}
            >
              🎲
            </button>
          </div>

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

  return (
    <Room
      name={joined.name}
      room={joined.room}
      mode={joined.mode}
      avatar={avatar}
      onLeave={leaveRoom}
    />
  );
}

// Server turn length — mirrors TURN_MS in engine.ts. Only used to size the
// draining progress bar; the authoritative deadline is still turnEndsAt.
const TURN_MS = 60_000;

function Countdown({ endsAt }: { endsAt: number | null }) {
  const [now, setNow] = useState(Date.now());
  const buzzedAt = useRef<number | null>(null);
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 120);
    return () => clearInterval(id);
  }, [endsAt]);
  // One buzz per turn as time runs out. Keyed on the deadline so a new turn re-arms it.
  useEffect(() => {
    if (!endsAt || buzzedAt.current === endsAt) return;
    if (endsAt - now <= 5_000) {
      buzzedAt.current = endsAt;
      buzz([40, 80, 40]);
    }
  }, [endsAt, now]);
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

function Room({
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
  const [erasing, setErasing] = useState(false);
  const [filling, setFilling] = useState(false);
  const [replayIdx, setReplayIdx] = useState<number | null>(null);
  const roundOps = useRef<DrawOp[]>([]);
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
  // An invite should leave the game through the quickest native path. Most
  // phones can hand it straight to Messages, Discord, or WhatsApp; older
  // browsers still get the familiar copied-link fallback.
  const [inviteResult, setInviteResult] = useState<"copied" | "shared" | null>(null);
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
  const [gallery, setGallery] = useState<
    { word: string; png: string; guess: string | null; right: boolean; drawerId: string | null; ops: DrawOp[] }[]
  >([]);
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
  const youAreHost = players.some((p) => p.id === you?.id && p.isHost);
  const awards = phase === "ended" ? awardsFor(gallery, players) : [];
  const humans = players.filter((p) => !isAI(p.id) && !p.spectator);
  const watching = players.filter((p) => p.spectator);
  const youAreWatching = watching.some((p) => p.id === you?.id);
  const readyCount = humans.filter((p) => p.ready).length;
  const youAreReady = humans.some((p) => p.id === you?.id && p.ready);
  // The lobby board is open to everyone; during a game only the drawer touches it.
  const canDraw = (phase === "playing" && isDrawer) || ((phase === "lobby" || phase === "ended") && !youAreWatching);
  // Distinct from canDraw: the lobby board is open to everyone, but only a live drawer is
  // told to stop typing. Gating chat on canDraw silenced the whole lobby.
  const drawingNow = phase === "playing" && isDrawer;
  const inGame = phase === "playing" || phase === "intermission";
  useWakeLock(inGame || phase === "choosing");
  // One badge when the game is waiting on you specifically.
  useAppBadge(canDraw || (phase === "choosing" && isDrawer) ? 1 : 0);

  // Why the canvas is inert right now, so a disabled board never just reads as "broken".
  const drawDisabledReason: string | null = canDraw
    ? null
    : youAreWatching
      ? "you're watching this one"
      : phase === "lobby"
        ? "doodle while you wait ✏️"
        : phase === "ended"
          ? "round over. run it back"
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
      buzz([18, 60, 18]);
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
      buzz([12, 40, 12, 40, 30]);
      setToast("✅ nailed it! big brain 🧠");
      const t = setTimeout(() => setToast(null), 2400);
      return () => clearTimeout(t);
    } else {
      blip([880], muted); // someone else got it
      buzz(12);
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
    // Snapshot the ops too: the still is for sharing, the ops are for replaying the round.
    setGallery((g) => [
      ...g,
      { word: turnEnd.word, png, guess, right, drawerId: game?.drawerId ?? null, ops: roundOps.current.slice() },
    ]);
    lastGuess.current = { guess: null, right: false };
  }, [turnEnd?.at]);

  // A new game starts a new gallery. Keyed on ENTERING a live phase, not on turnIndex hitting
  // zero: the game_state that follows turn_end still carries the old index, so a zero-check
  // wiped the first round's drawing the moment it was captured. "run it back" goes
  // ended → playing without passing through the lobby, which is why phase alone isn't enough.
  const wasLive = useRef(false);
  useEffect(() => {
    const live = phase === "choosing" || phase === "playing";
    if (live && !wasLive.current) setGallery([]);
    wasLive.current = live || phase === "intermission";
  }, [phase]);

  // On game end: figure out if you won, update the streak, and play a sting.
  useEffect(() => {
    if (phase !== "ended") return;
    const won = ranked.length > 0 && ranked[0].id === you?.id;
    const streak = bumpStreak(won);
    if (won) {
      setWinConfetti(Math.min(48 + streak * 16, 160)); // bigger party per streak
      blip([523, 659, 784, 1047], muted); // ascending fanfare
      buzz([25, 50, 25, 50, 90]);
      setToast(streak > 1 ? `🏆 dub! ${streak} in a row 🔥` : pick(WIN_LINES));
    } else {
      setWinConfetti(48);
      blip([330, 247], muted); // sad trombone-ish
      buzz(140);
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
    const url = inviteLink(room, effectiveMode);
    const resetResult = (result: "copied" | "shared") => {
      setInviteResult(result);
      setTimeout(() => setInviteResult(null), 1800);
    };

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "iguess",
          text: `pull up to #${room}, ${modeMeta?.label ?? effectiveMode}`,
          url,
        });
        resetResult("shared");
        return;
      } catch (err) {
        // Closing the share sheet is a completed choice, not a failed invite.
        // Other errors fall through to copy so there is still a useful path.
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }

    if (await copyText(url)) {
      resetResult("copied");
    }
  };

  // Wordle-style flex text: a copy-pasteable recap of how you stacked up. This
  // is the share loop — text + a link is what actually spreads.
  /**
   * One PNG of the whole game: every drawing, its word, and what the AI thought it was.
   *
   * The text share (a block grid of scores) travels anywhere but shares the least interesting part.
   * This shares the part people actually laugh at. On browsers that support
   * file sharing, it opens the native sheet with the PNG attached; elsewhere
   * it keeps the reliable download behavior.
   */
  const saveEvidence = async () => {
    if (savingEvidence || gallery.length === 0) return;
    setSavingEvidence(true);
    try {
      const line = ranked
        .slice(0, 4)
        .map((p) => `${p.id === you?.id ? "you" : isAI(p.id) ? "🤖" : p.name} ${game?.scores[p.id] ?? 0}`)
        .join("  ·  ");
      const blob = await renderEvidencePng(gallery, line, awardsFor(gallery, players));
      const filename = `iguess-evidence-${room}.png`;
      const file = new File([blob], filename, { type: "image/png" });
      // `navigator.share` alone isn't enough: some browsers can share links
      // but reject files. `canShare` asks about this exact attachment first,
      // so a tap never opens a broken sheet.
      if (
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share({
            title: "iguess evidence",
            text: "the drawings, the score, and what the AI thought it saw",
            files: [file],
          });
          return;
        } catch (err) {
          // Cancel means the person chose not to share; don't surprise them
          // with a download. A genuine share failure falls back below.
          if (err instanceof Error && err.name === "AbortError") return;
        }
      }
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.download = filename;
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
          <p style={{ color: "var(--muted)", lineHeight: 1.5, margin: "0 0 20px" }}>{fatal}</p>
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
          style={{ ...styles.inviteButton, ...(inviteResult ? styles.inviteButtonOk : null) }}
          onClick={handleInvite}
        >
          {inviteResult === "shared"
            ? "✅ invite sent"
            : inviteResult === "copied"
              ? "✅ copied, go spam it"
              : "🔗 invite the squad"}
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
                  {isAI(p.id) ? (
                    <span style={styles.aiBadge}>AI</span>
                  ) : p.avatar ? (
                    <span aria-hidden>{p.avatar}</span>
                  ) : null}
                  <span style={styles.nameText}>{p.name}</span>
                  {me ? <span style={styles.youTag}>you</span> : null}
                  {p.isHost ? <span title="host">👑</span> : null}
                  {p.spectator ? <span title="watching">👀</span> : null}
                  {drawer ? <span title="drawing">✏️</span> : null}
                  {guessed ? <span title="guessed">✅</span> : null}
                </span>
                {youAreHost && !me && !isAI(p.id) && (
                  <button
                    style={styles.kickButton}
                    title={`remove ${p.name}`}
                    aria-label={`remove ${p.name}`}
                    onClick={() => kick(p.id)}
                  >
                    ✕
                  </button>
                )}
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
                {youAreWatching
                  ? "room's full, so you're watching. you're in the next game."
                  : !soloWaiting
                  ? `lowkey waiting · ${readyCount}/${humans.length} ready` +
                    (watching.length ? ` · ${watching.length} watching` : "")
                  : isAIMode
                    ? "it's you vs the 🤖 AI. hit send it whenever you're ready."
                    : "just you so far. classic needs someone to guess, so hit 🔗 invite the squad."}
              </span>
              <span style={styles.settingsRow}>
                <span style={styles.packRow}>
                  {PACK_NAMES.map((p) => {
                    const on = settings.packs.includes(p);
                    return (
                      <button
                        key={p}
                        className="lift"
                        style={{ ...styles.packChip, ...(on ? styles.packChipOn : null) }}
                        aria-pressed={on}
                        disabled={!youAreHost}
                        onClick={() =>
                          updateSettings({
                            packs: on ? settings.packs.filter((x) => x !== p) : [...settings.packs, p],
                          })
                        }
                      >
                        {p}
                      </button>
                    );
                  })}
                </span>
                <label style={styles.settingLabel}>
                  ours
                  <input
                    style={{ ...styles.settingSelect, width: 150 }}
                    disabled={!youAreHost}
                    placeholder="your own words, comma separated"
                    defaultValue={settings.customWords.join(", ")}
                    onBlur={(e) => updateSettings({ customWords: e.target.value.split(",") })}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  />
                </label>
                <label style={styles.settingLabel}>
                  round
                  <select
                    style={styles.settingSelect}
                    disabled={!youAreHost}
                    value={settings.turnSeconds}
                    onChange={(e) => updateSettings({ turnSeconds: Number(e.target.value) })}
                  >
                    {[30, 45, 60, 90, 120].map((n) => (
                      <option key={n} value={n}>{n}s</option>
                    ))}
                  </select>
                </label>
                {isAIMode && (
                  <label style={styles.settingLabel}>
                    ai
                    <select
                      style={styles.settingSelect}
                      disabled={!youAreHost}
                      value={settings.aiSkill}
                      onChange={(e) => updateSettings({ aiSkill: e.target.value as typeof settings.aiSkill })}
                    >
                      <option value="easy">blindfolded</option>
                      <option value="normal">normal</option>
                      <option value="brutal">scary good</option>
                    </select>
                  </label>
                )}
                <label style={styles.settingLabel}>
                  ends
                  <select
                    style={styles.settingSelect}
                    disabled={!youAreHost}
                    value={settings.scoreTarget > 0 ? `t${settings.scoreTarget}` : `r${settings.rounds}`}
                    onChange={(e) => {
                      const v = e.target.value;
                      updateSettings(
                        v.startsWith("t")
                          ? { scoreTarget: Number(v.slice(1)) }
                          : { scoreTarget: 0, rounds: Number(v.slice(1)) }
                      );
                    }}
                  >
                    {[1, 2, 3, 4, 5, 6, 8].map((n) => (
                      <option key={`r${n}`} value={`r${n}`}>{n} rounds</option>
                    ))}
                    {[300, 500, 1000].map((n) => (
                      <option key={`t${n}`} value={`t${n}`}>first to {n}</option>
                    ))}
                  </select>
                </label>
              </span>
              {!youAreWatching && (
                <button
                  className="lift"
                  style={{ ...styles.ghostButton, ...(youAreReady ? styles.readyOn : null) }}
                  onClick={() => setReady(!youAreReady)}
                >
                  {youAreReady ? "✅ ready" : "i'm ready"}
                </button>
              )}
              <button
                className="lift pulse-cta"
                style={{ ...styles.button, marginLeft: "auto", ...(youAreHost ? null : styles.disabled) }}
                onClick={startGame}
                disabled={!youAreHost}
                title={youAreHost ? undefined : "only the host can start"}
              >
                {youAreHost ? "send it" : "waiting on the host"}
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
                    {wordChoices.options.map((c) => (
                      <button
                        key={c.word}
                        className="lift"
                        style={styles.button}
                        onClick={() => chooseWord(c.word)}
                        title={`${c.tier} — worth ${TIER_LABEL[c.tier]}`}
                      >
                        {c.word}
                        <span style={styles.tierBadge}>{TIER_LABEL[c.tier]}</span>
                      </button>
                    ))}
                    {wordChoices.canSkip && (
                      <button
                        className="lift"
                        style={styles.skipButton}
                        onClick={skipWord}
                        title="swap all three for new ones (once per game)"
                      >
                        ↻ skip
                      </button>
                    )}
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
              onClick={() => { setColor(c); setErasing(false); }}
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
              ...(erasing ? { boxShadow: "0 0 0 2px var(--accent)" } : {}),
            }}
            onClick={() => { setErasing((e) => !e); setFilling(false); }}
            disabled={!canDraw}
            aria-pressed={erasing}
            title="eraser"
          >
            ⌫ erase
          </button>
          <button
            className="lift"
            style={{
              ...styles.ghostButton,
              ...(filling ? { boxShadow: "0 0 0 2px var(--accent)" } : {}),
            }}
            onClick={() => { setFilling((f) => !f); setErasing(false); }}
            disabled={!canDraw}
            aria-pressed={filling}
            title="fill an area with the current colour"
          >
            🪣 fill
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
            erasing={erasing}
            filling={filling}
            opsRef={roundOps}
            socketBacklog={socketBacklog}
            onCursor={sendCursor}
            peerCursor={peerCursor}
            canDraw={canDraw}
            onCanvas={(el) => (canvasElRef.current = el)}
          />
          {reactions.map((r) => (
            <span
              key={r.id}
              aria-hidden
              className="reaction-float"
              style={{ left: `${8 + r.at * 84}%` }}
            >
              {r.emoji}
            </span>
          ))}
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
                {savingEvidence ? "rendering…" : "🖼️ share the evidence"}
              </button>
            </div>
            <div style={styles.galleryStrip}>
              {awards.length > 0 && (
                <ul style={styles.awardList}>
                  {awards.map((a) => (
                    <li key={a.title} style={styles.awardItem}>
                      <span style={styles.awardTitle}>{a.title}</span>
                      <strong style={styles.awardWho}>{a.who}</strong>
                      <span style={styles.awardDetail}>{a.detail}</span>
                    </li>
                  ))}
                </ul>
              )}
              {gallery.map((g, i) => (
                <figure key={i} style={styles.galleryItem}>
                  {replayIdx === i ? (
                    <Replay ops={g.ops} size={160} />
                  ) : (
                    <img src={g.png} alt={`the drawing for "${g.word}"`} style={styles.galleryImg} />
                  )}
                  <button
                    style={styles.replayButton}
                    onClick={() => setReplayIdx(replayIdx === i ? null : i)}
                    title={replayIdx === i ? "show the finished drawing" : "watch it being drawn"}
                  >
                    {replayIdx === i ? "◼ still" : "▶ replay"}
                  </button>
                  <figcaption style={styles.galleryCaption}>{g.word}</figcaption>
                  {/*
                    What the machine thought it was.
                    This is the actual joke of the whole app and it was being thrown away every
                    turn: the drawing alone is just a bad drawing, but "cactus / 🤖 broccoli" is the
                    thing you screenshot. A correct guess gets said plainly rather than quoted,
                    because being right is not funny and pretending it is would be smug.
                  */}
                  {g.right ? (
                    <p style={{ ...styles.galleryGuess, color: "var(--on-good)" }}>🤖 got it</p>
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
              onClick={() => react(emoji)}
              disabled={drawingNow}
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
              drawingNow
                ? "eyes on the canvas, picasso ✋"
                : inGame
                ? "guess it bestie… (?word calls the AI)"
                : "say something fr"
            }
            disabled={drawingNow}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="lift" style={styles.button} type="submit" disabled={drawingNow}>
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
