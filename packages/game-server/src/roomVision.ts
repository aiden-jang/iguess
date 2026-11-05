import type { DrawOp } from "@iguess/shared";
import type { Env } from "./env.ts";
import type { GameEngine } from "./engine.ts";
import { requestAIGuess } from "./services/aiWorkerClient.ts";

const MAX_AI_CALLS_PER_ROOM = 240;

interface VisionRoom {
  env: () => Env;
  engine: () => GameEngine | null;
  drawing: () => DrawOp[];
  checkpoint: () => Promise<void>;
  usedMock: () => void;
}

export class RoomVision {
  count = 0;
  saidMock = false;

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
    if (this.count >= MAX_AI_CALLS_PER_ROOM)
      throw new Error("Room AI budget spent");
    this.count++;
    await this.room.checkpoint();
    if (!current()) throw new Error("Turn ended");
    const env = this.room.env();
    const said = await requestAIGuess(
      env.AI_WORKER_URL,
      env.AI_SHARED_SECRET,
      this.room.drawing(),
      game?.currentHint(),
    );
    if (!current()) throw new Error("Turn ended");
    if (said.provider === "mock" && !this.saidMock) {
      this.saidMock = true;
      this.room.usedMock();
    }
    return said;
  };
}
