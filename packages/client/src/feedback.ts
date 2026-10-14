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
    // Audio built before the first click starts paused. Nothing else wakes it, so without this
    // every sound schedules perfectly and plays to nobody, all session.
    if (ctx.state === "suspended") void ctx.resume();
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = f;
      // The 20ms is headroom, not spacing. Booking a note at exactly "now" puts it very
      // slightly in the past, and the start of it gets skipped. It sounds like a quiet first
      // beep rather than an obvious fault, which is why it is easy to miss.
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
