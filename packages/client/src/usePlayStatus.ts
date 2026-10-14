import { useEffect, useState } from "react";

export function usePlayStatus() {
  const [vision, setVision] = useState("checking");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setVision("checking");
    void fetch("/play-status", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Status unavailable");
        const body = await response.json();
        setVision(body.vision === "ready" ? "ready" : "unavailable");
      })
      .catch(() => {
        if (!controller.signal.aborted) setVision("unknown");
      });
    return () => controller.abort();
  }, [attempt]);
  return { vision, retry: () => setAttempt((value) => value + 1) };
}
