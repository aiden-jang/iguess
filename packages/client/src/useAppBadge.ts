import { useEffect } from "react";

// Badge the installed icon when the app needs you and isn't on screen. Cleared whenever the
// tab comes back, so a stale badge never outlives the moment it was about it.
export function useAppBadge(count: number): void {
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (typeof nav.setAppBadge !== "function") return;

    const sync = () => {
      const wanted = document.visibilityState === "hidden" ? count : 0;
      // Both reject when the document isn't allowed to badge; there is nothing to recover.
      if (wanted > 0) void nav.setAppBadge?.(wanted).catch(() => {});
      else void nav.clearAppBadge?.().catch(() => {});
    };

    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      void nav.clearAppBadge?.().catch(() => {});
    };
  }, [count]);
}
