import { blip, MUTE_KEY } from "./feedback";
import { usePreference } from "./usePreference";

export function useMuted() {
  const [muted, setMuted] = usePreference(MUTE_KEY, false);
  const toggleMuted = () => {
    setMuted(!muted);
    if (muted) blip([659], false);
  };
  return { muted, toggleMuted };
}
