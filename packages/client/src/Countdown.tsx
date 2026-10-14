import { useEffect, useRef, useState } from "react";
import { buzz } from "./feedback";
import { styles } from "./styles";

export function Countdown({
  endsAt,
  durationMs,
}: {
  endsAt: number | null;
  durationMs: number;
}) {
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
  const frac = timerFraction(msLeft, durationMs);
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

export function timerFraction(msLeft: number, durationMs: number): number {
  return durationMs > 0 ? Math.max(0, Math.min(1, msLeft / durationMs)) : 0;
}
