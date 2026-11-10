import type { DrawOp, GameModeName, ServerMessage } from "@iguess/shared";
import type { GalleryMessage, GalleryTurn } from "@iguess/shared/gallery";
import { deleteChunks, readChunks, writeChunks } from "./checkpointStore.ts";
import type { TurnContext } from "./modes/GameMode.ts";

export interface GallerySnapshot {
  id: string;
  count: number;
  guess: string | null;
}
type ArchivedTurn = { game: string; turn: GalleryTurn };
const key = (index: number) => `gallery:${index}`;

export class RoomGallery {
  private current: GallerySnapshot | undefined;
  private cleanupGame?: string;
  private pending = new Map<number, ArchivedTurn>();

  constructor(private storage: DurableObjectStorage) {}

  snapshot() {
    return this.current && { ...this.current };
  }

  restore(snapshot?: GallerySnapshot) {
    this.current = snapshot;
    this.cleanupGame = undefined;
    this.pending.clear();
  }

  start() {
    const id = crypto.randomUUID();
    this.restore({ id, count: 0, guess: null });
    this.cleanupGame = id;
  }

  observe(message: ServerMessage) {
    if (
      !this.current ||
      message.type !== "chat" ||
      !message.isGuess ||
      !message.from.id.startsWith("ai-")
    )
      return false;
    this.current.guess = message.text.slice(0, 1024);
    return true;
  }

  capture(
    { word, drawerId }: TurnContext,
    artist: string,
    right: boolean,
    mode: GameModeName,
    ops: DrawOp[],
  ) {
    this.current ??= { id: crypto.randomUUID(), count: 0, guess: null };
    const guess = this.current.guess;
    this.pending.set(this.current.count++, {
      game: this.current.id,
      turn: {
        word,
        drawerId,
        artist,
        right,
        ops: ops.slice(),
        guess,
        aiParticipated: mode !== "classic" && !drawerId.startsWith("ai-"),
      },
    });
    this.current.guess = null;
  }

  stage() {
    const entries = [...this.pending];
    const cleanup = this.cleanupGame;
    return {
      write: async (txn: DurableObjectTransaction) => {
        if (cleanup)
          await deleteChunks(
            txn,
            Array.from({ length: 64 }, (_, index) => key(index)),
          );
        for (const [index, entry] of entries)
          await writeChunks(txn, key(index), entry, Number.MAX_SAFE_INTEGER);
      },
      committed: () => {
        if (cleanup === this.cleanupGame) this.cleanupGame = undefined;
        for (const [index, entry] of entries)
          if (this.pending.get(index) === entry) this.pending.delete(index);
      },
    };
  }

  async stream(send: (message: GalleryMessage) => void) {
    const game = this.current;
    let incomplete = false;
    for (let index = 0; game && index < game.count; index++) {
      const entry =
        this.pending.get(index) ??
        (await readChunks<ArchivedTurn>(this.storage, key(index)).catch(
          () => null,
        ));
      if (game !== this.current) return;
      if (entry?.game === game.id)
        send({ type: "gallery_turn", index, turn: entry.turn });
      else incomplete = true;
    }
    send({ type: "gallery_done", incomplete });
  }
}
