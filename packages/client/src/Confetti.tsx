import { useEffect, useState } from "react";
import { MOTION_KEY, preference } from "./usePreference";

const reducedMotion = () =>
  !preference(MOTION_KEY, true) ||
  (typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches);
interface Piece {
  id: number;
  left: number;
  delay: number;
  duration: number;
  color: string;
}

export function Confetti({ go, count = 14 }: { go: boolean; count?: number }) {
  const [pieces, setPieces] = useState<Piece[]>([]);
  useEffect(() => {
    if (!go || reducedMotion()) {
      setPieces([]);
      return;
    }
    const colors = ["#d8ed79", "#e6ad96", "#92a484", "#e8ebdf"];
    setPieces(
      Array.from({ length: count }, (_, id) => ({
        id,
        left: Math.random() * 100,
        delay: Math.random() * 0.3,
        duration: 2.2 + Math.random(),
        color: colors[id % colors.length]!,
      })),
    );
    const timer = setTimeout(() => setPieces([]), 3600);
    return () => clearTimeout(timer);
  }, [go, count]);
  return (
    <>
      {pieces.map((piece) => (
        <i
          key={piece.id}
          aria-hidden
          className="confetti-piece"
          style={{
            left: `${piece.left}vw`,
            width: 6,
            height: 11,
            background: piece.color,
            animation: `confettiFall ${piece.duration}s linear ${piece.delay}s both`,
          }}
        />
      ))}
    </>
  );
}
