import { useChatDraft } from "./useChatDraft";
import { REACTIONS } from "@iguess/shared";
import type { ChatLine } from "./useWebSocket";
import { isAI } from "./roomView";
import { useChatScroll } from "./useChatScroll";
import { chatPlaceholder } from "./labels";
import { styles } from "./styles";

interface ChatPanelProps {
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
  room,
  connected,
  log,
  drawingNow,
  inGame,
  onReact,
  onSend,
  onSendFailed,
}: ChatPanelProps) {
  const [text, setText] = useChatDraft(room);
  const { chatLogRef, hasNewChat, scrollChatToBottom, onChatScroll } =
    useChatScroll(log.length);

  return (
    <main className="glass chat-panel" style={styles.main}>
      <div className="chat-heading">
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
            onClick={scrollChatToBottom}
          >
            ↓ new messages
          </button>
        )}
      </div>
      <div style={styles.reactRow}>
        {REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="lift"
            style={styles.reactBtn}
            onClick={() => onReact(emoji)}
            disabled={drawingNow || !connected}
            title={`react ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
      <span className="sr-only" id="chat-instruction">
        {drawingNow
          ? "The drawer cannot send chat during their turn."
          : "Type and press Enter to send. Correct guesses score automatically."}
      </span>
      <form
        style={styles.inputRow}
        onSubmit={(e) => {
          e.preventDefault();
          const t = text.trim();
          if (!t) return;
          // An emptied box is how you know you sent it.
          if (onSend(t)) setText("");
          else onSendFailed();
        }}
      >
        <input
          style={{ ...styles.input, flex: 1, margin: 0 }}
          aria-describedby="chat-instruction"
          aria-label={inGame ? "Your guess" : "Chat message"}
          maxLength={500}
          autoComplete="off"
          enterKeyHint="send"
          placeholder={
            !connected
              ? "Reconnecting. Your draft stays here."
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
          disabled={drawingNow || !connected || !text.trim()}
        >
          Send
        </button>
      </form>
    </main>
  );
}
