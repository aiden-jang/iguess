import { useEffect, useState } from "react";
// The stylesheet already hides confetti for people who asked for less motion, but hidden
// pieces still get built. Don't make 160 of them for someone who won't see any.
const stillPlease = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Confetti({ go, count = 48 }: { go: boolean; count?: number }) {
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
