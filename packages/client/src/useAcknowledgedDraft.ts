import { useEffect, useRef } from "react";
import { useChatDraft } from "./useChatDraft";

export function useAcknowledgedDraft(
  room: string,
  purpose: "chat" | "guess",
  ack?: string,
  scope?: string,
) {
  const [text, setText] = useChatDraft(room, purpose, scope);
  const pending = useRef<{
    id: string;
    text: string;
    room: string;
    scope?: string;
  }>();
  useEffect(() => {
    const previous = pending.current;
    if (!previous || previous.id !== ack) return;
    if (
      previous.room === room &&
      previous.scope === scope &&
      previous.text === text.trim()
    )
      setText("");
    pending.current = undefined;
  }, [ack, room, scope, setText, text]);

  function send(value: string, write: (text: string, id: string) => boolean) {
    const previous = pending.current;
    const id =
      previous?.room === room &&
      previous.scope === scope &&
      previous.text === value
        ? previous.id
        : crypto.randomUUID();
    if (!write(value, id)) return false;
    pending.current = { id, text: value, room, scope };
    return true;
  }
  return { text, setText, send };
}
