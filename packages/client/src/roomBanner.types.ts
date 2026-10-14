import type { useGameSocket } from "./useWebSocket";
import type { roomView } from "./roomView";

type Socket = ReturnType<typeof useGameSocket>;
type View = ReturnType<typeof roomView>;
export type RoomBannerProps = Pick<
  View,
  | "phase"
  | "youAreWatching"
  | "soloWaiting"
  | "readyCount"
  | "humans"
  | "watching"
  | "youAreHost"
  | "youAreReady"
  | "isDrawer"
  | "inGame"
> &
  Pick<
    Socket,
    | "turnEnd"
    | "connected"
    | "settings"
    | "updateSettings"
    | "setReady"
    | "startGame"
    | "game"
    | "wordChoices"
    | "chooseWord"
    | "skipWord"
    | "players"
  > & {
    isAIMode: boolean;
    copyResults: () => Promise<void>;
    resultsCopied: boolean;
    resultSummary: () => string;
    wordLetters: string[];
  };
