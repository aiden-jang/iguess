const LIFETIME_MS = 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 256;
export interface SessionRecord {
  digest: string;
  id: string;
  expires: number;
  revoked?: boolean;
}
async function digest(token: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
/** Room-local bearer credentials: public player IDs never authorize reconnects. */
export class ReconnectSessions {
  private records: SessionRecord[];
  constructor(
    records: SessionRecord[] = [],
    private now = Date.now,
  ) {
    this.records = records;
  }
  snapshot() {
    return this.records
      .filter((record) => record.expires > this.now())
      .slice(-MAX_SESSIONS);
  }
  async resolve(token: string | null): Promise<SessionRecord | null> {
    if (!token || !/^[\da-f]{64}$/.test(token)) return null;
    const hash = await digest(token);
    return this.snapshot().find((record) => record.digest === hash) ?? null;
  }
  async create(protectedIds = new Set<string>()) {
    const token = [...crypto.getRandomValues(new Uint8Array(32))]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const record = {
      id: crypto.randomUUID(),
      digest: await digest(token),
      expires: this.now() + LIFETIME_MS,
    };
    this.records = [...this.snapshot(), record];
    if (this.records.length > MAX_SESSIONS) {
      const disposable = this.records.findIndex(
        (entry) => !protectedIds.has(entry.id) && entry.id !== record.id,
      );
      this.records.splice(disposable < 0 ? 0 : disposable, 1);
    }
    return { record, token };
  }
  revoke(id: string) {
    for (const record of this.records)
      if (record.id === id) record.revoked = true;
  }
}
