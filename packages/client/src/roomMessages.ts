import {
  DEFAULT_SETTINGS,
  type PlayerInfo,
  type PublicGameState,
  type GameModeName,
  type WordTier,
  type RoomSettings,
  type Point,
  type ServerMessage,
} from "@iguess/shared";
export type WordChoice = { word: string; tier: WordTier };
export type Choices = { options: WordChoice[]; canSkip: boolean };
export interface ChatLine {
  kind: "chat" | "system";
  from?: PlayerInfo;
  text: string;
  isGuess?: boolean;
}
export interface RoomState {
  you: PlayerInfo | null;
  serverMode: GameModeName | null;
  players: PlayerInfo[];
  log: ChatLine[];
  game: PublicGameState | null;
  myWord: string | null;
  turnEnd: { word: string; at: number } | null;
  wordChoices: Choices | null;
  settings: RoomSettings;
  peerCursor: Point | null;
  reactions: { id: number; emoji: string; at: number; expiresAt: number }[];
}
export const initialRoomState = (): RoomState => ({
  you: null,
  serverMode: null,
  players: [],
  log: [],
  game: null,
  myWord: null,
  turnEnd: null,
  wordChoices: null,
  settings: DEFAULT_SETTINGS,
  peerCursor: null,
  reactions: [],
});
export type RoomEvent =
  | (ServerMessage & { receivedAt?: number })
  | { type: "reset" }
  | { type: "expire_reaction"; id: number };
const append = (log: ChatLine[], line: ChatLine) => [...log.slice(-199), line];
export function roomMessage(state: RoomState, message: RoomEvent): RoomState {
  switch (message.type) {
    case "reset":
      return initialRoomState();
    case "welcome":
      return {
        ...state,
        you: message.you,
        serverMode: message.mode,
        settings: message.settings,
      };
    case "presence":
      return {
        ...state,
        players: message.players,
        you:
          message.players.find((player) => player.id === state.you?.id) ??
          state.you,
      };
    case "chat":
      return {
        ...state,
        log: append(state.log, {
          kind: "chat",
          from: message.from,
          text: message.text,
          isGuess: message.isGuess,
        }),
      };
    case "system":
      return {
        ...state,
        log: append(state.log, { kind: "system", text: message.text }),
      };
    case "game_state":
      return {
        ...state,
        game: message.state,
        myWord: message.state.phase === "playing" ? state.myWord : null,
        wordChoices:
          message.state.phase === "choosing" ? state.wordChoices : null,
        peerCursor: null,
      };
    case "settings":
      return { ...state, settings: message.settings };
    case "cursor":
      return { ...state, peerCursor: message.point };
    case "react":
      return {
        ...state,
        reactions: [
          ...state.reactions.slice(-24),
          {
            id: (state.reactions.at(-1)?.id ?? 0) + 1,
            emoji: message.emoji,
            at: message.at,
            expiresAt: (message.receivedAt ?? 0) + 2200,
          },
        ],
      };
    case "expire_reaction":
      return {
        ...state,
        reactions: state.reactions.filter(
          (reaction) => reaction.id !== message.id,
        ),
      };
    case "word_choices":
      return {
        ...state,
        wordChoices: {
          options: message.words.map((word, i) => ({
            word,
            tier: message.tiers[i] ?? "easy",
          })),
          canSkip: message.canSkip,
        },
      };
    case "your_word":
      return { ...state, myWord: message.word, wordChoices: null };
    case "turn_end":
      return {
        ...state,
        myWord: null,
        turnEnd: { word: message.word, at: (state.turnEnd?.at ?? 0) + 1 },
        log: append(state.log, {
          kind: "system",
          text: `The word was: ${message.word}`,
        }),
      };
    default:
      return state;
  }
}
