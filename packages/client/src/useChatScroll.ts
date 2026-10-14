import { useEffect, useRef, useState } from "react";

// How close to the bottom still counts as "reading the latest", in pixels.
const NEAR_BOTTOM_PX = 48;

export function nearBottom(
  scrollHeight: number,
  scrollTop: number,
  clientHeight: number,
): boolean {
  return scrollHeight - scrollTop - clientHeight < NEAR_BOTTOM_PX;
}

/**
 * Only auto-scroll when they are already at the bottom. Someone reading back through the chat
 * should not get yanked to the end every time a message arrives, so they get a badge instead.
 */
export function useChatScroll(revision: unknown) {
  const chatLogRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [hasNewChat, setHasNewChat] = useState(false);

  const scrollChatToBottom = (): void => {
    const el = chatLogRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    following.current = true;
    setHasNewChat(false);
  };

  const onChatScroll = (): void => {
    const el = chatLogRef.current;
    if (!el) return;
    const atEnd = nearBottom(el.scrollHeight, el.scrollTop, el.clientHeight);
    following.current = atEnd;
    if (atEnd) setHasNewChat(false);
  };

  useEffect(() => {
    if (!following.current) {
      setHasNewChat(true);
      return;
    }
    const el = chatLogRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [revision]);

  return { chatLogRef, hasNewChat, scrollChatToBottom, onChatScroll };
}
