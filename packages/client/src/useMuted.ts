import { useState } from "react";
import { blip, MUTE_KEY } from "./feedback";

export function useMuted() {
  const [muted, setMuted] = useState(() => localStorage.getItem(MUTE_KEY) === "1");

  const toggleMuted = (): void => {
    setMuted((m) => {
      const next = !m;
      localStorage.setItem(MUTE_KEY, next ? "1" : "0");
      if (!next) blip([659], false); // little confirmation chirp when unmuting
      return next;
    });
  };

  return { muted, toggleMuted };
}
