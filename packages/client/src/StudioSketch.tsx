import "./studio-art.css";

export function StudioSketch({ kind }: { kind: "lobby" | "waiting" }) {
  return (
    <svg
      className="studio-sketch"
      data-kind={kind}
      viewBox="0 0 160 120"
      fill="none"
      aria-hidden="true"
    >
      <g
        stroke="var(--ink)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {kind === "lobby" ? (
          <>
            <g transform="rotate(-8 67 69)">
              <path d="M24 30h81l9 77H24Z" fill="var(--paper)" />
              <path d="m35 53 12-8 12 12 17-8 14 9m-55 17c22-18 34 20 54-3m-52 18 34 3" />
            </g>
            <g transform="rotate(14 123 61)">
              <path d="M113 18h18v68l-9 16-9-16Z" fill="var(--sticker)" />
              <path d="M113 29h18m-18 53 9 4 9-4m-9-51v48" />
              <path d="m119 97 3 5 3-5" fill="var(--ink)" />
            </g>
            <path
              d="m119 8 3-5m15 13 6-2m-7 84 8 4"
              stroke="var(--sticker)"
              strokeWidth="4"
            />
          </>
        ) : (
          <>
            <path d="m21 35 74-8 9 75-74 8Z" fill="var(--sticker)" />
            <path d="m29 25 73 6-6 74-73-6Z" fill="var(--paper)" />
            <path d="m38 46 44 5m-45 9 29 3m-29 15 34 3" stroke="var(--line)" />
            <path
              d="M114 33h27m-27 55h27m-23-54c0 16 9 16 9 27s-9 11-9 26m19-53c0 16-10 16-10 27s10 11 10 26"
              fill="var(--paper)"
            />
            <path d="m119 82 8-13 9 13Z" fill="var(--sticker)" />
          </>
        )}
      </g>
    </svg>
  );
}
