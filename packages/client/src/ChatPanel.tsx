import { ReactionSticker } from "./ReactionSticker";
import { useOnline } from "./useOnline";
import { useRoomViewport } from "./useRoomViewport";
import { ClubFace } from "./ClubFace";
import { useEffect, useState } from "react";
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
  guessed?: boolean;
  notice?: string | null;
  onDismissNotice?: () => void;
  reconnecting?: boolean;
  room: string;
  connected: boolean;
  log: ChatLine[];
  drawingNow: boolean;
  inGame: boolean;
  onReact: (emoji: string) => void;
  /** Returns whether it actually went out. */
  onSend: (text: string) => boolean;
  onSendFailed: () => void;
}

export function ChatPanel({
  ended = false,
  guessed = false,
  notice,
  onDismissNotice,
  reconnecting,
  room,
  connected,
  log,
  drawingNow,
  inGame,
  onReact,
  onSend,
  onSendFailed,
}: ChatPanelProps) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!ended) setExpanded(false);
  }, [ended]);
  useRoomViewport();
  const online = useOnline();
  const [text, setText] = useChatDraft(room);
  const { chatLogRef, hasNewChat, scrollChatToBottom, onChatScroll } =
    useChatScroll(log.at(-1));

  const content = (
    <div className="chat-content">
      <div className="chat-heading">
        {(!ended || expanded) && (
          <RoomNotice
            message={notice}
            onDismiss={onDismissNotice}
            reconnecting={reconnecting}
            offline={!online}
          />
        )}
        <span style={styles.sectionLabel}>Chat & guesses</span>
        <span className="chat-hint">
          {drawingNow
            ? "Your pen has the floor."
            : inGame
              ? "Say what you see."
              : "Constructive criticism, loosely."}
        </span>
      </div>
      <div style={styles.chatWrap}>
        <div
          ref={chatLogRef}
          onScroll={onChatScroll}
          style={styles.chatLog}
          role="log"
          aria-live="polite"
          aria-label="game chat and guesses"
        >
          {log.map((line, i) =>
            line.kind === "system" ? (
              <div key={i} className="system-line" style={styles.system}>
                {line.text}
              </div>
            ) : (
              <div key={i} className="chat-line" style={styles.chatLine}>
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
            onClick={scrollChatToBottom}
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
      <span className="sr-only" id="chat-instruction">
        {drawingNow
          ? "The drawer cannot send chat during their turn."
          : "Type and press Enter to send. Correct guesses score automatically."}
      </span>
      {guessed && inGame ? (
        <div className="guess-complete" role="status">
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
            const t = text.trim();
            if (!t) return;
            // An emptied box is how you know you sent it.
            if (online && onSend(t)) setText("");
            else onSendFailed();
          }}
        >
          <input
            style={{ ...styles.input, flex: 1, margin: 0 }}
            aria-describedby="chat-instruction"
            aria-label={inGame ? "Your guess" : "Chat message"}
            maxLength={500}
            autoComplete="off"
            spellCheck={!inGame}
            autoCorrect={inGame ? "off" : "on"}
            autoCapitalize={inGame ? "none" : "sentences"}
            enterKeyHint="send"
            placeholder={
              !connected
                ? "Reconnecting. Your draft stays here."
                : !online
                  ? "Offline. Your draft stays here."
                  : chatPlaceholder(drawingNow, inGame)
            }
            disabled={drawingNow}
            value={text}
            onChange={(e) => setText(e.target.value)}
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
