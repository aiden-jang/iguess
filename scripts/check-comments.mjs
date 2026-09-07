// Enforces the two comment rules from CONVENTIONS.md that a script can judge without guessing:
// no block over four lines, and no ticket ids. Everything else about comments (does this one
// earn its place, is it narrating history) needs a reader, and a check that cries wolf gets
// ignored. See the note in CONVENTIONS.md for why "used to" in particular is not automated.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const MAX_BLOCK = 4;
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".wrangler", "test-results", "playwright-report"]);
const SOURCE = /\.(ts|tsx|mjs)$/;
// Tests explain why they exist, so they get a different bar. Everything else is in scope,
// including this file.
const EXCLUDE = /\.test\.|^e2e\//;
const COMMENT = /^\s*(\/\/|\/\*|\*(?!\/)|\{\/\*)/;
const TICKET = /\b[A-Z]{2,}-\d+\b/;

function sources(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (SOURCE.test(entry)) out.push(relative(ROOT, full));
  }
  return out;
}

const problems = [];

for (const file of sources(ROOT)) {
  if (EXCLUDE.test(file)) continue;
  const lines = readFileSync(join(ROOT, file), "utf8").split("\n");
  let run = 0;
  let start = 0;
  const closeBlock = () => {
    if (run > MAX_BLOCK) problems.push(`${file}:${start} is a ${run}-line comment block. Trim it to ${MAX_BLOCK}.`);
    run = 0;
  };
  lines.forEach((line, i) => {
    if (COMMENT.test(line)) {
      if (run === 0) start = i + 1;
      run += 1;
      const ticket = line.match(TICKET);
      if (ticket) problems.push(`${file}:${i + 1} names a ticket (${ticket[0]}). It outlives the tracker.`);
    } else closeBlock();
  });
  closeBlock();
}

if (problems.length) {
  console.error("check-comments failed:");
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`check-comments: no block over ${MAX_BLOCK} lines, no ticket ids.`);
