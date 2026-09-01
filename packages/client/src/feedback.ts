// Sound and haptics. Two different channels for the same beat: audio can be muted, a buzz
// is the discreet one and follows the platform convention of surviving silent mode.
export const MUTE_KEY = "iguess_muted";
let audioCtx: AudioContext | null = null;
export function blip(freqs: number[], muted: boolean) {
  if (muted) return;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = audioCtx ?? new Ctor();
    const ctx = audioCtx;
    // A context built before the page has been interacted with starts suspended, and nothing here
    // ever woke it: every cue would schedule correctly and play to nobody, for the whole session.
    if (ctx.state === "suspended") void ctx.resume();
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = f;
      // The 20ms offset is not spacing, it's headroom. The audio thread has already rendered up to
      // currentTime by the time this runs, so the i=0 note booked at exactly currentTime lands in
      // the past and the hardware skips what it missed — which eats the attack rather than the
      // whole note, so it reads as "the first beep is quieter" instead of as a bug.
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

// Haptics run independently of the mute toggle: muting is about noise, and a buzz is the
// discreet channel. Android-only in practice — iOS Safari has no Vibration API.
export function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* no vibration hardware — no-op */
  }
}
