const PART_BYTES = 48_000;
const MAX_PARTS = 120;
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
interface Manifest {
  version: 1;
  parts: number;
  expires: number;
}
export async function readChunks<T>(
  storage: DurableObjectStorage,
  key: string,
  now = 0,
): Promise<T | null> {
  const manifest = await storage.get<Manifest>(key);
  if (
    !manifest ||
    manifest.version !== 1 ||
    manifest.expires <= now ||
    !Number.isInteger(manifest.parts) ||
    manifest.parts < 1 ||
    manifest.parts > MAX_PARTS
  )
    return null;
  const keys = Array.from({ length: manifest.parts }, (_, i) => `${key}:${i}`);
  const parts = await storage.get<string>(keys);
  if (parts.size !== keys.length) return null;
  try {
    return JSON.parse(keys.map((key) => parts.get(key)).join("")) as T;
  } catch {
    return null;
  }
}

export async function writeChunks(
  txn: DurableObjectTransaction,
  key: string,
  value: unknown,
  expires: number,
) {
  const json = JSON.stringify(value);
  // Escape non-ASCII so a character count is also a byte bound for every chunk.
  const ascii = json.replace(
    /[\u007f-\uffff]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
  const parts = Math.ceil(ascii.length / PART_BYTES);
  if (parts > MAX_PARTS)
    throw new Error("Room checkpoint exceeds its storage budget");
  const previous = await txn.get<Manifest>(key);
  const entries: Record<string, unknown> = {
    [key]: { version: 1, parts, expires },
  };
  for (let i = 0; i < parts; i++)
    entries[`${key}:${i}`] = ascii.slice(i * PART_BYTES, (i + 1) * PART_BYTES);
  await txn.put(entries);
  if (previous && previous.parts > parts)
    await txn.delete(
      Array.from(
        { length: previous.parts - parts },
        (_, i) => `${key}:${i + parts}`,
      ),
    );
}

export async function deleteChunks(
  txn: DurableObjectTransaction,
  keys: string[],
) {
  const manifests = await txn.get<Manifest>(keys);
  for (const [key, manifest] of manifests) {
    const parts = Math.min(manifest.parts, MAX_PARTS);
    await txn.delete([
      key,
      ...Array.from({ length: parts }, (_, index) => `${key}:${index}`),
    ]);
  }
}

/** Atomic chunks bound storage values; recovery data expires rather than becoming an archive. */
export class CheckpointStore<T> {
  constructor(
    private storage: DurableObjectStorage,
    private now = Date.now,
  ) {}
  load() {
    return readChunks<T>(this.storage, "checkpoint", this.now());
  }
  async save(
    value: T,
    extra?: (txn: DurableObjectTransaction) => Promise<void>,
  ) {
    const expires = this.now() + ROOM_TTL_MS;
    await this.storage.transaction(async (txn) => {
      await writeChunks(txn, "checkpoint", value, expires);
      await extra?.(txn);
    });
    await this.storage.setAlarm(expires);
  }
}
