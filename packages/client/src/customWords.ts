import { cleanCustomWord, SETTINGS_LIMITS } from "@iguess/shared";
export function customWordDraft(draft: string) {
  const entries = draft
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const invalid = entries.find((value) => !cleanCustomWord(value));
  const words = [
    ...new Set(
      entries.map(cleanCustomWord).filter((word): word is string => !!word),
    ),
  ];
  const error = invalid
    ? `“${invalid}” needs 2–24 letters. Edit it before saving.`
    : words.length > SETTINGS_LIMITS.customWords.maxCount
      ? "Use up to 40 unique custom words."
      : "";
  return { words, error };
}
