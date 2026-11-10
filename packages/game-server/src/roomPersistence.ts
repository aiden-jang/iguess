import { CheckpointStore } from "./checkpointStore.ts";
import type { ServerMessage } from "@iguess/shared";
interface CheckpointExtra {
  write(txn: DurableObjectTransaction): Promise<void>;
  committed(): void;
}
export class RoomPersistence<T> {
  private disposed = false;
  private resolveDelay: (() => void) | null = null;
  private version = 0;
  private saved = 0;
  private flushing: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  readonly store: CheckpointStore<T>;
  constructor(
    private ctx: DurableObjectState,
    private snapshot: () => T,
    private extras?: () => CheckpointExtra,
  ) {
    this.store = new CheckpointStore(ctx.storage);
  }
  message(type: ServerMessage["type"]) {
    if (
      ![
        "chat",
        "system",
        "cursor",
        "react",
        "relay_progress",
        "relay_notice",
      ].includes(type)
    )
      this.changed();
  }
  changed(delayMs = 250) {
    if (this.disposed) return;
    this.version++;
    this.schedule(delayMs);
  }
  private schedule(delayMs: number, retries = 3) {
    if (this.disposed || this.timer) return;
    const task = new Promise<void>((resolve) => {
      this.resolveDelay = resolve;
      this.timer = setTimeout(() => {
        this.timer = null;
        this.resolveDelay = null;
        resolve();
      }, delayMs);
    }).then(() => this.flush());
    this.ctx.waitUntil(
      task.catch((error) => {
        if (retries > 0) this.schedule(Math.max(250, delayMs * 2), retries - 1);
        else console.error("Room checkpoint failed", error);
      }),
    );
  }
  async dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.resolveDelay?.();
    this.resolveDelay = null;
    await this.flushing?.catch(() => {});
  }
  reopen() {
    this.version = this.saved = 0;
    this.disposed = false;
  }
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = (async () => {
      while (!this.disposed && this.saved < this.version) {
        const version = this.version;
        const extra = this.extras?.();
        await this.store.save(this.snapshot(), extra?.write);
        extra?.committed();
        this.saved = version;
      }
    })().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }
}
