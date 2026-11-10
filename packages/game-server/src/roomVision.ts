import type { DrawOp } from "@iguess/shared";
import { hasRelayInk } from "@iguess/shared/relay";
import type { Env } from "./env.ts";
import type { GameEngine } from "./engine.ts";
import { requestAIGuess } from "./services/aiWorkerClient.ts";

const MAX_AI_CALLS_PER_ROOM = 240;

interface VisionRoom {
  env: () => Env;
  engine: () => GameEngine | null;
  drawing: () => DrawOp[];
  drawingRevision?: () => number;
  checkpoint: () => Promise<void>;
  usedMock: () => void;
}

export class RoomVision {
  count = 0;
  saidMock = false;
  private lastInput: string | null = null;

  constructor(private room: VisionRoom) {}

  guess = async () => {
    const game = this.room.engine();
    const revision = game?.turnRevision;
    const current = () =>
      game &&
      this.room.engine() === game &&
      game.currentPhase === "playing" &&
      game.turnRevision === revision;
    if (!current()) throw new Error("Turn ended");
    const ops = this.room.drawing();
    const hint = game?.currentHint();
    const key = `${revision}:${this.room.drawingRevision?.() ?? JSON.stringify(ops)}:${hint}`;
    if (this.lastInput === key || !hasRelayInk(ops))
      return { guess: "", alternatives: [] };
    const env = this.room.env();
    if (!env.AI_WORKER_URL) throw new Error("Live AI is unavailable");
    if (this.count >= MAX_AI_CALLS_PER_ROOM)
      throw new Error("Room AI budget spent");
    const drawing = ops.slice();
    this.count++;
    await this.room.checkpoint();
    if (!current()) throw new Error("Turn ended");
    const said = await requestAIGuess(
      env.AI_WORKER_URL,
      env.AI_SHARED_SECRET,
      drawing,
      hint,
    );
    if (!current()) throw new Error("Turn ended");
    this.lastInput = key;
    if (said.provider === "mock" && !this.saidMock) this.room.usedMock();
    this.saidMock = said.provider === "mock";
    return said;
  };
}
