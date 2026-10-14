import { useEffect } from "react";

// A round is a minute of watching someone else draw, with no input from you. Phones treat that
// as idle and sleep. Held only while a game is live, so the lobby doesn't pin the screen on.
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let dropped = false;
    let acquiring = false;

    const acquire = async () => {
      if (dropped || acquiring || lock) return;
      acquiring = true;
      try {
        const held = await navigator.wakeLock.request("screen");
        // The await can land after cleanup ran; without this the screen stays on for good.
        if (dropped) {
          void held.release();
          return;
        }
        lock = held;
        held.addEventListener(
          "release",
          () => {
            if (lock === held) lock = null;
          },
          { once: true },
        );
      } catch {
        // Denied (low battery, no permission). Nothing to do but let the screen sleep.
      } finally {
        acquiring = false;
      }
    };

    // A lock is dropped whenever the tab is hidden, so it has to be retaken on the way back.
    const onVisible = () => {
      if (document.visibilityState === "visible" && !lock) void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      dropped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
      lock = null;
    };
  }, [active]);
}
