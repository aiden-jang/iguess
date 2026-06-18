import { useEffect, useState } from "react";
import { useGameSocket } from "./useWebSocket";
import { DrawingCanvas } from "./DrawingCanvas";

const COLORS = ["#111111", "#e11d48", "#2563eb", "#16a34a", "#f59e0b", "#ffffff"];

const MODES = [
  { value: "classic", label: "Classic", blurb: "Humans only", icon: "🎨" },
  { value: "ai", label: "AI Guesser", blurb: "🤖 races to guess", icon: "🔍" },
  { value: "ai-drawer", label: "AI Drawer", blurb: "🤖 draws, you guess", icon: "🖌️" },
  { value: "team-battle", label: "Team Battle", blurb: "Humans vs 🤖", icon: "⚔️" },
];

const isAI = (id?: string | null) => !!id && id.startsWith("ai-");

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
  // Simple join gate: pick a name + room, then connect.
  const [draftName, setDraftName] = useState("");
  const [draftRoom, setDraftRoom] = useState("lobby");
  const [draftMode, setDraftMode] = useState("classic");
  const [joined, setJoined] = useState<{
    name: string;
    room: string;
    mode: string;
  } | null>(null);

  if (!joined) {
    return (
      <div style={styles.gate}>
        <div style={styles.card}>
          <div style={styles.brand}>
            <span style={styles.brandMark}>🐶</span>
            <div>
              <h1 style={styles.title}>is it a dog?</h1>
              <p style={styles.subtitle}>real-time multiplayer drawing &amp; guessing</p>
            </div>
          </div>

          <label style={styles.fieldLabel}>Your name</label>
          <input
            placeholder="e.g. Ada"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            style={styles.input}
            autoFocus
          />

          <label style={styles.fieldLabel}>Room</label>
          <input
            placeholder="lobby"
            value={draftRoom}
            onChange={(e) => setDraftRoom(e.target.value)}
            style={styles.input}
          />

          <label style={styles.fieldLabel}>Game mode</label>
          <div style={styles.modeGrid}>
            {MODES.map((m) => {
              const active = m.value === draftMode;
              return (
                <button
                  key={m.value}
                  onClick={() => setDraftMode(m.value)}
                  style={{
                    ...styles.modeCard,
                    ...(active ? styles.modeCardActive : null),
                  }}
                >
                  <span style={styles.modeIcon}>{m.icon}</span>
                  <span style={styles.modeLabel}>{m.label}</span>
                  <span style={styles.modeBlurb}>{m.blurb}</span>
                </button>
              );
            })}
          </div>
          <small style={styles.hint}>
            Mode is locked in by whoever creates the room first.
          </small>

          <button
            style={{
              ...styles.button,
              ...styles.buttonBig,
              ...(draftName.trim() ? null : styles.buttonDisabled),
            }}
            disabled={!draftName.trim()}
            onClick={() =>
              setJoined({
                name: draftName.trim(),
                room: draftRoom.trim() || "lobby",
                mode: draftMode,
              })
            }
          >
            Join game →
          </button>
        </div>
      </div>
    );
  }

  return <Room name={joined.name} room={joined.room} mode={joined.mode} />;
}

function Countdown({ endsAt }: { endsAt: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);
  if (!endsAt) return null;
  const secs = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const low = secs <= 10;
  return (
    <span style={{ ...styles.timer, ...(low ? styles.timerLow : null) }}>
      ⏱ {secs}s
    </span>
  );
}

function Room({ name, room, mode }: { name: string; room: string; mode: string }) {
  const {
    connected,
    you,
    players,
    log,
    game,
    myWord,
    sendChat,
    sendDraw,
    subscribeDraw,
    clearBoard,
    startGame,
  } = useGameSocket(room, name, mode);
  const [text, setText] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(4);

  const phase = game?.phase ?? "lobby";
  const isDrawer = !!game && game.drawerId === you?.id;
  const canDraw = phase === "playing" && isDrawer;
  const inGame = phase === "playing" || phase === "intermission";

  // Word line: drawer sees the real word; guessers see one tile per letter.
  const wordLetters = isDrawer
    ? (myWord ?? "").split("")
    : Array.from({ length: game?.wordLength ?? 0 }, () => "");

  // Players sorted by score for the scoreboard.
  const ranked = [...players].sort(
    (a, b) => (game?.scores[b.id] ?? 0) - (game?.scores[a.id] ?? 0)
  );

  const modeMeta = MODES.find((m) => m.value === mode);

  return (
    <div style={styles.layout}>
      {/* ---- Sidebar: roster + scores ---- */}
      <aside style={styles.sidebar}>
        <div style={styles.roomHead}>
          <span style={styles.roomMark}>🐶</span>
          <div style={{ minWidth: 0 }}>
            <div style={styles.roomName}>#{room}</div>
            <div style={styles.roomMode}>
              {modeMeta?.icon} {modeMeta?.label ?? mode}
            </div>
          </div>
        </div>

        <div
          style={{
            ...styles.statusPill,
            ...(connected ? styles.statusOk : styles.statusBad),
          }}
        >
          <span style={styles.statusDot} /> {connected ? "Connected" : "Reconnecting…"}
        </div>

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
            <li style={styles.emptyRoster}>Waiting for players…</li>
          )}
        </ul>
      </aside>

      {/* ---- Canvas pane ---- */}
      <section style={styles.canvasPane}>
        <div style={styles.banner}>
          {phase === "lobby" && (
            <>
              <span style={styles.bannerText}>
                Lobby · {players.length} player{players.length === 1 ? "" : "s"}
              </span>
              <button style={{ ...styles.button, marginLeft: "auto" }} onClick={startGame}>
                Start game
              </button>
            </>
          )}
          {phase === "ended" && (
            <>
              <span style={styles.bannerText}>🏁 Game over!</span>
              <button style={{ ...styles.button, marginLeft: "auto" }} onClick={startGame}>
                Play again
              </button>
            </>
          )}
          {inGame && (
            <>
              <span style={styles.turnPill}>
                Turn {(game?.turnIndex ?? 0) + 1}/{game?.totalTurns ?? 0}
              </span>
              <span style={styles.wordZone}>
                <span style={styles.wordVerb}>{isDrawer ? "Draw" : "Guess"}</span>
                <span style={styles.tiles}>
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

        <div style={styles.toolbar}>
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
            onChange={(e) => setWidth(Number(e.target.value))}
            style={{ accentColor: "var(--accent)" }}
          />
          <span style={widthDot(width, color, canDraw)} />
          <button
            style={{ ...styles.ghostButton, marginLeft: "auto" }}
            onClick={clearBoard}
            disabled={!canDraw}
          >
            Clear
          </button>
        </div>

        <div style={styles.canvasWrap}>
          <DrawingCanvas
            sendDraw={sendDraw}
            subscribeDraw={subscribeDraw}
            color={color}
            width={width}
            canDraw={canDraw}
          />
          {!canDraw && inGame && (
            <div style={styles.canvasHintBadge}>
              {isAI(game?.drawerId)
                ? "🤖 AI is drawing"
                : `${playerName(players, game?.drawerId ?? "")} is drawing`}
            </div>
          )}
        </div>
      </section>

      {/* ---- Chat ---- */}
      <main style={styles.main}>
        <div style={styles.sectionLabel}>Chat &amp; guesses</div>
        <div style={styles.chatLog}>
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
          {log.length === 0 && <div style={styles.system}>No messages yet — say hi 👋</div>}
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
              canDraw ? "You're drawing…" : inGame ? "Type your guess…" : "Type a message…"
            }
            disabled={canDraw}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button style={styles.button} type="submit" disabled={canDraw}>
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
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 20,
    padding: 28,
    boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
  },
  brand: { display: "flex", alignItems: "center", gap: 14, marginBottom: 22 },
  brandMark: {
    fontSize: 40,
    lineHeight: 1,
    filter: "drop-shadow(0 4px 10px rgba(99,102,241,0.5))",
  },
  title: {
    margin: 0,
    fontFamily: "'Fredoka', sans-serif",
    fontSize: 30,
    fontWeight: 700,
    letterSpacing: "-0.01em",
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
    border: "1px solid var(--line)",
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
  hint: { display: "block", color: "var(--muted)", fontSize: 12, margin: "12px 0 4px" },

  // ---- Layout ----
  layout: {
    display: "grid",
    gridTemplateColumns: "240px minmax(0,1fr) 320px",
    height: "100vh",
    gap: 1,
    background: "var(--line)",
  },
  sidebar: {
    background: "var(--panel)",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    overflow: "hidden",
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
  canvasPane: {
    background: "var(--bg)",
    display: "flex",
    flexDirection: "column",
    padding: 18,
    gap: 12,
    minWidth: 0,
  },
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "10px 14px",
    background: "var(--panel)",
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
  timer: {
    marginLeft: "auto",
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
    color: "var(--muted)",
  },
  timerLow: { color: "#f87171" },

  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 12,
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
    background: "var(--panel)",
    display: "flex",
    flexDirection: "column",
    padding: 18,
    gap: 12,
    minWidth: 0,
  },
  chatLog: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    paddingRight: 4,
  },
  chatLine: { fontSize: 14, lineHeight: 1.4 },
  chatFrom: { fontWeight: 700, marginRight: 6, color: "var(--accent-2)" },
  chatFromAI: { color: "#fbbf24" },
  chatText: { color: "var(--text)", wordBreak: "break-word" },
  system: { color: "var(--muted)", fontStyle: "italic", fontSize: 13 },
  inputRow: { display: "flex", gap: 8 },

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
    fontWeight: 600,
    cursor: "pointer",
    border: "none",
    borderRadius: 10,
    background: "var(--accent)",
    color: "white",
  },
  buttonBig: { width: "100%", marginTop: 18, padding: "13px 16px", fontSize: 15 },
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
