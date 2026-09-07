import { useEffect, useRef, useState } from "react";
import { useGameSocket } from "./useWebSocket";
import { isAI, roomView } from "./roomView";
import { DrawingCanvas } from "./DrawingCanvas";
import { renderEvidencePng } from "./evidenceCard";
import { useWakeLock } from "./useWakeLock";
import { useAppBadge } from "./useAppBadge";
import type { WordTier } from "@iguess/shared";
import { newRoomCode } from "@iguess/shared/roomCode";
import { AVATARS } from "@iguess/shared";
import type { DrawOp } from "@iguess/shared";
import { awardsFor } from "@iguess/shared/awards";
import { styles } from "./styles";
import { RoomSidebar } from "./RoomSidebar";
import { Scoreboard } from "./Scoreboard";
import { ChatPanel } from "./ChatPanel";
import { readStored, writeStored } from "./storage";
import { blip, buzz } from "./feedback";
import { useToast } from "./useToast";
import { useMuted } from "./useMuted";
import { saveCanvasPng, thumbnailOf } from "./canvasExport";
import { flexText, scoreLine, shareOrDownload } from "./share";
import { COLORS } from "./brushStyle";
import { useBrush } from "./useBrush";
import { DrawToolbar } from "./DrawToolbar";
import { HostSettings } from "./HostSettings";
import { EndScreen, type GalleryShot } from "./EndScreen";
import { lobbyStatus } from "./labels";

const TIER_LABEL: Record<WordTier, string> = { easy: "1x", medium: "1.25x", hard: "1.6x" };


// `needsTwo` has to match `minHumans` on the server. Classic is the only mode that needs a
// second person, so a first-time visitor lands on AI Guesser and can play alone right away.
const MODES = [
  { value: "classic", label: "Classic", blurb: "you draw, humans guess", icon: "🎨", needsTwo: true },
  { value: "ai", label: "AI Guesser", blurb: "you draw, an AI races to guess it", icon: "🔍", needsTwo: false },
  { value: "ai-drawer", label: "AI Drawer", blurb: "the AI draws, you guess", icon: "🖌️", needsTwo: false },
  { value: "team-battle", label: "Team Battle", blurb: "humans vs AI, first guess wins", icon: "⚔️", needsTwo: false },
  { value: "duel", label: "You vs AI", blurb: "trade turns drawing, most points beats the machine", icon: "🤖", needsTwo: false },
];


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
  return Number(readStored(STREAK_KEY) || 0) || 0;
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
    const raw = JSON.parse(readStored(STATS_KEY) ?? "");
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
  writeStored(STREAK_KEY, String(next));
  const s = lifetimeStats();
  writeStored(
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


export function App() {
  const invite = readInvite();
  const invited = !!invite.room;
  const [draftName, setDraftName] = useState(
    invite.name ?? readStored("iguess_name") ?? ""
  );
  // Make up a code instead of defaulting to one shared name, or two unrelated groups opening
  // the site at the same moment end up in each other's game.
  const [draftRoom, setDraftRoom] = useState(
    invite.room ?? readStored("iguess_room") ?? newRoomCode()
  );
  const [draftMode, setDraftMode] = useState(invite.mode ?? "ai");
  const [avatar, setAvatar] = useState(
    () => readStored(AVATAR_KEY) ?? AVATARS[Math.floor(Math.random() * AVATARS.length)]!
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
    writeStored("iguess_name", name);
    writeStored("iguess_room", room);
    writeStored(AVATAR_KEY, avatar);
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
  const brush = useBrush(COLORS[0]!);
  const roundOps = useRef<DrawOp[]>([]);
  // Only auto-scroll when they are already at the bottom. Someone reading back through the
  // chat should not get yanked to the end every time a message arrives.
  const [inviteResult, setInviteResult] = useState<"copied" | "shared" | null>(null);
  const [flexed, setFlexed] = useState(false);
  const { toast, showToast, hideToast } = useToast();
  const { muted, toggleMuted } = useMuted();
  const [burstKey, setBurstKey] = useState(0);
  const [botGuess, setBotGuess] = useState<string | null>(null);
  const aiMsgCount = useRef(0);
  const [winConfetti, setWinConfetti] = useState(48);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);

  const [savingEvidence, setSavingEvidence] = useState(false);
  const [gallery, setGallery] = useState<GalleryShot[]>([]);
  // `botGuess` clears itself after a few seconds, so by the end of a turn it is usually empty.
  // The gallery needs whatever the machine said LAST, which is the whole joke.
  const lastGuess = useRef<{ guess: string | null; right: boolean }>({ guess: null, right: false });
  const prevGuessed = useRef<string[]>([]);

  const {
    phase,
    isDrawer,
    youAreHost,
    humans,
    watching,
    youAreWatching,
    readyCount,
    youAreReady,
    canDraw,
    drawingNow,
    inGame,
    ranked,
    hasAI,
    aiGuessedRight,
    soloWaiting,
  } = roomView(game, players, you);
  const awards = phase === "ended" ? awardsFor(gallery, players) : [];
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
      showToast("🎨 you're up, cook!");
      blip([523, 784], muted); // little "ping!"
      buzz([18, 60, 18]);
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
      showToast("✅ nailed it! big brain 🧠", 2400);
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
      showToast(streak > 1 ? `🏆 dub! ${streak} in a row 🔥` : pick(WIN_LINES), 2000);
    } else {
      setWinConfetti(48);
      blip([330, 247], muted); // sad trombone-ish
      buzz(140);
      showToast(pick(LOSS_LINES), 2000);
    }
  }, [phase]);

  // The drawer sees the word. Everyone else sees one tile per letter, filling in over time.
  const wordLetters = isDrawer
    ? (myWord ?? "").split("")
    : game?.hint
      ? game.hint.split("").map((ch) => (ch === "_" ? "" : ch))
      : Array.from({ length: game?.wordLength ?? 0 }, () => "");

  const modeMeta = MODES.find((m) => m.value === effectiveMode);
  // Keep the winning guess, not the last wrong one.
  if (aiGuessedRight) lastGuess.current = { ...lastGuess.current, right: true };

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

  const standings = { ranked, scores: game?.scores ?? {}, youId: you?.id ?? null };

  const saveEvidence = async () => {
    if (savingEvidence || gallery.length === 0) return;
    setSavingEvidence(true);
    try {
      const blob = await renderEvidencePng(gallery, scoreLine(standings), awardsFor(gallery, players));
      await shareOrDownload(blob, `iguess-evidence-${room}.png`, {
        title: "iguess evidence",
        text: "the drawings, the score, and what the AI thought it saw",
      });
    } catch {
      /* nothing to do about it, and nothing worth interrupting the end screen for */
    } finally {
      setSavingEvidence(false);
    }
  };

  // Read at click time, not on render: getStreak hits storage and the score can still move.
  const brag = (): string =>
    flexText(standings, {
      modeLabel: modeMeta?.label ?? effectiveMode,
      inviteUrl: inviteLink(room, effectiveMode),
      streak: getStreak(),
    });

  const handleFlex = async () => {
    const ok = await copyText(brag());
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
          onClick={hideToast}
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
      <RoomSidebar
        room={room}
        modeIcon={modeMeta?.icon}
        modeLabel={modeMeta?.label ?? effectiveMode}
        connected={connected}
        everConnected={everConnected}
        inviteResult={inviteResult}
        onInvite={handleInvite}
        muted={muted}
        onToggleMute={toggleMuted}
        onLeave={onLeave}
      >
        <Scoreboard
          ranked={ranked}
          game={game}
          youId={you?.id ?? null}
          youAreHost={youAreHost}
          onKick={kick}
        />
      </RoomSidebar>

      <section className="pane-canvas" style={styles.canvasPane}>
        <div className="glass play-banner" style={styles.banner}>
          {phase === "lobby" && (
            <>
              <span style={styles.bannerText}>
                {lobbyStatus({
                  youAreWatching,
                  soloWaiting,
                  isAIMode,
                  readyCount,
                  humanCount: humans.length,
                  watchingCount: watching.length,
                })}
              </span>
              <HostSettings
                settings={settings}
                youAreHost={youAreHost}
                isAIMode={isAIMode}
                onChange={updateSettings}
              />
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
                onClick={() => shareToX(brag())}
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

        <DrawToolbar
          brush={brush}
          canDraw={canDraw}
          onUndo={() => sendDraw({ kind: "undo" })}
          onSave={() => canvasElRef.current && saveCanvasPng(canvasElRef.current, room)}
          onClear={clearBoard}
        />

        <div className="canvas-wrap" style={styles.canvasWrap}>
          <DrawingCanvas
            sendDraw={sendDraw}
            subscribeDraw={subscribeDraw}
            color={brush.color}
            width={brush.width}
            erasing={brush.erasing}
            filling={brush.filling}
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
          <EndScreen
            gallery={gallery}
            awards={awards}
            onSave={saveEvidence}
            saving={savingEvidence}
          />
        )}
      </section>

      <ChatPanel
        log={log}
        drawingNow={drawingNow}
        inGame={inGame}
        onReact={react}
        onSend={sendChat}
        onSendFailed={() => showToast("not sent, still reconnecting 👀")}
      />
    </div>
  );
}

function playerName(players: { id: string; name: string }[], id: string) {
  return players.find((p) => p.id === id)?.name ?? "Someone";
}
