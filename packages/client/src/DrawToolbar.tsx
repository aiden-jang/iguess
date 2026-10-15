import { useEffect, useState } from "react";
import { widthDot } from "./brushStyle";
import type { Brush } from "./useBrush";
import { useDrawingShortcuts } from "./useDrawingShortcuts";
import { PalettePicker } from "./PalettePicker";
import { ConfirmButton } from "./ConfirmButton";
import { Icon } from "./Icon";
import { modifierKey } from "./keyboardLabel";
interface Props {
  brush: Brush;
  canDraw: boolean;
  onUndo: () => void;
  onSave: () => unknown;
  onClear: () => void;
}
export function DrawToolbar({
  brush,
  canDraw,
  onUndo,
  onSave,
  onClear,
}: Props) {
  const [saveFeedback, setSaveFeedback] = useState("");
  useDrawingShortcuts(brush, canDraw, onUndo);
  useEffect(() => {
    if (!saveFeedback) return;
    const timer = setTimeout(() => setSaveFeedback(""), 3000);
    return () => clearTimeout(timer);
  }, [saveFeedback]);
  const save = () => {
    try {
      const result = onSave();
      setSaveFeedback(
        result === false || result === null
          ? "Couldn’t prepare the image. Try again."
          : "Download started.",
      );
    } catch {
      setSaveFeedback("Couldn’t prepare the image. Try again.");
    }
  };
  return (
    <div
      role="group"
      aria-label="Drawing tools"
      className="glass draw-toolbar"
      data-editable={canDraw}
    >
      {canDraw ? (
        <>
          <PalettePicker color={brush.color} onChange={brush.pickColor} />
          <div className="pen-controls">
            <button
              className="tool-button"
              aria-pressed={!brush.erasing && !brush.filling}
              aria-keyshortcuts="B"
              onClick={brush.selectPen}
              title="Pen (B)"
            >
              <Icon name="pen" />
              <span>Pen</span>
            </button>
            <button
              className="tool-button"
              aria-pressed={brush.erasing}
              aria-keyshortcuts="E"
              onClick={brush.toggleErasing}
              title="eraser"
            >
              <Icon name="erase" />
              <span>Erase</span>
            </button>
            <button
              className="tool-button"
              aria-pressed={brush.filling}
              aria-keyshortcuts="F"
              onClick={brush.toggleFilling}
              title="fill an area with the current colour"
            >
              <Icon name="fill" />
              <span>Fill</span>
            </button>
            <label className="brush-size" title="Brush size">
              <span className="sr-only">Brush size</span>
              <input
                type="range"
                min={1}
                max={32}
                value={brush.width}
                onChange={(event) => brush.setWidth(Number(event.target.value))}
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
              aria-keyshortcuts="Control+Z Meta+Z"
            >
              <Icon name="undo" />
              <span>Undo</span>
            </button>
            <ConfirmButton
              className="tool-button"
              title="Clear this drawing?"
              description="This removes every stroke from the current board. It cannot be undone."
              confirmLabel="Clear drawing"
              onConfirm={onClear}
            >
              Clear
            </ConfirmButton>
          </div>
        </>
      ) : (
        <span className="viewer-note">Live canvas. Save a copy anytime.</span>
      )}
      <button
        className="tool-button save-drawing"
        onClick={save}
        title="save the masterpiece"
      >
        <Icon name="save" />
        <span>Save</span>
      </button>
      {saveFeedback && (
        <span className="tool-feedback" role="status">
          {saveFeedback}
        </span>
      )}
      {canDraw && (
        <span className="tool-shortcuts">
          B Pen · E Erase · F Fill · {modifierKey()} Z Undo
        </span>
      )}
    </div>
  );
}
