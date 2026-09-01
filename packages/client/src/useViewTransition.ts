import { flushSync } from "react-dom";

// Lobby → choosing → drawing → results are hard cuts. A view transition makes them read as one
// screen changing rather than four screens replacing each other.
//
// flushSync is what makes it work: startViewTransition snapshots the DOM, runs the callback,
// then snapshots again. A normal React setState is async, so the second snapshot would be taken
// before the render and the transition would capture nothing. Import it statically — a dynamic
// import inside the callback resolves after the snapshot for the same reason.
export function withTransition(update: () => void): void {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> };
  };
  if (typeof doc.startViewTransition !== "function") {
    update();
    return;
  }
  doc.startViewTransition(() => flushSync(update));
}
