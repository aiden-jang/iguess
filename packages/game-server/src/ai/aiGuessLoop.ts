import type { EngineContext, TurnContext } from "../modes/GameMode.ts";
import { WORDS } from "@iguess/shared/words";
import type { AiSkill } from "@iguess/shared";
import { normalizeGuess } from "../text.ts";
import type { AIGuess } from "../services/aiWorkerClient.ts";

// Wait based on how much has been drawn since the last look. A fixed interval both stared at
// an untouched canvas and made it wait through a burst of new ink.
const BUSY_MS = 4_000;
const STEADY_MS = 8_000;
const IDLE_MS = 15_000;
const TEASE_MS = 1_300; // beat between the wrong shout and the answer
const TEASE_CHANCE = 0.6;
const BUSY_OPS = 45;
const STEADY_OPS = 12;

// "easy" never makes up a wrong answer. It just looks later, looks less often, and sometimes
// goes with its second thought instead of its first.
const SKILL: Record<AiSkill, { firstMs: number; pace: number; maxGuesses: number; doubtTop: number }> = {
  easy: { firstMs: 16_000, pace: 1.6, maxGuesses: 2, doubtTop: 0.5 },
  normal: { firstMs: 8_000, pace: 1, maxGuesses: 4, doubtTop: 0 },
  brutal: { firstMs: 4_000, pace: 0.55, maxGuesses: 7, doubtTop: 0 },
};

// Only the DISPLAYED text gets this personality. Whether a guess counts is decided on the
// bare word, so wording can never change the outcome. `%` becomes the guess.
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
// Show the runners-up sometimes, not every time. A bot that dithers every single turn stops
// being funny.
const SECOND_THOUGHTS = ["… or a %", "… or is it a %", "(or a %)", "… a % maybe"];

export function phraseGuess(guess: string, alternatives: string[] = []): string {
  const t = GUESS_PHRASINGS[Math.floor(Math.random() * GUESS_PHRASINGS.length)]!;
  const said = t.replace("%", guess);
  const alt = alternatives.filter((a) => a && a !== guess);
  if (!alt.length || Math.random() < 0.45) return said;
  const s = SECOND_THOUGHTS[Math.floor(Math.random() * SECOND_THOUGHTS.length)]!;
  return said + " " + s.replace("%", alt[Math.floor(Math.random() * alt.length)]!);
}

// A model answers "elephant", "an elephant", or "It's a café!". Accept the word inside a
// longer sentence, and ignore capitals, accents and punctuation.
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
  // Leave this out and the loop invents random guesses, which is enough for tests.
  requestGuess?: () => Promise<AIGuess>;
  onCorrect: () => void;
  // Fires at most once a turn, so the mode can say the AI is down instead of going quiet.
  onUnavailable?: () => void;
  // So a test can drive the loop without waiting out real seconds.
  firstGuessMs?: number;
  intervalMs?: number;
  teaseMs?: number;
  // 0 to 1. Set it in tests, or they become coin flips.
  teaseChance?: number;
  skill?: AiSkill;
  // Every guess it says out loud, right or wrong, so a mode can settle bets on it.
  onSaid?: (guess: string) => void;
}

export function nextGuessDelay(opsSinceLastLook: number): number {
  if (opsSinceLastLook >= BUSY_OPS) return BUSY_MS;
  if (opsSinceLastLook >= STEADY_OPS) return STEADY_MS;
  return IDLE_MS;
}

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
  // attempt() shuts the loop down itself, and schedule() runs right after it. Without this
  // flag, that restarts a loop that has just finished and it guesses forever.
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
        // Say it once, then keep quietly trying.
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
    if (ctx.currentWord() !== turn.word || ctx.hasGuessed(opts.aiId)) { stop(); return; }
    if (attempts >= skill.maxGuesses) { stop(); return; }

    let { guess, alternatives } = await getGuess();
    // An easy AI talks itself out of its best answer, but only into one it really had.
    if (alternatives.length && Math.random() < skill.doubtTop) {
      [guess, alternatives] = [alternatives[0]!, [guess, ...alternatives.slice(1)]];
    }
    if (!guess || ctx.currentWord() !== turn.word || ctx.hasGuessed(opts.aiId)) return;

    // Only count real guesses. An empty answer from a flaky worker must not eat the budget.
    attempts++;
    // Any word in the shortlist counts. Saying the right answer out loud and still losing
    // looks like a bug.
    const hit = [guess, ...alternatives].find((g) => matchesWord(g, turn.word));
    const correct = hit !== undefined;
    const say = (text: string) =>
      ctx.broadcast({ type: "chat", from: { id: opts.aiId, name: opts.aiName }, text });

    if (!correct) {
      say(phraseGuess(guess, alternatives));
      opts.onSaid?.(guess);
      return;
    }
    opts.onSaid?.(hit!);

    // A wrong shout, a pause, then the answer. Guard the pause: the turn can end inside it.
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
