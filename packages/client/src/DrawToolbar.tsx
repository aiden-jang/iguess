import { useEffect, useState } from "react";
import { COLORS, COLOR_NAMES, widthDot } from "./brushStyle";
import type { Brush } from "./useBrush";
import { styles } from "./styles";

interface DrawToolbarProps {
  brush: Brush;
  canDraw: boolean;
  onUndo: () => void;
  onSave: () => void;
  onClear: () => void;
}

export function DrawToolbar({
  brush,
  canDraw,
  onUndo,
  onSave,
  onClear,
}: DrawToolbarProps) {
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => {
    if (!confirmClear) return;
    const timer = setTimeout(() => setConfirmClear(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmClear]);
  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      className="glass draw-toolbar"
      style={styles.toolbar}
    >
      {COLORS.map((c) => (
        <button
          key={c}
          disabled={!canDraw}
          onClick={() => {
            brush.pickColor(c);
          }}
          style={{
            ...styles.swatch,
            background: c,
            cursor: canDraw ? "pointer" : "default",
            opacity: canDraw ? 1 : 0.35,
            boxShadow:
              c === brush.color
                ? "0 0 0 2px var(--panel), 0 0 0 4px var(--accent)"
                : "none",
            border: c === "#ffffff" ? "1px solid #44495a" : "none",
          }}
          aria-label={`Color ${COLOR_NAMES[c]}`}
          title={COLOR_NAMES[c]}
          aria-pressed={c === brush.color}
        />
      ))}
      <div style={styles.toolDivider} />
      <input
        type="range"
        min={1}
        max={32}
        value={brush.width}
        disabled={!canDraw}
        aria-label="brush size"
        onChange={(e) => brush.setWidth(Number(e.target.value))}
        style={{ accentColor: "var(--accent)" }}
      />
      <span style={widthDot(brush.width, brush.color, canDraw)} />
      <button
        className="lift"
        style={{
          ...styles.ghostButton,
          ...(brush.erasing ? { boxShadow: "0 0 0 2px var(--accent)" } : {}),
        }}
        onClick={() => {
          brush.toggleErasing();
        }}
        disabled={!canDraw}
        aria-pressed={brush.erasing}
        title="eraser"
      >
        ⌫ erase
      </button>
      <button
        className="lift"
        style={{
          ...styles.ghostButton,
          ...(brush.filling ? { boxShadow: "0 0 0 2px var(--accent)" } : {}),
        }}
        onClick={() => {
          brush.toggleFilling();
        }}
        disabled={!canDraw}
        aria-pressed={brush.filling}
        title="fill an area with the current colour"
      >
        🪣 fill
      </button>
      <button
        className="lift"
        style={{ ...styles.ghostButton, marginLeft: "auto" }}
        onClick={onUndo}
        disabled={!canDraw}
        title="undo the last stroke"
      >
        ↶ undo
      </button>
      <button
        className="lift"
        style={styles.ghostButton}
        onClick={onSave}
        title="save the masterpiece"
      >
        🖼️ save
      </button>
      <button
        className="lift"
        style={styles.ghostButton}
        onClick={() => {
          if (confirmClear) {
            onClear();
            setConfirmClear(false);
          } else setConfirmClear(true);
        }}
        onBlur={() => setConfirmClear(false)}
        title={
          confirmClear
            ? "Press again to clear this drawing. This cannot be undone."
            : "Clear the drawing"
        }
        disabled={!canDraw}
      >
        {confirmClear ? "Clear drawing?" : "Clear"}
      </button>
    </div>
  );
}
