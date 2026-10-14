import { CheckpointStore } from "./checkpointStore.ts";
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
  ) {
    this.store = new CheckpointStore(ctx.storage);
  }
  changed() {
    if (this.disposed) return;
    this.version++;
    if (this.timer) return;
    const task = new Promise<void>((resolve) => {
      this.resolveDelay = resolve;
      this.timer = setTimeout(() => {
        this.timer = null;
        this.resolveDelay = null;
        resolve();
      }, 250);
    }).then(() => this.flush());
    this.ctx.waitUntil(
      task.catch((error) =>
        console.error(
          "Room checkpoint failed",
          error instanceof Error ? error.message : "storage error",
        ),
      ),
    );
  }
  async dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.resolveDelay?.();
    this.resolveDelay = null;
    await this.flushing;
  }
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = (async () => {
      while (!this.disposed && this.saved < this.version) {
        const version = this.version;
        await this.store.save(this.snapshot());
        this.saved = version;
      }
    })().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }
}
