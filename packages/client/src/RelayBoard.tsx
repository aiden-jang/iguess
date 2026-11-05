import { useCallback, useEffect, useRef, useState } from "react";
import type { DrawOp } from "@iguess/shared";
import { hasRelayInk } from "@iguess/shared/relay";
import { DrawingCanvas } from "./DrawingCanvas";
import { DrawToolbar } from "./DrawToolbar";
import { useBrush } from "./useBrush";
import { COLORS } from "./brushStyle";
import { saveCanvasPng } from "./canvasExport";

const noop = () => {};
export function RelayBoard({
  ops,
  label,
  editing,
}: {
  ops: DrawOp[];
  label?: string;
  editing?: {
    room: string;
    connected: boolean;
    pending: boolean;
    send: (op: DrawOp) => void;
    pass: () => void;
    backlog: () => number;
  };
}) {
  const brush = useBrush(COLORS[0]!);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const liveOps = useRef<DrawOp[]>(ops);
  const [ink, setInk] = useState(() => hasRelayInk(ops));
  useEffect(() => setInk(hasRelayInk(ops)), [ops]);
  const subscribe = useCallback(
    (listener: (op: DrawOp | { kind: "reset" }) => void) => {
      listener({ kind: "reset" });
      for (const op of ops) listener(op);
      return noop;
    },
    [ops],
  );
  const canDraw = editing?.connected ?? false;
  const save = () =>
    canvas.current && saveCanvasPng(canvas.current, editing!.room);
  const board = (
    <div className="relay-board">
      <DrawingCanvas
        label={label}
        sendDraw={(op) => {
          if (
            !ink &&
            (op.kind === "move" || op.kind === "fill") &&
            hasRelayInk(liveOps.current)
          )
            setInk(true);
          editing?.send(op);
        }}
        subscribeDraw={subscribe}
        opsRef={liveOps}
        color={brush.color}
        width={brush.width}
        erasing={brush.erasing}
        filling={brush.filling}
        canDraw={canDraw}
        onCanvas={(element) => (canvas.current = element)}
        socketBacklog={editing?.backlog}
      />
    </div>
  );
  if (!editing) return board;
  return (
    <div className="relay-workspace">
      <div className="relay-drawing-tools">
        {board}
        {canDraw && (
          <DrawToolbar
            brush={brush}
            canDraw
            onUndo={() => editing.send({ kind: "undo" })}
            onClear={() => editing.send({ kind: "clear" })}
            onSave={save}
          />
        )}
      </div>
      <aside className="relay-board-actions">
        <div>
          <h2>Pass your drawing</h2>
          <p>The next player gets your drawing as their clue.</p>
        </div>
        <button
          type="button"
          className="relay-primary"
          disabled={!canDraw || !ink}
          onClick={editing.pass}
        >
          {editing.pending ? "Passing…" : "Pass drawing"}
        </button>
      </aside>
    </div>
  );
}
