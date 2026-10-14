// Per-room memory of what has already come up, so an evening of short games stops serving the
// same handful of words.

// Roomy enough to span a long session across every tier at once. avoidFor caps what this
// can actually block, so a large history can never starve a pool.
const LIMIT = 150;

export class WordMemory {
  private recent: string[] = [];

  snapshot() {
    return [...this.recent];
  }
  restore(words: string[]) {
    this.recent = words.slice(-LIMIT);
  }

  remember(word: string): void {
    this.recent.push(word);
    if (this.recent.length > LIMIT)
      this.recent.splice(0, this.recent.length - LIMIT);
  }

  // Words to skip when picking from `pool`. Capped at half the pool so a small pool
  // (the doodle list) can never be memoried into a dead end.
  avoidFor(pool: string[]): Set<string> {
    const max = Math.floor(pool.length / 2);
    const inPool = new Set(pool);
    const out = new Set<string>();
    for (let i = this.recent.length - 1; i >= 0 && out.size < max; i--) {
      const w = this.recent[i]!;
      if (inPool.has(w)) out.add(w);
    }
    return out;
  }
}
