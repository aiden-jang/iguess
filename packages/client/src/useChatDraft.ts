import { useCallback, useState } from "react";
const drafts = new Map<string, string>();
function read(key: string) {
  if (drafts.has(key)) return drafts.get(key)!;
  try {
    return sessionStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}
export function useChatDraft(room: string, purpose = "chat") {
  const key = `iguess_${purpose}_${room}`;
  const [draft, setDraft] = useState(() => ({ key, text: read(key) }));
  const text = draft.key === key ? draft.text : read(key);
  const update = useCallback(
    (next: string) => {
      drafts.set(key, next);
      setDraft({ key, text: next });
      try {
        if (next) sessionStorage.setItem(key, next);
        else sessionStorage.removeItem(key);
      } catch {
        /* Keep the live draft when browser storage is blocked. */
      }
    },
    [key],
  );
  return [text, update] as const;
}
