import { styles } from "./styles";

export function RoomError({
  reason,
  onLeave,
}: {
  reason: string;
  onLeave: () => void;
}) {
  return (
    <div style={styles.gate}>
      <div className="glass pop-in" style={styles.card} role="alert">
        <div style={styles.brand}>
          <span aria-hidden style={{ fontSize: 40 }}>
            🚪
          </span>
          <h1 style={{ fontWeight: 700, fontSize: 24, margin: 0 }}>
            Couldn’t join this room
          </h1>
        </div>
        <p
          style={{ color: "var(--muted)", lineHeight: 1.5, margin: "0 0 20px" }}
        >
          {reason}
        </p>
        <button
          className="lift"
          style={{ ...styles.button, ...styles.buttonBig }}
          onClick={onLeave}
        >
          Back to join
        </button>
      </div>
    </div>
  );
}
