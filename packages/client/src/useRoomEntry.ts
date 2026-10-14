import { useEffect, useState } from "react";

interface Entry {
  name: string;
  room: string;
  mode: string;
}

export function useRoomEntry() {
  const [joined, setJoined] = useState<Entry | null>(null);
  useEffect(() => {
    const backToJoin = () => setJoined(null);
    window.addEventListener("popstate", backToJoin);
    return () => window.removeEventListener("popstate", backToJoin);
  }, []);
  return {
    joined,
    enter: (entry: Entry) => {
      const query = new URLSearchParams({ mode: entry.mode });
      window.history.pushState(
        null,
        "",
        `/r/${encodeURIComponent(entry.room)}?${query.toString()}`,
      );
      setJoined(entry);
    },
    leave: () => {
      window.history.replaceState(null, "", "/");
      setJoined(null);
      window.scrollTo(0, 0);
    },
  };
}
