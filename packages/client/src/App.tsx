import { useState } from "react";
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

function Room({ name, room }: { name: string; room: string }) {
  const {
    connected,
    you,
    players,
    log,
    sendChat,
    sendDraw,
    subscribeDraw,
    clearBoard,
  } = useGameSocket(room, name);
  const [text, setText] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(4);

  return (
    <div style={styles.layout}>
      <aside style={styles.sidebar}>
        <h3>Room: {room}</h3>
        <p style={{ color: connected ? "green" : "crimson" }}>
          {connected ? "● connected" : "○ disconnected"}
        </p>
        <h4>Players ({players.length})</h4>
        <ul>
          {players.map((p) => (
            <li key={p.id}>
              {p.name}
              {p.id === you?.id ? " (you)" : ""}
            </li>
          ))}
        </ul>
      </aside>

      <section style={styles.canvasPane}>
        <div style={styles.toolbar}>
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{
                ...styles.swatch,
                background: c,
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
            onChange={(e) => setWidth(Number(e.target.value))}
          />
          <button style={styles.button} onClick={clearBoard}>
            Clear
          </button>
        </div>
        <div style={styles.canvasWrap}>
          <DrawingCanvas
            sendDraw={sendDraw}
            subscribeDraw={subscribeDraw}
            color={color}
            width={width}
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
            placeholder="Type a message…"
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
