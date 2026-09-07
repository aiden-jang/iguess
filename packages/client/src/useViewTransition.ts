import { flushSync } from "react-dom";

// flushSync is what makes this work: startViewTransition snapshots the DOM, runs the callback,
// then snapshots again. A normal React setState is async, so the second snapshot lands before
// the render and the transition captures nothing. Keep the import static too: a dynamic one
// resolves after the snapshot, for the same reason.
export function withTransition(update: () => void): void {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> };
  };
  if (typeof doc.startViewTransition !== "function") {
    update();
    return;
  }
  // A transition skipped before it begins rejects `ready`, and nobody is awaiting it. Turn end
  // into choosing into playing can all land inside one animation, so this is routine.
  const transition = doc.startViewTransition(() => flushSync(update));
  transition.ready.catch(() => {});
  transition.finished.catch(() => {});
}
