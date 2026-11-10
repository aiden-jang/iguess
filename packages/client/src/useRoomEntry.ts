import { readInvite } from "./roomLinks";
import { usePageAnalytics } from "./usePageAnalytics.ts";
import { pageForPath } from "../../../analytics/schema.ts";
import { useEffect, useState } from "react";

interface Entry {
  name: string;
  room: string;
  mode: string;
  create?: boolean;
}

export function useRoomEntry() {
  const [joined, setJoined] = useState<Entry | null>(null);
  usePageAnalytics(joined ? "game" : pageForPath(window.location.pathname));
  useEffect(() => {
    const backToJoin = () => setJoined(null);
    window.addEventListener("popstate", backToJoin);
    const launch = (
      window as Window & {
        launchQueue?: {
          setConsumer(handler: (params: { targetURL?: string }) => void): void;
        };
      }
    ).launchQueue;
    launch?.setConsumer(({ targetURL }) => {
      if (!targetURL || targetURL === location.href) return;
      const target = new URL(targetURL, location.href);
      if (target.origin !== location.origin) return;
      history.pushState(
        null,
        "",
        target.pathname + target.search + target.hash,
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    return () => window.removeEventListener("popstate", backToJoin);
  }, []);
  return {
    joined,
    enter: (entry: Entry) => {
      const query = entry.mode ? `?mode=${encodeURIComponent(entry.mode)}` : "";
      if (readInvite().room) window.history.replaceState(null, "", "/");
      window.history.pushState(
        null,
        "",
        `/r/${encodeURIComponent(entry.room)}${query}`,
      );
      window.scrollTo(0, 0);
      setJoined(entry);
    },
    leave: () => {
      window.history.replaceState(null, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
      window.scrollTo(0, 0);
    },
  };
}
