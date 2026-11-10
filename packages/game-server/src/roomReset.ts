// Only an unused lobby may take on a different mode. Completed games stay available to rejoin.
export function shouldResetRoom(
  phase: string,
  requestedMode: string,
  currentMode: string,
): boolean {
  return phase === "lobby" && requestedMode !== currentMode;
}
