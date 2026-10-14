const PART_BYTES = 48_000;
const MAX_PARTS = 120;
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
interface Manifest {
  version: 1;
  parts: number;
  expires: number;
}
/** Atomic chunks bound storage values; recovery data expires rather than becoming an archive. */
export class CheckpointStore<T> {
  constructor(
    private storage: DurableObjectStorage,
    private now = Date.now,
  ) {}
  async load(): Promise<T | null> {
    const manifest = await this.storage.get<Manifest>("checkpoint");
    if (
      !manifest ||
      manifest.version !== 1 ||
      manifest.expires <= this.now() ||
      !Number.isInteger(manifest.parts) ||
      manifest.parts < 1 ||
      manifest.parts > MAX_PARTS
    )
      return null;
    const keys = Array.from(
      { length: manifest.parts },
      (_, i) => `checkpoint:${i}`,
    );
    const parts = await this.storage.get<string>(keys);
    if (parts.size !== keys.length) return null;
    try {
      return JSON.parse(keys.map((key) => parts.get(key)).join("")) as T;
    } catch {
      return null;
    }
  }
  async save(value: T) {
    const json = JSON.stringify(value);
    // Escape non-ASCII so a character count is also a byte bound for every chunk.
    const ascii = json.replace(
      /[\u007f-\uffff]/g,
      (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
    );
    const parts = Math.ceil(ascii.length / PART_BYTES);
    if (parts > MAX_PARTS)
      throw new Error("Room checkpoint exceeds its storage budget");
    await this.storage.transaction(async (txn) => {
      const previous = await txn.get<Manifest>("checkpoint");
      const entries: Record<string, unknown> = {
        checkpoint: { version: 1, parts, expires: this.now() + ROOM_TTL_MS },
      };
      for (let i = 0; i < parts; i++)
        entries[`checkpoint:${i}`] = ascii.slice(
          i * PART_BYTES,
          (i + 1) * PART_BYTES,
        );
      await txn.put(entries);
      if (previous && previous.parts > parts)
        await txn.delete(
          Array.from(
            { length: previous.parts - parts },
            (_, i) => `checkpoint:${i + parts}`,
          ),
        );
    });
    await this.storage.setAlarm(this.now() + ROOM_TTL_MS);
  }
}
