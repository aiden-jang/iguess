import type { EngineContext, TurnContext } from "../modes/GameMode.ts";
import { WORDS } from "../words.ts";

// Extracted from AIGuesserMode so any mode can give an AI participant a
// guessing loop without inheriting a whole mode class. This is mode POLICY
// (cadence + cost caps), deliberately kept out of the core engine.
const FIRST_GUESS_MS = 8_000; // let the drawer get something on the canvas
const GUESS_INTERVAL_MS = 10_000; // re-guess cadence
const MAX_GUESSES = 4; // cost cap per turn

// Lenient match: a vision model says "elephant", "an elephant", etc.
export function matchesWord(guess: string, word: string): boolean {
  const g = guess.toLowerCase();
  const w = word.toLowerCase();
  if (g === w) return true;
  return g.split(/\W+/).includes(w) || g.includes(w);
}

export interface GuessLoopOpts {
  aiId: string;
  aiName: string;
  // Renders the canvas + asks the vision model. Optional: without it we fall
  // back to a random stub (useful in tests / no worker).
  requestGuess?: () => Promise<string>;
  // Invoked once when the AI guesses correctly.
  onCorrect: () => void;
}

// Start the interval guessing loop for an AI participant. Returns a stop fn
// the caller MUST invoke on turn end (or when the round is otherwise decided).
export function startGuessLoop(
  turn: TurnContext,
  ctx: EngineContext,
  opts: GuessLoopOpts
): () => void {
  let attempts = 0;
  let firstTimer: ReturnType<typeof setTimeout> | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;

  const stop = () => {
    if (firstTimer) { clearTimeout(firstTimer); firstTimer = null; }
    if (interval) { clearInterval(interval); interval = null; }
  };

  const getGuess = async (): Promise<string> => {
    if (opts.requestGuess) {
      try { return await opts.requestGuess(); } catch { return ""; }
    }
    if (Math.random() < 0.5) return turn.word;
    const wrong = WORDS.filter((w) => w !== turn.word);
    return wrong[Math.floor(Math.random() * wrong.length)];
  };

  const attempt = async () => {
    // Stop if the turn moved on or the AI already nailed it.
    if (ctx.currentWord() !== turn.word || ctx.hasGuessed(opts.aiId)) { stop(); return; }
    if (attempts >= MAX_GUESSES) { stop(); return; }
    attempts++;

    const guess = await getGuess();
    // Re-check after the await — the turn may have ended meanwhile.
    if (!guess || ctx.currentWord() !== turn.word || ctx.hasGuessed(opts.aiId)) return;

    ctx.broadcast({ type: "chat", from: { id: opts.aiId, name: opts.aiName }, text: guess });
    if (matchesWord(guess, turn.word)) { stop(); opts.onCorrect(); }
  };

  firstTimer = setTimeout(() => {
    void attempt();
    interval = setInterval(() => void attempt(), GUESS_INTERVAL_MS);
  }, FIRST_GUESS_MS);

  return stop;
}
