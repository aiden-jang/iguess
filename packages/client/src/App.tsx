import { useEffect, useState } from "react";
import { useGameSocket } from "./useWebSocket";
import { DrawingCanvas } from "./DrawingCanvas";

const COLORS = ["#111", "#e11d48", "#2563eb", "#16a34a", "#f59e0b", "#fff"];

export function App() {
  // Simple join gate: pick a name + room, then connect.
  const [draftName, setDraftName] = useState("");
  const [draftRoom, setDraftRoom] = useState("lobby");
  const [joined, setJoined] = useState<{ name: string; room: string } | null>(
    null
  );

  if (!joined) {
    return (
      <div style={styles.center}>
        <h1>Drawing Game</h1>
        <input
          placeholder="Your name"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          style={styles.input}
        />
        <input
          placeholder="Room"
          value={draftRoom}
          onChange={(e) => setDraftRoom(e.target.value)}
          style={styles.input}
        />
        <button
          style={styles.button}
          disabled={!draftName.trim()}
          onClick={() =>
            setJoined({ name: draftName.trim(), room: draftRoom.trim() || "lobby" })
          }
        >
          Join
        </button>
      </div>
    );
  }

  return <Room name={joined.name} room={joined.room} />;
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
  return <span style={styles.timer}>⏱ {secs}s</span>;
}

function Room({ name, room }: { name: string; room: string }) {
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
  } = useGameSocket(room, name);
  const [text, setText] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(4);

  const phase = game?.phase ?? "lobby";
  const isDrawer = !!game && game.drawerId === you?.id;
  const canDraw = phase === "playing" && isDrawer;
  const inGame = phase === "playing" || phase === "intermission";

  // Word line: drawer sees the real word; guessers see one underscore per
  // letter (the server never sent them the word).
  const wordDisplay = isDrawer
    ? myWord ?? ""
    : Array.from({ length: game?.wordLength ?? 0 }, () => "_").join(" ");

  // Players sorted by score for the scoreboard.
  const ranked = [...players].sort(
    (a, b) => (game?.scores[b.id] ?? 0) - (game?.scores[a.id] ?? 0)
  );

  return (
    <div style={styles.layout}>
      <aside style={styles.sidebar}>
        <h3>Room: {room}</h3>
        <p style={{ color: connected ? "green" : "crimson" }}>
          {connected ? "● connected" : "○ disconnected"}
        </p>
        <h4>Scores</h4>
        <ul style={styles.scoreList}>
          {ranked.map((p) => (
            <li key={p.id} style={styles.scoreRow}>
              <span>
                {game?.drawerId === p.id ? "✏️ " : ""}
                {game?.guessedIds.includes(p.id) ? "✅ " : ""}
                {p.name}
                {p.id === you?.id ? " (you)" : ""}
              </span>
              <strong>{game?.scores[p.id] ?? 0}</strong>
            </li>
          ))}
        </ul>
      </aside>

      <section style={styles.canvasPane}>
        <div style={styles.banner}>
          {phase === "lobby" && (
            <>
              <span>Waiting in lobby — {players.length} player(s)</span>
              <button style={styles.button} onClick={startGame}>
                Start game
              </button>
            </>
          )}
          {phase === "ended" && (
            <>
              <span>Game over!</span>
              <button style={styles.button} onClick={startGame}>
                Play again
              </button>
            </>
          )}
          {inGame && (
            <>
              <span>
                Turn {(game?.turnIndex ?? 0) + 1}/{game?.totalTurns ?? 0}
              </span>
              <span style={styles.word}>
                {isDrawer ? "Draw: " : "Guess: "}
                <strong>{wordDisplay}</strong>
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
                opacity: canDraw ? 1 : 0.4,
                outline: c === color ? "3px solid #4f46e5" : "1px solid #ccc",
              }}
              aria-label={`color ${c}`}
            />
          ))}
          <input
            type="range"
            min={1}
            max={32}
            value={width}
            disabled={!canDraw}
            onChange={(e) => setWidth(Number(e.target.value))}
          />
          <button style={styles.button} onClick={clearBoard} disabled={!canDraw}>
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
        </div>
      </section>

      <main style={styles.main}>
        <div style={styles.chatLog}>
          {log.map((line, i) =>
            line.kind === "system" ? (
              <div key={i} style={styles.system}>
                — {line.text}
              </div>
            ) : (
              <div key={i}>
                <strong>{line.from?.name}:</strong> {line.text}
              </div>
            )
          )}
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
                ? "You're drawing…"
                : inGame
                ? "Type your guess…"
                : "Type a message…"
            }
            disabled={canDraw}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button style={styles.button} type="submit">
            Send
          </button>
        </form>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  center: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    marginTop: 80,
    fontFamily: "sans-serif",
  },
  layout: { display: "flex", height: "100vh", fontFamily: "sans-serif" },
  sidebar: { width: 200, borderRight: "1px solid #ddd", padding: 16 },
  canvasPane: {
    flex: 2,
    display: "flex",
    flexDirection: "column",
    padding: 16,
    gap: 8,
    minWidth: 0,
  },
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "8px 12px",
    background: "#f5f5f7",
    borderRadius: 6,
    minHeight: 24,
  },
  word: { fontSize: 18, letterSpacing: 2 },
  timer: { marginLeft: "auto", fontWeight: 600 },
  scoreList: { listStyle: "none", padding: 0, margin: 0 },
  scoreRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "4px 0",
    borderBottom: "1px solid #f0f0f0",
  },
  toolbar: { display: "flex", alignItems: "center", gap: 8 },
  swatch: {
    width: 24,
    height: 24,
    borderRadius: "50%",
    cursor: "pointer",
    border: "none",
  },
  canvasWrap: { flex: 1, minHeight: 0 },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    padding: 16,
    borderLeft: "1px solid #ddd",
    minWidth: 280,
  },
  chatLog: {
    flex: 1,
    overflowY: "auto",
    border: "1px solid #eee",
    padding: 12,
    marginBottom: 12,
  },
  system: { color: "#888", fontStyle: "italic" },
  inputRow: { display: "flex", gap: 8 },
  input: {
    padding: 8,
    fontSize: 14,
    border: "1px solid #ccc",
    borderRadius: 4,
    margin: 4,
  },
  button: {
    padding: "8px 16px",
    fontSize: 14,
    cursor: "pointer",
    border: "none",
    borderRadius: 4,
    background: "#4f46e5",
    color: "white",
  },
};
