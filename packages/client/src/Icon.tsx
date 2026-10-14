const paths = {
  pen: "m4 16-1 5 5-1L21 7l-4-4L4 16Zm10-10 4 4",
  erase: "m3 14 9-10 9 8-8 9H9l-6-7Zm4-4 9 8M13 21h9",
  fill: "m5 3 12 12-7 7-9-9L11 3M3 11h12m5 4s-3 4-3 5a3 3 0 0 0 6 0c0-1-3-5-3-5Z",
  undo: "M8 4 2 10l6 6M3 10h11a7 7 0 0 1 0 14",
  save: "M12 2v13m-5-5 5 5 5-5M3 17v5h18v-5",
  arrow: "M5 19 19 5M5 5h14v14",
  close: "m5 5 14 14M19 5 5 19",
  chevron: "m6 9 6 6 6-6",
  play: "m7 3 14 9L7 21V3Z",
  pause: "M7 4v16M17 4v16",
  restart: "M4 9a9 9 0 1 1 0 7M4 3v6h6",
  sound: "m3 9 5 0 5-5v16l-5-5H3V9Zm14-2a7 7 0 0 1 0 10m3-13a11 11 0 0 1 0 16",
  muted: "m3 9 5 0 5-5v16l-5-5H3V9Zm14-1 6 8m0-8-6 8",
  check: "m4 12 5 5L21 5",
  more: "M5 12h.1M12 12h.1M19 12h.1",
};
export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      className="ui-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
