// Ceilings only decrease. Slack tolerates small edits, not a growing ceiling.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SLACK = 40;

const CEILINGS = {
  "packages/client/src/App.tsx": 11,
  "packages/client/src/Room.tsx": 282,
  "packages/client/src/styles.ts": 284,
  "packages/client/src/useWebSocket.ts": 150,
  "packages/client/src/DrawingCanvas.tsx": 166,
  "packages/game-server/src/GameRoom.ts": 384,
  "packages/game-server/src/engine.ts": 349,
  "packages/game-server/src/doodles.ts": 11,
  "packages/game-server/src/ai/aiGuessLoop.ts": 181,
  "packages/ai-worker/src/visionProviders.ts": 159,
  "shared/events.ts": 215,
  "scripts/check-size.mjs": 90,
  "scripts/check-tests.mjs": 51,
  "scripts/check-comments.mjs": 65,
};

// Anything this big should be under a ceiling, so a new god file can't appear unnoticed.
const UNLISTED_LIMIT = 300;
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  ".wrangler",
  "test-results",
  "playwright-report",
]);
const SOURCE = /\.(ts|tsx|mjs|cjs|js)$/;

function sources(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (SOURCE.test(entry) && !entry.includes(".test."))
      out.push(relative(ROOT, full));
  }
  return out;
}

// Count the way `wc -l` does, so the numbers here match what anyone checks them against.
const lines = (f) => {
  const parts = readFileSync(join(ROOT, f), "utf8").split("\n");
  if (parts.at(-1) === "") parts.pop();
  return parts.length;
};
const problems = [];

for (const [file, ceiling] of Object.entries(CEILINGS)) {
  let actual;
  try {
    actual = lines(file);
  } catch {
    problems.push(
      `${file} is in the ceiling list but does not exist. Remove the entry.`,
    );
    continue;
  }
  if (actual > ceiling)
    problems.push(`${file} is ${actual} lines, over its ${ceiling} ceiling.`);
  else if (ceiling - actual > SLACK)
    problems.push(
      `${file} is ${actual} lines but its ceiling is ${ceiling}. Lower it to ${actual}.`,
    );
}

for (const file of sources(ROOT)) {
  if (file in CEILINGS) continue;
  const actual = lines(file);
  if (actual > UNLISTED_LIMIT)
    problems.push(
      `${file} is ${actual} lines and has no ceiling. Add one, or split the file.`,
    );
}

if (problems.length) {
  console.error("check-size failed:");
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(
  `check-size: ${Object.keys(CEILINGS).length} ceilings held, nothing unlisted over ${UNLISTED_LIMIT} lines.`,
);
