// A test runner that matches no files still exits 0, so a broken glob or a moved directory
// reports green forever. This runs each suite and holds it to a floor, which also catches
// tests being quietly deleted. Floors only ever move up.
import { spawnSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;

const FLOORS = {
  "@iguess/ai-worker": 27,
  "@iguess/client": 38,
  "@iguess/game-server": 145,
};

const problems = [];
const counts = [];

for (const [pkg, floor] of Object.entries(FLOORS)) {
  const run = spawnSync("pnpm", ["--filter", pkg, "test"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const out = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const pass = Number(out.match(/^.*# pass (\d+)$/m)?.[1] ?? NaN);
  const fail = Number(out.match(/^.*# fail (\d+)$/m)?.[1] ?? NaN);

  if (Number.isNaN(pass) || Number.isNaN(fail)) {
    problems.push(`${pkg} printed no test summary. Did its test script run at all?`);
    continue;
  }
  counts.push(`${pkg} ${pass}`);
  if (fail > 0) problems.push(`${pkg} had ${fail} failing test(s).`);
  else if (pass < floor) problems.push(`${pkg} ran ${pass} tests, below its floor of ${floor}.`);
  else if (pass > floor) problems.push(`${pkg} now runs ${pass} tests. Raise its floor to ${pass}.`);
}

if (problems.length) {
  console.error("check-tests failed:");
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`check-tests: ${counts.join(", ")}`);
