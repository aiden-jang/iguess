import { useEffect } from "react";
import type { Brush } from "./useBrush";

export function useDrawingShortcuts(
  brush: Brush,
  canDraw: boolean,
  onUndo: () => void,
) {
  useEffect(() => {
    if (!canDraw) return;
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches("input, textarea, select") || target.isContentEditable)
        return;
      if (
        !target.closest(".draw-toolbar, .canvas-wrap") ||
        document.querySelector("dialog[open]")
      )
        return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "z" && !event.shiftKey) {
        event.preventDefault();
        onUndo();
      } else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        if (key === "b") brush.selectPen();
        else if (key === "e") brush.toggleErasing();
        else if (key === "f") brush.toggleFilling();
        else return;
        event.preventDefault();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [brush, canDraw, onUndo]);
}
