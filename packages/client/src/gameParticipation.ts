/** Counts observed games once; a result snapshot or spectator seat is not participation. */
export class GameParticipation {
  private played = false;
  private counted = false;
  observe(phase: string, player: boolean): boolean {
    if (phase !== "ended") {
      if (this.counted || phase === "lobby") this.played = false;
      this.counted = false;
      if (player && (phase === "playing" || phase === "choosing"))
        this.played = true;
      return false;
    }
    if (!this.played || this.counted || !player) return false;
    this.counted = true;
    return true;
  }
}
