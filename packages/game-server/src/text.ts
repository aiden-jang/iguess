
// Tidy a word so two of them can be compared: lowercase, accents off, punctuation gone.
export function normalizeGuess(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining accent marks
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ") // punctuation/symbols → space
    .replace(/\s+/g, " ")
    .trim();
}

// "Close" means one letter out: a typo or a missing letter. Only for words of 4 letters or
// more, or "cat" and "hat" would set it off constantly.
export function isClose(guess: string, word: string): boolean {
  if (guess === word) return false; // exact is a win, not "close"
  if (word.length < 4 || guess.length < 2) return false;
  return levenshtein(guess, word) === 1;
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + cost);
      diag = tmp;
    }
  }
  return prev[b.length]!;
}
