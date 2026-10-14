import { HAPTICS_KEY, preference } from "./usePreference";

export const MUTE_KEY = "iguess_muted";
let audioCtx: AudioContext | null = null;
export function blip(freqs: number[], muted: boolean) {
  if (muted) return;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    audioCtx = audioCtx ?? new Ctor();
    const ctx = audioCtx;
    // Browsers require user interaction before a suspended audio context can play.
    if (ctx.state === "suspended") void ctx.resume();
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = f;
      // Scheduling slightly ahead keeps the first note out of the audio context's past.
      const t = ctx.currentTime + 0.02 + i * 0.09;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  } catch {
    /* audio not available — no-op */
  }
}

// Sound and vibration have separate preferences; unsupported devices stay silent.
export function buzz(pattern: number | number[]) {
  if (!preference(HAPTICS_KEY, true)) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* no vibration hardware — no-op */
  }
}
