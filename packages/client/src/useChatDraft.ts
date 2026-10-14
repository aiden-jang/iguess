import { useEffect, useState } from "react";

export function useChatDraft(room: string) {
  const key = `iguess_chat_${room}`;
  const [text, setText] = useState(() => {
    try {
      return sessionStorage.getItem(key) ?? "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    try {
      if (text) sessionStorage.setItem(key, text);
      else sessionStorage.removeItem(key);
    } catch {
      /* The live draft still works when browser storage is blocked. */
    }
  }, [key, text]);
  return [text, setText] as const;
}
