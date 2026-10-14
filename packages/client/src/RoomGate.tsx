import {
  Component,
  lazy,
  Suspense,
  type ComponentProps,
  type ReactNode,
} from "react";
import type { Room as LiveRoom } from "./Room";
import { RoomError } from "./RoomError";
import { ClubFace } from "./ClubFace";

const LazyRoom = lazy(() =>
  import("./Room").then((module) => ({ default: module.Room })),
);
type Props = ComponentProps<typeof LiveRoom>;
class RoomBoundary extends Component<
  { children: ReactNode; onLeave: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <RoomError
        reason="The game couldn’t load. Check your connection, then reload to try again."
        onLeave={this.props.onLeave}
      />
    ) : (
      this.props.children
    );
  }
}
export function RoomGate(props: Props) {
  return (
    <RoomBoundary onLeave={props.onLeave}>
      <Suspense
        fallback={
          <main className="room-error">
            <section role="status" aria-live="polite">
              <ClubFace />
              <p className="eyebrow">Setting the table</p>
              <h1>Opening your room…</h1>
              <p>The artistic pressure arrives separately.</p>
              <button onClick={props.onLeave}>Back to join</button>
            </section>
          </main>
        }
      >
        <LazyRoom {...props} />
      </Suspense>
    </RoomBoundary>
  );
}
