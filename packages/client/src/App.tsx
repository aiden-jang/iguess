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

const TIER_LABEL: Record<WordTier, string> = { easy: "1x", medium: "1.25x", hard: "1.6x" };

// Real hex codes, not theme variables. A drawing must look the same to everyone, whichever
// theme each person happens to be using.
const COLORS = [
  "#111111", "#6b7280", "#ffffff",
  "#e11d48", "#f97316", "#f59e0b",
  "#16a34a", "#0891b2", "#2563eb",
  "#7c3aed", "#db2777", "#92400e",
];

// `needsTwo` has to match `minHumans` on the server. Classic is the only mode that needs a
// second person, so a first-time visitor lands on AI Guesser and can play alone right away.
const MODES = [
  { value: "classic", label: "Classic", blurb: "you draw, humans guess", icon: "🎨", needsTwo: true },
  { value: "ai", label: "AI Guesser", blurb: "you draw, an AI races to guess it", icon: "🔍", needsTwo: false },
  { value: "ai-drawer", label: "AI Drawer", blurb: "the AI draws, you guess", icon: "🖌️", needsTwo: false },
  { value: "team-battle", label: "Team Battle", blurb: "humans vs AI, first guess wins", icon: "⚔️", needsTwo: false },
  { value: "duel", label: "You vs AI", blurb: "trade turns drawing, most points beats the machine", icon: "🤖", needsTwo: false },
];

const isAI = (id?: string | null) => !!id && id.startsWith("ai-");

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

const NAME_ADJ = ["sleepy", "feral", "based", "soggy", "spicy", "chaotic", "lowkey", "sus", "gigarad", "unhinged", "moist", "elite"];
const NAME_NOUN = ["goblin", "pigeon", "raccoon", "doodler", "gamer", "wizard", "shrimp", "menace", "legend", "noodle", "gremlin", "duck"];
function randomName(): string {
  const a = NAME_ADJ[Math.floor(Math.random() * NAME_ADJ.length)];
  const n = NAME_NOUN[Math.floor(Math.random() * NAME_NOUN.length)];
  return `${a}_${n}${Math.floor(Math.random() * 90 + 10)}`;
}

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

// There are no accounts, so this lives in the browser. Unreadable or missing means a brand
// new player, never an error.
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

// The stylesheet already hides confetti for people who asked for less motion, but hidden
// pieces still get built. Don't make 160 of them for someone who won't see any.
const stillPlease = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

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

function Dots() {
  return (
    <span aria-hidden>
      <span className="dot">.</span>
      <span className="dot">.</span>
      <span className="dot">.</span>
    </span>
  );
}

// The clipboard API only exists on https and localhost, so there is a fallback path.
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

// Put the room in the path, not after a #. A # never gets sent to the server, so link
// previews could only ever show the same generic picture.
function inviteLink(room: string, mode: string): string {
  const q = new URLSearchParams({ mode });
  return `${window.location.origin}/r/${encodeURIComponent(room)}?${q.toString()}`;
}

function readInvite(): { room?: string; mode?: string; name?: string } {
  // Three ways in: a /r/room link, an older #room=… link, or a link someone shared into the
  // installed app. The old # form still works because those links are already out there.
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
  const invite = readInvite();
  const invited = !!invite.room;
  const [draftName, setDraftName] = useState(
    invite.name ?? localStorage.getItem("iguess_name") ?? ""
  );
  // Make up a code instead of defaulting to one shared name, or two unrelated groups opening
  // the site at the same moment end up in each other's game.
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
    // Put the room in the address bar, so copying the URL shares this room and not the homepage.
    const q = new URLSearchParams({ room, mode: draftMode });
    window.history.pushState(null, "", `#${q.toString()}`);
    setJoined({ name, room, mode: draftMode });
  };

  // Clear the invite out of the URL too, or refreshing drops you straight back into the room.
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

// Only used to size the draining bar. The real deadline is always turnEndsAt from the server.
const TURN_MS = 60_000;

function Countdown({ endsAt }: { endsAt: number | null }) {
  const [now, setNow] = useState(Date.now());
  const buzzedAt = useRef<number | null>(null);
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 120);
    return () => clearInterval(id);
  }, [endsAt]);
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
  const effectiveMode = serverMode ?? mode;
  const isAIMode = effectiveMode !== "classic";

  // So the very first connection doesn't flash a "lost connection" banner at you.
  const [everConnected, setEverConnected] = useState(false);
  useEffect(() => {
    if (connected) setEverConnected(true);
  }, [connected]);
  // On a phone the join screen's focused input can leave the page scrolled down, so you arrive
  // looking at a blank canvas instead of the start button. Does nothing on desktop.
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
  // Only auto-scroll when they are already at the bottom. Someone reading back through the
  // chat should not get yanked to the end every time a message arrives.
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
  const [inviteResult, setInviteResult] = useState<"copied" | "shared" | null>(null);
  const [flexed, setFlexed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashToast = (text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };
  const [muted, setMuted] = useState(() => localStorage.getItem(MUTE_KEY) === "1");
  const [burstKey, setBurstKey] = useState(0);
  const [botGuess, setBotGuess] = useState<string | null>(null);
  const aiMsgCount = useRef(0);
  const [winConfetti, setWinConfetti] = useState(48);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);

  const [savingEvidence, setSavingEvidence] = useState(false);
  const [gallery, setGallery] = useState<
    { word: string; png: string; guess: string | null; right: boolean; drawerId: string | null; ops: DrawOp[] }[]
  >([]);
  // `botGuess` clears itself after a few seconds, so by the end of a turn it is usually empty.
  // The gallery needs whatever the machine said LAST, which is the whole joke.
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
  const canDraw = (phase === "playing" && isDrawer) || ((phase === "lobby" || phase === "ended") && !youAreWatching);
  // Not the same as canDraw. Everyone can scribble in the lobby, but only the person drawing
  // in a live round is told to stop typing. Using canDraw here silenced the whole lobby.
  const drawingNow = phase === "playing" && isDrawer;
  const inGame = phase === "playing" || phase === "intermission";
  useWakeLock(inGame || phase === "choosing");
  useAppBadge(canDraw || (phase === "choosing" && isDrawer) ? 1 : 0);

  // Always say WHY the board is dead, or it just looks broken.
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

  useEffect(() => {
    if (canDraw) {
      setToast("🎨 you're up, cook!");
      blip([523, 784], muted); // little "ping!"
      buzz([18, 60, 18]);
      const t = setTimeout(() => setToast(null), 2600);
      return () => clearTimeout(t);
    }
  }, [canDraw]);

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

  // Grab the picture now, before the next turn wipes the board.
  useEffect(() => {
    if (!turnEnd) return;
    const el = canvasElRef.current;
    if (!el) return;
    const png = thumbnailOf(el);
    if (!png) return;
    const { guess, right } = lastGuess.current;
    // Keep the strokes as well as the picture: one is for sharing, one is for the replay.
    setGallery((g) => [
      ...g,
      { word: turnEnd.word, png, guess, right, drawerId: game?.drawerId ?? null, ops: roundOps.current.slice() },
    ]);
    lastGuess.current = { guess: null, right: false };
  }, [turnEnd?.at]);

  // Clear the gallery when a game STARTS, not when the turn number is zero. The state update
  // that arrives just after a turn ends still says zero, so a zero-check threw away the first
  // round's drawing the instant it was saved.
  const wasLive = useRef(false);
  useEffect(() => {
    const live = phase === "choosing" || phase === "playing";
    if (live && !wasLive.current) setGallery([]);
    wasLive.current = live || phase === "intermission";
  }, [phase]);

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

  // The drawer sees the word. Everyone else sees one tile per letter, filling in over time.
  const wordLetters = isDrawer
    ? (myWord ?? "").split("")
    : game?.hint
      ? game.hint.split("").map((ch) => (ch === "_" ? "" : ch))
      : Array.from({ length: game?.wordLength ?? 0 }, () => "");

  const ranked = [...players].sort(
    (a, b) => (game?.scores[b.id] ?? 0) - (game?.scores[a.id] ?? 0)
  );

  const modeMeta = MODES.find((m) => m.value === effectiveMode);
  const hasAI = players.some((p) => isAI(p.id));
  const aiGuessedRight = hasAI && (game?.guessedIds ?? []).some((id) => isAI(id));
  // Keep the winning guess, not the last wrong one.
  if (aiGuessedRight) lastGuess.current = { ...lastGuess.current, right: true };
  const soloWaiting = !hasAI && players.filter((p) => !isAI(p.id)).length <= 1;

  useEffect(() => {
    const aiMsgs = log.filter((l) => isAI(l.from?.id));
    if (aiMsgs.length <= aiMsgCount.current) return;
    aiMsgCount.current = aiMsgs.length;
    const latest = aiMsgs[aiMsgs.length - 1]?.text ?? null;
    setBotGuess(latest);
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
        // Closing the share sheet is a decision, not a failure. Real errors fall through to copy.
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }

    if (await copyText(url)) {
      resetResult("copied");
    }
  };

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
      // Some browsers can share a link but not a file. Ask about this exact file first, or the
      // share sheet opens and then fails.
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
          // They cancelled on purpose. Don't surprise them with a download instead.
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

  // The socket gave up for good, so there is no game to show. Say why, and offer a way back.
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
            if (!t) return;
            // An emptied box is how you know you sent it.
            if (sendChat(t)) setText("");
            else flashToast("not sent, still reconnecting 👀");
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
