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
    effectiveMode: string;
    copyResults: () => Promise<void>;
    resultsCopied: boolean;
    resultsFallback: string;
    resultSummary: () => string;
    wordLetters: string[];
  };
