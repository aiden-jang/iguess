export class GameClock {
  private jobs = new Map<
    string,
    { at: number; timer: ReturnType<typeof setTimeout> }
  >();
  constructor(private fire: (key: string) => void) {}
  after(key: string, delay: number) {
    this.cancel(key);
    const at = Date.now() + Math.max(0, delay);
    const timer = setTimeout(
      () => {
        this.jobs.delete(key);
        this.fire(key);
      },
      Math.max(0, delay),
    );
    this.jobs.set(key, { at, timer });
  }
  cancel(key: string) {
    const job = this.jobs.get(key);
    if (job) clearTimeout(job.timer);
    this.jobs.delete(key);
  }
  clear() {
    for (const key of this.jobs.keys()) this.cancel(key);
  }
  snapshot() {
    return Object.fromEntries(
      [...this.jobs].map(([key, job]) => [key, job.at]),
    );
  }
  restore(deadlines: Record<string, number>, savedAt: number) {
    this.clear();
    for (const [key, at] of Object.entries(deadlines))
      this.after(key, Math.max(100, at - savedAt));
  }
}
