import type { EngineContext, TurnContext } from "../modes/GameMode.ts";
import { WORDS } from "@iguess/shared/words";
import type { AiSkill } from "@iguess/shared";
import { normalizeGuess } from "../text.ts";
import type { AIGuess } from "../services/aiWorkerClient.ts";

// Extracted from AIGuesserMode so any mode can give an AI participant a
// guessing loop without inheriting a whole mode class. This is mode POLICY
// (cadence + cost caps), deliberately kept out of the core engine.
// A flat re-guess interval meant the AI kept staring at a canvas nobody had touched, and kept
// waiting through a burst of new ink. Pace it by how much has actually changed since the last
// look — which also stops it spending vision calls on a static picture.
const BUSY_MS = 4_000;
const STEADY_MS = 8_000;
const IDLE_MS = 15_000;
const TEASE_MS = 1_300; // beat between the wrong shout and the answer
const TEASE_CHANCE = 0.6;
const BUSY_OPS = 45;
const STEADY_OPS = 12;

// How good the AI is allowed to be. "easy" doesn't fake wrong answers: it looks later, looks
// less often, and sometimes goes with its second thought instead of its first.
const SKILL: Record<AiSkill, { firstMs: number; pace: number; maxGuesses: number; doubtTop: number }> = {
  easy: { firstMs: 16_000, pace: 1.6, maxGuesses: 2, doubtTop: 0.5 },
  normal: { firstMs: 8_000, pace: 1, maxGuesses: 4, doubtTop: 0 },
  brutal: { firstMs: 4_000, pace: 0.55, maxGuesses: 7, doubtTop: 0 },
};

// Give the bot a voice. We decorate the DISPLAYED guess with hedging
// personality, but matching always runs on the raw guess word, so phrasing
// never affects whether a guess counts. `%` is replaced with the raw guess.
const GUESS_PHRASINGS = [
  "is it… %? 🤔",
  "ok hear me out: %",
  "giving %, respectfully",
  "my circuits say %",
  "%? final answer. probably.",
  "lowkey think it's a %",
  "calling it now: %",
  "no cap that's a %",
];
// The runners-up are the joke ("...or a horse. or a guitar."), so show them sometimes rather
// than every time — a wrong guess that hedges every single turn stops being funny.
const SECOND_THOUGHTS = ["… or a %", "… or is it a %", "(or a %)", "… a % maybe"];

export function phraseGuess(guess: string, alternatives: string[] = []): string {
  const t = GUESS_PHRASINGS[Math.floor(Math.random() * GUESS_PHRASINGS.length)]!;
  const said = t.replace("%", guess);
  const alt = alternatives.filter((a) => a && a !== guess);
  if (!alt.length || Math.random() < 0.45) return said;
  const s = SECOND_THOUGHTS[Math.floor(Math.random() * SECOND_THOUGHTS.length)]!;
  return said + " " + s.replace("%", alt[Math.floor(Math.random() * alt.length)]!);
}

// Lenient match for vision output: a model says "elephant", "an elephant",
// "It's a café!", etc. Normalize both sides (case/accents/punctuation) first
// so it matches as forgivingly as a human guess, then allow the target to
// appear as a whole word or substring of a longer phrase.
export function matchesWord(guess: string, word: string): boolean {
  const g = normalizeGuess(guess);
  const w = normalizeGuess(word);
  if (!w) return false;
  if (g === w) return true;
  return g.split(/\s+/).includes(w) || g.includes(w);
}

export interface GuessLoopOpts {
  aiId: string;
  aiName: string;
  // Renders the canvas + asks the vision model. Optional: without it we fall
  // back to a random stub (useful in tests / no worker).
  requestGuess?: () => Promise<AIGuess>;
  // Invoked once when the AI guesses correctly.
  onCorrect: () => void;
  // Invoked at most once per turn if the vision worker is unreachable, so the
  // mode can tell players the AI is down instead of leaving it silently mute.
  onUnavailable?: () => void;
  // Timing seams, so the loop is drivable in a test without waiting out real seconds.
  firstGuessMs?: number;
  intervalMs?: number;
  teaseMs?: number;
  // 0..1, how often a win is preceded by a wrong shout. A seam so tests aren't coin flips.
  teaseChance?: number;
  skill?: AiSkill;
  // Every guess the AI actually says out loud, correct or not. Lets a mode settle calls
  // players made on what the machine would say.
  onSaid?: (guess: string) => void;
}

/** How long to wait before looking again, given how much was drawn since the last look. */
export function nextGuessDelay(opsSinceLastLook: number): number {
  if (opsSinceLastLook >= BUSY_OPS) return BUSY_MS;
  if (opsSinceLastLook >= STEADY_OPS) return STEADY_MS;
  return IDLE_MS;
}

// Start the interval guessing loop for an AI participant. Returns a stop fn
// the caller MUST invoke on turn end (or when the round is otherwise decided).
export function startGuessLoop(
  turn: TurnContext,
  ctx: EngineContext,
  opts: GuessLoopOpts
): () => void {
  const skill = SKILL[opts.skill ?? "normal"];
  let attempts = 0;
  let notifiedDown = false; // fire onUnavailable at most once per turn (this loop's lifetime)
  let firstTimer: ReturnType<typeof setTimeout> | null = null;
  let interval: ReturnType<typeof setTimeout> | null = null;
  let seenOps = 0;
  // attempt() stops the loop itself when the turn is decided, and it is chained to schedule().
  // Without this the re-arm would resurrect a loop that had just shut down.
  let stopped = false;
  let teaseTimer: ReturnType<typeof setTimeout> | null = null;

  const stop = () => {
    stopped = true;
    if (firstTimer) { clearTimeout(firstTimer); firstTimer = null; }
    if (interval) { clearTimeout(interval); interval = null; }
    if (teaseTimer) { clearTimeout(teaseTimer); teaseTimer = null; }
  };

  const getGuess = async (): Promise<AIGuess> => {
    if (opts.requestGuess) {
      try {
        return await opts.requestGuess();
      } catch {
        // Worker unreachable/timed out — flag it once, then keep quietly retrying.
        if (!notifiedDown) { notifiedDown = true; opts.onUnavailable?.(); }
        return { guess: "", alternatives: [] };
      }
    }
    const wrong = WORDS.filter((w) => w !== turn.word);
    const pick = () => wrong[Math.floor(Math.random() * wrong.length)]!;
    const guess = Math.random() < 0.5 ? turn.word : pick();
    return { guess, alternatives: [pick(), pick()] };
  };

  const attempt = async () => {
    // Stop if the turn moved on or the AI already nailed it.
    if (ctx.currentWord() !== turn.word || ctx.hasGuessed(opts.aiId)) { stop(); return; }
    if (attempts >= skill.maxGuesses) { stop(); return; }

    let { guess, alternatives } = await getGuess();
    // An easy AI second-guesses itself: it says the runner-up it actually produced.
    if (alternatives.length && Math.random() < skill.doubtTop) {
      [guess, alternatives] = [alternatives[0]!, [guess, ...alternatives.slice(1)]];
    }
    // Re-check after the await — the turn may have ended meanwhile.
    if (!guess || ctx.currentWord() !== turn.word || ctx.hasGuessed(opts.aiId)) return;

    // Count only REAL guesses against the budget, so a flaky worker returning
    // "" doesn't silently burn the cap without ever guessing.
    attempts++;
    // A runner-up can be the answer. Saying the right word out loud and still losing the turn
    // reads as a bug, so any matching guess in the shortlist counts.
    const hit = [guess, ...alternatives].find((g) => matchesWord(g, turn.word));
    const correct = hit !== undefined;
    const say = (text: string) =>
      ctx.broadcast({ type: "chat", from: { id: opts.aiId, name: opts.aiName }, text });

    if (!correct) {
      // Misses get the hedging personality so the bot feels alive, not robotic.
      say(phraseGuess(guess, alternatives));
      opts.onSaid?.(guess);
      return;
    }
    opts.onSaid?.(hit!);

    // Landing the answer out of nowhere is flat. A wrong shout, a beat, then the answer plays
    // like it worked it out. The beat is short and guarded: the turn can end inside it.
    const tease = alternatives.find((a) => !matchesWord(a, turn.word));
    stop();
    if (tease && Math.random() < (opts.teaseChance ?? TEASE_CHANCE)) {
      say(`wait… is it a ${tease}?`);
      stopped = false; // the tease is still to come; stop() must be able to cancel it
      teaseTimer = setTimeout(() => {
        teaseTimer = null;
        if (stopped || ctx.currentWord() !== turn.word) return;
        say(hit!);
        opts.onCorrect();
      }, opts.teaseMs ?? TEASE_MS);
      return;
    }
    say(hit!);
    opts.onCorrect();
  };

  const schedule = () => {
    if (stopped) return;
    const now = ctx.canvasOpCount();
    const fresh = now - seenOps;
    seenOps = now;
    interval = setTimeout(() => {
      void attempt().then(schedule);
    }, opts.intervalMs ?? Math.round(nextGuessDelay(fresh) * skill.pace));
  };

  firstTimer = setTimeout(() => {
    void attempt().then(schedule);
  }, opts.firstGuessMs ?? skill.firstMs);

  return stop;
}
