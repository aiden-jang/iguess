// Should joining wipe the room back to a fresh lobby? Only when it is sitting idle and reusing
// it would be surprising: the last game already finished, or someone is picking a new mode.
// A game in progress is never reset. You are joining that game.
export function shouldResetRoom(
  phase: string,
  requestedMode: string,
  currentMode: string,
): boolean {
  return (
    phase === "ended" || (phase === "lobby" && requestedMode !== currentMode)
  );
}
