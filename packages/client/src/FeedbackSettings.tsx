import { useEffect } from "react";
import { useMuted } from "./useMuted";
import { HAPTICS_KEY, MOTION_KEY, usePreference } from "./usePreference";

export function FeedbackSettings() {
  const { muted, toggleMuted } = useMuted();
  const [haptics, setHaptics] = usePreference(HAPTICS_KEY, true);
  const [motion, setMotion] = usePreference(MOTION_KEY, true);
  const supportsHaptics = typeof navigator.vibrate === "function";
  useEffect(() => {
    document.documentElement.dataset.motion = String(motion);
  }, [motion]);
  return (
    <fieldset className="feedback-settings">
      <legend>Your setup</legend>
      <label>
        <span>Sound effects</span>
        <input type="checkbox" checked={!muted} onChange={toggleMuted} />
      </label>
      <label>
        <span>Haptics</span>
        <input
          type="checkbox"
          checked={haptics}
          onChange={(e) => setHaptics(e.target.checked)}
          aria-describedby={supportsHaptics ? undefined : "haptics-note"}
        />
      </label>
      {!supportsHaptics && (
        <small id="haptics-note">This device doesn’t support vibration.</small>
      )}
      <label>
        <span>Playful motion</span>
        <input
          type="checkbox"
          checked={motion}
          onChange={(e) => setMotion(e.target.checked)}
        />
      </label>
      <small>
        Saved on this browser. Reduced-motion settings always take priority.
      </small>
    </fieldset>
  );
}
