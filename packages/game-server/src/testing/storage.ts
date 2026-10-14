/** Copy-on-read storage shared across simulated Durable Object instances. */
export function testStorage() {
  const values = new Map<string, unknown>();
  let alarm: number | null = null;
  const storage = {
    async get(key: string | string[]) {
      return Array.isArray(key)
        ? new Map(
            key
              .filter((k) => values.has(k))
              .map((k) => [k, structuredClone(values.get(k))]),
          )
        : structuredClone(values.get(key));
    },
    async put(key: string | Record<string, unknown>, value?: unknown) {
      if (typeof key === "string") values.set(key, structuredClone(value));
      else
        for (const [k, v] of Object.entries(key))
          values.set(k, structuredClone(v));
    },
    async delete(key: string | string[]) {
      for (const k of Array.isArray(key) ? key : [key]) values.delete(k);
    },
    async deleteAll() {
      values.clear();
      alarm = null;
    },
    async setAlarm(at: number) {
      alarm = at;
    },
    async getAlarm() {
      return alarm;
    },
    async transaction<T>(callback: (txn: unknown) => Promise<T>) {
      const before = structuredClone(values);
      try {
        return await callback(storage);
      } catch (error) {
        values.clear();
        for (const [k, v] of before) values.set(k, v);
        throw error;
      }
    },
  };
  const pending = new Set<Promise<unknown>>();
  const context = {
    storage,
    blockConcurrencyWhile: <T>(callback: () => Promise<T>) => callback(),
    waitUntil(task: Promise<unknown>) {
      pending.add(task);
      void task.then(
        () => pending.delete(task),
        () => pending.delete(task),
      );
    },
  } as unknown as DurableObjectState;
  return {
    context,
    storage,
    values,
    async settle() {
      while (pending.size) await Promise.all(pending);
    },
  };
}
