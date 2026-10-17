import { ReactionSticker } from "./ReactionSticker";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { DrawOp, Point } from "@iguess/shared";
import { ClubFace } from "./ClubFace";
import { DrawingCanvas } from "./DrawingCanvas";
import { Dots } from "./Dots";
import type { Brush } from "./useBrush";
import { styles } from "./styles";

/** The live drawing surface of the socket, which is all the board needs from it. */
interface BoardSocket {
  sendDraw: (op: DrawOp) => void;
  subscribeDraw: (fn: (op: DrawOp | { kind: "reset" }) => void) => () => void;
  socketBacklog: () => number;
  sendCursor: (point: Point | null) => void;
  peerCursor: Point | null;
  reactions: { id: number; emoji: string; at: number }[];
}

/** What the bot has to say about the drawing, or null when it is not in this round. */
interface AiTake {
  won: boolean;
  guess: string | null;
}

interface GameBoardProps {
  socket: BoardSocket;
  brush: Brush;
  canDraw: boolean;
  opsRef: MutableRefObject<DrawOp[]>;
  onCanvas: (el: HTMLCanvasElement | null) => void;
  /** Why the board is dead, or null when it is not. */
  hint: string | null;
  /** Trailing dots on the hint, for a wait that is going to end on its own. */
  waiting: boolean;
  aiTake: AiTake | null;
  phase: string;
}

export function GameBoard({
  socket,
  brush,
  canDraw,
  opsRef,
  onCanvas,
  hint,
  waiting,
  aiTake,
  phase,
}: GameBoardProps) {
  const [scribbled, setScribbled] = useState(false);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (canDraw && phase === "playing")
      canvas.current?.focus({ preventScroll: true });
  }, [canDraw, phase]);
  useEffect(() => setScribbled(false), [phase]);
  return (
    <div
      className="canvas-wrap"
      style={styles.canvasWrap}
      onPointerDownCapture={() => canDraw && setScribbled(true)}
    >
      <DrawingCanvas
        sendDraw={socket.sendDraw}
        subscribeDraw={socket.subscribeDraw}
        color={brush.color}
        width={brush.width}
        erasing={brush.erasing}
        filling={brush.filling}
        opsRef={opsRef}
        socketBacklog={socket.socketBacklog}
        onCursor={socket.sendCursor}
        peerCursor={socket.peerCursor}
        canDraw={canDraw}
        onCanvas={(element) => {
          canvas.current = element;
          onCanvas(element);
        }}
      />
      {socket.reactions.map((r) => (
        <span
          key={r.id}
          aria-hidden
          className="reaction-float"
          style={{ left: `${8 + r.at * 84}%` }}
        >
          <ReactionSticker emoji={r.emoji} />
        </span>
      ))}
      {phase === "lobby" && !scribbled && (
        <div className="board-watermark" aria-hidden="true">
          <ClubFace />
          <span>A blank canvas. Very on brand.</span>
          <small>Draw here. We’ll call it a warm-up.</small>
        </div>
      )}
      {hint && (
        <div
          className="canvas-hint"
          role="status"
          style={styles.canvasHintBadge}
        >
          {hint}
          {waiting && <Dots />}
        </div>
      )}
      {aiTake && (
        <div
          key={aiTake.won ? "win" : (aiTake.guess ?? "thinking")}
          className="pop-in"
          style={styles.hotTake}
        >
          {aiTake.won ? (
            "AI: got it. Naturally."
          ) : aiTake.guess ? (
            <>🤖 "{aiTake.guess}"</>
          ) : (
            <>
              AI is thinking
              <Dots />
            </>
          )}
        </div>
      )}
    </div>
  );
}
