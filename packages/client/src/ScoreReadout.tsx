import { useEffect, useRef, useState } from "react";
export function ScoreReadout({ points }: { points?: number }) {
  const previous = useRef(points);
  const [gain, setGain] = useState(0);
  useEffect(() => {
    const difference =
      points === undefined || previous.current === undefined
        ? 0
        : points - previous.current;
    previous.current = points;
    setGain(Math.max(0, difference));
    const timer = setTimeout(() => setGain(0), 2600);
    return () => clearTimeout(timer);
  }, [points]);
  return (
    <span
      className="score-readout"
      aria-live="polite"
      aria-atomic="true"
      aria-label={`Your score: ${points ?? 0} points${gain ? `, gained ${gain}` : ""}`}
    >
      <span key={points} className={gain ? "score-gain" : undefined}>
        {points ?? 0} pt
      </span>
      {gain > 0 && <small>+{gain}</small>}
    </span>
  );
}
