import type { GuessProgress } from "../modes/modeState.ts";
import type { EngineContext, TurnContext } from "../modes/GameMode.ts";
import { WORDS } from "@iguess/shared/words";
import type { AiSkill } from "@iguess/shared";
import {
  SKILL,
  TEASE_MS,
  TEASE_CHANCE,
  phraseGuess,
  matchesWord,
  nextGuessDelay,
} from "./guessRules.ts";
export { phraseGuess, matchesWord, nextGuessDelay } from "./guessRules.ts";
import type { AIGuess } from "../services/aiWorkerClient.ts";

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
  progress?: GuessProgress;
  // Every guess it says out loud, right or wrong, so a mode can settle bets on it.
  onSaid?: (guess: string) => void;
}

export function startGuessLoop(
  turn: TurnContext,
  ctx: EngineContext,
  opts: GuessLoopOpts,
): () => void {
  const skill = SKILL[opts.skill ?? "normal"];
  const progress = opts.progress ?? {
    attempts: 0,
    notifiedDown: false,
    seenOps: 0,
  };
  let notifiedDown = progress.notifiedDown;
  let firstTimer: ReturnType<typeof setTimeout> | null = null;
  let interval: ReturnType<typeof setTimeout> | null = null;

  // Both pending requests and delayed reveals must respect disposal.
  let stopped = false;
  let finishing = false;
  let teaseTimer: ReturnType<typeof setTimeout> | null = null;

  const stop = () => {
    stopped = true;
    if (firstTimer) {
      clearTimeout(firstTimer);
      firstTimer = null;
    }
    if (interval) {
      clearTimeout(interval);
      interval = null;
    }
    if (teaseTimer) {
      clearTimeout(teaseTimer);
      teaseTimer = null;
    }
  };

  const getGuess = async (): Promise<AIGuess> => {
    if (opts.requestGuess) {
      try {
        return await opts.requestGuess();
      } catch {
        // Say it once, then keep quietly trying.
        if (!notifiedDown) {
          notifiedDown = true;
          progress.notifiedDown = true;
          if (!stopped) opts.onUnavailable?.();
        }
        return { guess: "", alternatives: [] };
      }
    }
    const wrong = WORDS.filter((w) => w !== turn.word);
    const pick = () => wrong[Math.floor(Math.random() * wrong.length)]!;
    const guess = Math.random() < 0.5 ? turn.word : pick();
    return { guess, alternatives: [pick(), pick()] };
  };

  const attempt = async () => {
    if (
      stopped ||
      ctx.currentWord() !== turn.word ||
      ctx.hasGuessed(opts.aiId)
    ) {
      stop();
      return;
    }
    if (progress.attempts >= skill.maxGuesses) {
      stop();
      return;
    }

    let { guess, alternatives } = await getGuess();
    // An easy AI talks itself out of its best answer, but only into one it really had.
    if (alternatives.length && Math.random() < skill.doubtTop) {
      [guess, alternatives] = [
        alternatives[0]!,
        [guess, ...alternatives.slice(1)],
      ];
    }
    if (
      stopped ||
      !guess ||
      ctx.currentWord() !== turn.word ||
      ctx.hasGuessed(opts.aiId)
    )
      return;

    // Only count real guesses. An empty answer from a flaky worker must not eat the budget.
    progress.attempts++;
    // Any word in the shortlist counts. Saying the right answer out loud and still losing
    // looks like a bug.
    const hit = [guess, ...alternatives].find((g) => matchesWord(g, turn.word));
    const correct = hit !== undefined;
    const say = (text: string) =>
      ctx.broadcast({
        type: "chat",
        from: { id: opts.aiId, name: opts.aiName },
        text,
        isGuess: true,
      });

    if (!correct) {
      say(phraseGuess(guess, alternatives));
      opts.onSaid?.(guess);
      return;
    }
    // A wrong shout, a pause, then the answer. Guard the pause: the turn can end inside it.
    const tease = alternatives.find((a) => !matchesWord(a, turn.word));
    stop();
    if (tease && Math.random() < (opts.teaseChance ?? TEASE_CHANCE)) {
      say(`wait… is it a ${tease}?`);
      opts.onSaid?.(tease);
      finishing = true;
      stopped = false; // Allow only the pending reveal; no further guesses.
      teaseTimer = setTimeout(() => {
        teaseTimer = null;
        if (stopped || ctx.currentWord() !== turn.word) return;
        say(hit!);
        opts.onSaid?.(hit!);
        opts.onCorrect();
      }, opts.teaseMs ?? TEASE_MS);
      return;
    }
    say(hit!);
    opts.onSaid?.(hit!);
    opts.onCorrect();
  };

  const schedule = () => {
    if (stopped || finishing) return;
    const now = ctx.canvasOpCount();
    const fresh = now - progress.seenOps;
    progress.seenOps = now;
    interval = setTimeout(
      () => {
        void attempt().then(schedule);
      },
      opts.intervalMs ?? Math.round(nextGuessDelay(fresh) * skill.pace),
    );
  };

  firstTimer = setTimeout(() => {
    void attempt().then(schedule);
  }, opts.firstGuessMs ?? skill.firstMs);

  return stop;
}
