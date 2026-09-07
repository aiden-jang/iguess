// A browser set to block site data throws on `localStorage` itself, not just on write, and some
// of these reads happen during render. Forgetting a name or a mute setting costs nothing; a
// white screen costs everything.
export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* it just won't survive a reload */
  }
}
