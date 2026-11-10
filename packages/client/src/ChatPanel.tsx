import { ReactionSticker } from "./ReactionSticker";
import { useOnline } from "./useOnline";
import { useRoomViewport } from "./useRoomViewport";
import { ClubFace } from "./ClubFace";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { RoomNotice } from "./RoomNotice";
import { useChatDraft } from "./useChatDraft";
import { REACTION_OPTIONS } from "@iguess/shared";
import type { ChatLine } from "./useWebSocket";
import { isAI } from "./roomView";
import { useChatScroll } from "./useChatScroll";
import { chatPlaceholder } from "./labels";
import { styles } from "./styles";

interface ChatPanelProps {
  ended?: boolean;
  lobbyRoster?: ReactNode;
  guessed?: boolean;
  notice?: string | null;
  onDismissNotice?: () => void;
  reconnecting?: boolean;
  room: string;
  connected: boolean;
  log: ChatLine[];
  drawingNow: boolean;
  inGame: boolean;
  canGuess: boolean;
  onReact: (emoji: string) => void;
  /** Returns whether it actually went out. */
  onSend: (text: string, id: string) => boolean;
  chatAck?: string;
  onSendFailed: () => void;
}

export function ChatPanel({
  ended = false,
  lobbyRoster,
  guessed = false,
  notice,
  onDismissNotice,
  reconnecting,
  room,
  connected,
  log,
  drawingNow,
  inGame,
  canGuess,
  onReact,
  onSend,
  chatAck,
  onSendFailed,
}: ChatPanelProps) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!ended) setExpanded(false);
  }, [ended]);
  useRoomViewport();
  const online = useOnline();
  const [text, setText] = useChatDraft(room);
  const submission = useRef<{ id: string; text: string }>();
  useEffect(() => {
    if (!submission.current || submission.current.id !== chatAck) return;
    if (text.trim() === submission.current.text) setText("");
    submission.current = undefined;
  }, [chatAck, text, setText]);
  const confirmation = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (guessed && inGame) confirmation.current?.focus({ preventScroll: true });
  }, [guessed, inGame]);
  const composing = useRef(false);
  const { chatLogRef, hasNewChat, scrollChatToBottom, onChatScroll } =
    useChatScroll(log.at(-1));

  const content = (
    <div className="chat-content">
      <RoomNotice
        message={notice}
        onDismiss={onDismissNotice}
        reconnecting={reconnecting}
        offline={!online}
      />
      {lobbyRoster}
      <div className="chat-heading">
        <h2>{inGame ? "Chat & guesses" : "Room chat"}</h2>
        <p>
          {drawingNow
            ? "Your pen has the floor."
            : canGuess
              ? "Guess before the clock runs out."
              : "Constructive criticism, loosely."}
        </p>
      </div>
      <span className="sr-only" id="chat-instruction">
        {drawingNow
          ? "The drawer cannot send chat during their turn."
          : canGuess
            ? "Type and press Enter to guess. Correct guesses score automatically."
            : "Type and press Enter to send a public chat message."}
      </span>
      {guessed && inGame ? (
        <div
          ref={confirmation}
          className="guess-complete"
          role="status"
          tabIndex={-1}
        >
          <ClubFace mood="happy" />
          <div>
            <strong>Correct. Nicely observed.</strong>
            <p>
              You’re done for this turn. React or watch while the room catches
              up.
            </p>
          </div>
        </div>
      ) : (
        <form
          className="chat-compose"
          onSubmit={(e) => {
            e.preventDefault();
            if (composing.current) return;
            const t = text.trim();
            if (!t) return;
            const previous = submission.current;
            const id = previous?.text === t ? previous.id : crypto.randomUUID();
            if (online && onSend(t, id)) submission.current = { id, text: t };
            else onSendFailed();
          }}
        >
          <input
            style={{ ...styles.input, flex: 1, margin: 0 }}
            aria-describedby="chat-instruction"
            aria-label={canGuess ? "Your guess" : "Chat message"}
            name="message"
            maxLength={500}
            autoComplete="off"
            spellCheck={!canGuess}
            autoCorrect={canGuess ? "off" : "on"}
            autoCapitalize={canGuess ? "none" : "sentences"}
            enterKeyHint="send"
            placeholder={
              !connected
                ? "Reconnecting. Your draft stays here."
                : !online
                  ? "Offline. Your draft stays here."
                  : chatPlaceholder(drawingNow, canGuess)
            }
            disabled={drawingNow}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onCompositionStart={() => (composing.current = true)}
            onCompositionEnd={() => (composing.current = false)}
            onKeyDown={(e) => {
              // Safari can end composition before its confirming Enter arrives.
              if (
                e.key === "Enter" &&
                (composing.current ||
                  e.nativeEvent.isComposing ||
                  e.keyCode === 229)
              )
                e.preventDefault();
            }}
          />
          <button
            className="lift"
            style={styles.button}
            type="submit"
            disabled={drawingNow || !connected || !online || !text.trim()}
          >
            Send
          </button>
        </form>
      )}
      <div style={styles.chatWrap}>
        <div
          ref={chatLogRef}
          onScroll={onChatScroll}
          style={styles.chatLog}
          role="log"
          tabIndex={0}
          aria-live="polite"
          aria-label="game chat and guesses"
        >
          {log.map((line, i) =>
            line.kind === "system" ? (
              <div
                key={line.sequence ?? i}
                className="system-line"
                style={styles.system}
              >
                {line.text}
              </div>
            ) : (
              <div
                key={line.sequence ?? i}
                className="chat-line"
                style={styles.chatLine}
              >
                <span
                  className="chat-author"
                  style={{
                    ...styles.chatFrom,
                    ...(isAI(line.from?.id) ? styles.chatFromAI : null),
                  }}
                >
                  {isAI(line.from?.id) ? "🤖 " : ""}
                  {line.from?.name}
                </span>
                <span style={styles.chatText}>{line.text}</span>
              </div>
            ),
          )}
          {log.length === 0 && (
            <div style={styles.system}>Quiet room. Suspiciously civilized.</div>
          )}
        </div>
        {hasNewChat && (
          <button
            type="button"
            className="lift"
            style={styles.newMsgBtn}
            onPointerDown={(event) => event.preventDefault()}
            onClick={(event) => {
              if (event.detail === 0)
                chatLogRef.current?.focus({ preventScroll: true });
              scrollChatToBottom();
            }}
          >
            ↓ new messages
          </button>
        )}
      </div>
      <div className="reaction-bar">
        {REACTION_OPTIONS.map(({ emoji, name, caption }) => (
          <button
            key={emoji}
            type="button"
            className="lift"
            style={styles.reactBtn}
            onClick={() => onReact(emoji)}
            disabled={drawingNow || !connected || !online}
            aria-label={`React with ${name}`}
            title={`${emoji} ${caption}`}
          >
            <ReactionSticker emoji={emoji} />
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <aside
      aria-label="Chat and guesses"
      className="glass chat-panel"
      data-drawing={drawingNow}
      data-notice={!!notice || !!reconnecting || !online}
    >
      {ended ? (
        <details
          className="chat-disclosure"
          open={expanded}
          onToggle={(event) => {
            setExpanded(event.currentTarget.open);
            if (event.currentTarget.open)
              requestAnimationFrame(scrollChatToBottom);
          }}
        >
          <summary>
            <span>Room chat · {log.length} messages</span>
            <span
              className="chat-summary-note"
              role={notice ? "status" : undefined}
            >
              {!expanded ? (!online ? "Offline · draft kept" : notice) : null}
            </span>
            <Icon name="chevron" />
          </summary>
          {content}
        </details>
      ) : (
        content
      )}
    </aside>
  );
}
