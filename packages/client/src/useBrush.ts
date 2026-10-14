import { useState } from "react";

export interface Brush {
  color: string;
  width: number;
  erasing: boolean;
  filling: boolean;
  pickColor: (color: string) => void;
  selectPen: () => void;
  setWidth: (width: number) => void;
  toggleErasing: () => void;
  toggleFilling: () => void;
}

// Erasing, filling and painting are one choice, not three toggles: picking any of them cancels
// the others, or you get an eraser that fills.
export function useBrush(initialColor: string): Brush {
  const [color, setColor] = useState(initialColor);
  const [width, setWidth] = useState(4);
  const [erasing, setErasing] = useState(false);
  const [filling, setFilling] = useState(false);

  return {
    color,
    width,
    erasing,
    filling,
    setWidth,
    selectPen: () => {
      setErasing(false);
      setFilling(false);
    },
    pickColor: (next) => {
      setColor(next);
      setErasing(false);
    },
    toggleErasing: () => {
      setErasing((on) => !on);
      setFilling(false);
    },
    toggleFilling: () => {
      setFilling((on) => !on);
      setErasing(false);
    },
  };
}
