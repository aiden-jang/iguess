import { ClubFace } from "./ClubFace";

export function RoomError({
  reason,
  onLeave,
}: {
  reason: string;
  onLeave: () => void;
}) {
  return (
    <main className="room-error">
      <section role="alert" aria-labelledby="room-error-title">
        <ClubFace />
        <p className="eyebrow">A small detour</p>
        <h1 id="room-error-title">Couldn’t join this room</h1>
        <p>{reason}</p>
        <button type="button" onClick={onLeave}>
          Back to join <span aria-hidden>↗</span>
        </button>
        <a href="mailto:me@aidenjang.com">Get help</a>
      </section>
    </main>
  );
}
