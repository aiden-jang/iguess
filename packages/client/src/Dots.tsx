/** The animated "…" that follows anything the room is waiting on. */
export function Dots() {
  return (
    <span aria-hidden>
      <span className="dot">.</span>
      <span className="dot">.</span>
      <span className="dot">.</span>
    </span>
  );
}
