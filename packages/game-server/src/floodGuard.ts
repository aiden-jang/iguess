const MSG_LIMIT_PER_SEC = 200;

export interface RateWindow {
  count: number;
  windowStart: number;
}

/** Coarse per-connection flood guard. Mutates the window it is given. */
export function allowMessage(rate: RateWindow, now = Date.now()): boolean {
  if (now - rate.windowStart >= 1000) {
    rate.windowStart = now;
    rate.count = 0;
  }
  rate.count += 1;
  return rate.count <= MSG_LIMIT_PER_SEC;
}
