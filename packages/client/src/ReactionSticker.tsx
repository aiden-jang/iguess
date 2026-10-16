const drawings: Record<string, React.ReactNode> = {
  "😭": (
    <>
      <path fill="#d8ed79" d="M6 5q10-5 20 0l2 19q-12 9-24 0Z" />
      <path d="m9 10 4 2m6 0 4-2M13 23q3-5 6 0" />
      <path stroke="#6197ae" strokeWidth="3" d="M10 15v7m12-7v7" />
    </>
  ),
  "💀": (
    <>
      <path
        fill="#f2f2e9"
        d="M5 14a11 11 0 1 1 22 0q0 7-6 8v6H11v-6q-6-1-6-8Z"
      />
      <path fill="#202522" d="M9 13h4v4H9zm10 0h4v4h-4zm-3 4 2 4h-4Z" />
      <path d="M14 24v4m4-4v4" />
    </>
  ),
  "🫠": (
    <>
      <path
        fill="#d8ed79"
        d="M6 17C0 1 31-3 27 17q-2 6 2 7c7 5-4 7-9 4-3 6-10-1-13 0-9 1-5-7-1-11Z"
      />
      <path d="m10 10 3 1m6 0 3-1M12 17q4 3 8-1" />
    </>
  ),
  "🫡": (
    <>
      <path fill="#d8ed79" d="M7 7q10-6 18 2l1 15q-10 8-20-1Z" />
      <path d="M10 13h3m7 0h2m-10 8 7 1" />
      <path fill="#f2f2e9" d="m20 9 3-6 7 1-6 4 5 1-1 4Z" />
    </>
  ),
  "🤨": (
    <>
      <path fill="#d8ed79" d="M5 8q10-8 22 0v17q-11 7-22 0Z" />
      <path d="m8 9 6 1m5-3 6 3M10 14h2m8 0h2m-10 8 8-1" />
    </>
  ),
  "🗿": (
    <>
      <path fill="#a9b5a0" d="m9 3 16 2-1 23H7l1-13 5-1Z" />
      <path d="m11 11 4-1m4 0 4 1m-6-1-2 9h5m-9 5h10" />
    </>
  ),
  "🥀": (
    <>
      <path stroke="#65705e" d="M13 28q10-15 6-20M15 22q-9 1-8-5 7-1 8 5" />
      <path fill="#cb8f9a" d="m19 5 5-2 4 5-4 9-7-5-3-6Z" />
      <path d="m18 7 4 4 3-5" />
    </>
  ),
  "🔥": (
    <>
      <path
        fill="#e6ad96"
        d="M16 2q14 11 11 20-2 10-13 7C0 26 4 15 10 10l-1 9Q17 13 16 2Z"
      />
      <path fill="#d8ed79" d="M16 17q8 9 1 12-10 0-6-7Z" />
    </>
  ),
};

export function ReactionSticker({ emoji }: { emoji: string }) {
  const drawing = drawings[emoji];
  return drawing ? (
    <svg
      className="reaction-sticker"
      data-reaction={emoji}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="#202522"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {drawing}
    </svg>
  ) : (
    <span aria-hidden="true" data-reaction={emoji}>
      {emoji}
    </span>
  );
}
