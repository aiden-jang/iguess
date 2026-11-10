import { useCallback, useState } from "react";
const drafts = new Map<string, string>();
function read(key: string, prefix: string) {
  try {
    const stored = drafts.get(key) ?? sessionStorage.getItem(key) ?? "";
    return stored.startsWith(prefix) ? stored.slice(prefix.length) : "";
  } catch {
    return "";
  }
}
export function useChatDraft(room: string, purpose = "chat", scope?: string) {
  const key = `iguess_${purpose}_${room}`;
  const prefix = scope === undefined ? "" : `${scope}\n`;
  const [draft, setDraft] = useState(() => ({
    key,
    prefix,
    text: read(key, prefix),
  }));
  const text =
    draft.key === key && draft.prefix === prefix
      ? draft.text
      : read(key, prefix);
  const update = useCallback(
    (next: string) => {
      const stored = next ? prefix + next : "";
      drafts.set(key, stored);
      setDraft({ key, prefix, text: next });
      try {
        if (next) sessionStorage.setItem(key, stored);
        else sessionStorage.removeItem(key);
      } catch {
        /* Keep the live draft when browser storage is blocked. */
      }
    },
    [key, prefix],
  );
  return [text, update] as const;
}
