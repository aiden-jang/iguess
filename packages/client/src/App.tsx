import { Room } from "./Room";
import { useRoomEntry } from "./useRoomEntry";
import { useJoinDraft } from "./useJoinDraft";
import { JoinScreen } from "./JoinScreen";

export function App() {
  const { joined, enter, leave } = useRoomEntry();
  const draft = useJoinDraft(enter);
  if (!joined) return <JoinScreen {...draft} />;
  return (
    <Room
      {...joined}
      avatar={draft.avatar}
      onLeave={() => {
        leave();
        draft.selectRoom();
      }}
    />
  );
}
