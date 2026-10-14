import { useEffect, useState } from "react";
import { COLORS, COLOR_NAMES, widthDot } from "./brushStyle";
import type { Brush } from "./useBrush";
import { useDrawingShortcuts } from "./useDrawingShortcuts";
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
  useDrawingShortcuts(brush, canDraw, onUndo);
  useEffect(() => {
    if (!confirmClear) return;
    const timer = setTimeout(() => setConfirmClear(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmClear]);
  useEffect(() => setConfirmClear(false), [canDraw]);
  return (
    <div
      role="group"
      aria-label="Drawing tools"
      className="glass draw-toolbar"
      data-editable={canDraw}
      style={styles.toolbar}
    >
      {canDraw ? (
        <>
          <div className="ink-palette" role="group" aria-label="Ink colors">
            {COLORS.map((color) => (
              <button
                key={color}
                className="color-swatch"
                onClick={() => brush.pickColor(color)}
                style={{ ...styles.swatch, background: color }}
                aria-label={`Color ${COLOR_NAMES[color]}`}
                title={COLOR_NAMES[color]}
                aria-pressed={color === brush.color}
              >
                <span aria-hidden>{color === brush.color ? "✓" : ""}</span>
              </button>
            ))}
          </div>
          <div className="pen-controls">
            <button
              className="tool-button"
              aria-pressed={!brush.erasing && !brush.filling}
              onClick={brush.selectPen}
              title="Pen (B)"
            >
              ✎ <span>Pen</span>
            </button>
            <button
              className="tool-button"
              aria-pressed={brush.erasing}
              onClick={brush.toggleErasing}
              title="eraser"
            >
              ⌫ <span>Erase</span>
            </button>
            <button
              className="tool-button"
              aria-pressed={brush.filling}
              onClick={brush.toggleFilling}
              title="fill an area with the current colour"
            >
              ▧ <span>Fill</span>
            </button>
            <label className="brush-size" title="Brush size">
              <span className="sr-only">Brush size</span>
              <input
                type="range"
                min={1}
                max={32}
                value={brush.width}
                onChange={(e) => brush.setWidth(Number(e.target.value))}
              />
              <span
                aria-hidden
                style={widthDot(brush.width, brush.color, canDraw)}
              />
              <output>{brush.width}</output>
            </label>
          </div>
          <div className="canvas-actions">
            <button
              className="tool-button"
              onClick={onUndo}
              title="undo the last stroke"
            >
              ↶ <span>Undo</span>
            </button>
            <button
              className="tool-button"
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
            >
              {confirmClear ? "Clear drawing?" : "Clear"}
            </button>
          </div>
        </>
      ) : (
        <span className="viewer-note">Live canvas. Save a copy anytime.</span>
      )}
      <button
        className="tool-button save-drawing"
        onClick={onSave}
        title="save the masterpiece"
      >
        ↓ <span>Save</span>
      </button>
      {confirmClear && (
        <span className="clear-note" role="status">
          Press again to clear. This cannot be undone.
        </span>
      )}
    </div>
  );
}
