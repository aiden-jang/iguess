import type { DrawOp } from "@iguess/shared";
import { humanize, type Rng } from "./humanize.ts";
import { natureDoodles } from "./doodles/nature.ts";
import { iconsDoodles } from "./doodles/icons.ts";
import { objectsDoodles } from "./doodles/objects.ts";
export const DOODLES = { ...natureDoodles, ...iconsDoodles, ...objectsDoodles };
export const DOODLE_WORDS = Object.keys(DOODLES);
export function doodleFor(word: string, rng?: Rng): DrawOp[][] {
  const strokes = DOODLES[word]?.();
  return strokes ? humanize(strokes, rng) : [];
}
