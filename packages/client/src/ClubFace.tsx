export function ClubFace({ mood = "meh" }: { mood?: "meh" | "happy" }) {
  return (
    <svg
      className="club-face"
      viewBox="0 0 80 72"
      fill="none"
      aria-hidden="true"
    >
      <path d="M13 12Q39 2 66 13L72 56Q40 74 8 56Z" fill="currentColor" />
      <path
        className="face-eyes"
        d="m27 30 1 4m24-4-1 4"
        stroke="var(--ink)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d={mood === "happy" ? "M28 45q12 13 24 0" : "m30 48 20-1"}
        stroke="var(--ink)"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
