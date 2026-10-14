import type { MutableRefObject } from "react";
import type { DrawOp, Point } from "@iguess/shared";
import { DrawingCanvas } from "./DrawingCanvas";
import { Dots } from "./Dots";
import type { Brush } from "./useBrush";
import { styles } from "./styles";

/** The live drawing surface of the socket, which is all the board needs from it. */
export interface BoardSocket {
  sendDraw: (op: DrawOp) => void;
  subscribeDraw: (fn: (op: DrawOp | { kind: "reset" }) => void) => () => void;
  socketBacklog: () => number;
  sendCursor: (point: Point | null) => void;
  peerCursor: Point | null;
  reactions: { id: number; emoji: string; at: number }[];
}

/** What the bot has to say about the drawing, or null when it is not in this round. */
export interface AiTake {
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
}: GameBoardProps) {
  return (
    <div className="canvas-wrap" style={styles.canvasWrap}>
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
        onCanvas={onCanvas}
      />
      {socket.reactions.map((r) => (
        <span
          key={r.id}
          aria-hidden
          className="reaction-float"
          style={{ left: `${8 + r.at * 84}%` }}
        >
          {r.emoji}
        </span>
      ))}
      {hint && (
        <div style={styles.canvasHintBadge}>
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
            <>AI is thinking<Dots /></>
          )}
        </div>
      )}
    </div>
  );
}
