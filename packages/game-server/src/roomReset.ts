// Should a (re)join reset the room to a fresh lobby, rather than dropping the joiner into the
// existing engine? Yes when the room is IDLE and reusing it would be surprising:
//   - the previous game finished ("ended") — don't strand the next joiner on the "round over" screen;
//   - the room is waiting in "lobby" and the joiner picked a DIFFERENT mode — honor the new pick.
// A game in progress ("choosing"/"playing"/"intermission") is never reset — you're joining it.
export function shouldResetRoom(phase: string, requestedMode: string, currentMode: string): boolean {
  return phase === 'ended' || (phase === 'lobby' && requestedMode !== currentMode);
}
