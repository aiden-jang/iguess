import { useEffect, useState } from "react";
import { useOnline } from "./useOnline";

export function usePlayStatus() {
  const online = useOnline();
  const [vision, setVision] = useState("checking");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!online) return;
    const controller = new AbortController();
    setVision("checking");
    void fetch("/play-status", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Status unavailable");
        const body = await response.json();
        setVision(body.vision === "ready" ? "ready" : "unavailable");
      })
      .catch(() => {
        if (!controller.signal.aborted) setVision("unknown");
      });
    return () => controller.abort();
  }, [attempt, online]);
  return {
    vision: online ? vision : "offline",
    retry: () => setAttempt((value) => value + 1),
  };
}
