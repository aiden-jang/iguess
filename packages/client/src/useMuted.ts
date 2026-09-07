import { useState } from "react";
import { blip, MUTE_KEY } from "./feedback";
import { readStored, writeStored } from "./storage";

export function useMuted() {
  const [muted, setMuted] = useState(() => readStored(MUTE_KEY) === "1");

  const toggleMuted = (): void => {
    setMuted((m) => {
      const next = !m;
      writeStored(MUTE_KEY, next ? "1" : "0");
      if (!next) blip([659], false); // little confirmation chirp when unmuting
      return next;
    });
  };

  return { muted, toggleMuted };
}
