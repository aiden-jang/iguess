import type { RelayServerMessage, RelayState } from "@iguess/shared/relay";
import type { GalleryTurn } from "@iguess/shared/gallery";
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
type WordChoice = { word: string; tier: WordTier };
type Choices = { options: WordChoice[]; canSkip: boolean };
export interface ChatLine {
  sequence?: number;
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
  chatAck?: string;
  game: PublicGameState | null;
  resultTurns: Record<number, GalleryTurn>;
  galleryStatus: "loading" | "complete" | "incomplete";
  relay: RelayState | null;
  relayChain: Extract<RelayServerMessage, { type: "relay_chain" }> | null;
  relayNotice: string | null;
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
  resultTurns: {},
  galleryStatus: "loading",
  relay: null,
  relayChain: null,
  relayNotice: null,
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
const append = (log: ChatLine[], line: ChatLine) => [
  ...log.slice(-199),
  { ...line, sequence: (log.at(-1)?.sequence ?? 0) + 1 },
];
export function roomMessage(state: RoomState, message: RoomEvent): RoomState {
  switch (message.type) {
    case "reset":
      return initialRoomState();
    case "welcome":
      return {
        ...(state.serverMode && state.serverMode !== message.mode
          ? initialRoomState()
          : state),
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
    case "chat_ack":
      return { ...state, chatAck: message.id };
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
        ...(state.game?.phase === "ended" &&
          message.state.phase !== "ended" && {
            resultTurns: {},
            galleryStatus: "loading" as const,
          }),
        game: message.state,
        myWord: message.state.phase === "playing" ? state.myWord : null,
        wordChoices:
          message.state.phase === "choosing" ? state.wordChoices : null,
        peerCursor: null,
      };
    case "gallery_turn":
      return state.game?.phase === "ended" && !state.resultTurns[message.index]
        ? {
            ...state,
            resultTurns: {
              ...state.resultTurns,
              [message.index]: message.turn,
            },
          }
        : state;
    case "gallery_done":
      return state.game?.phase === "ended"
        ? {
            ...state,
            galleryStatus: message.incomplete ? "incomplete" : "complete",
          }
        : state;
    case "relay_state":
      return {
        ...state,
        relay: message.state,
        relayNotice: null,
        relayChain:
          message.state.phase === "reveal" &&
          state.relayChain?.id === message.state.id
            ? state.relayChain
            : null,
      };
    case "relay_progress":
      return state.relay?.phase === "active" &&
        state.relay.id === message.id &&
        state.relay.leg === message.leg
        ? { ...state, relay: { ...state.relay, passed: message.passed } }
        : state;
    case "relay_chain":
      return state.relay?.phase === "reveal" && state.relay.id === message.id
        ? { ...state, relayChain: message }
        : state;
    case "relay_notice":
      return { ...state, relayNotice: message.text };
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
      if (
        state.game?.phase === "intermission" &&
        state.turnEnd?.word === message.word
      )
        return state;
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
