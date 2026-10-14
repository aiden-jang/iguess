import { ClubFace } from "./ClubFace";

export function DoodlePoster() {
  return (
    <figure className="doodle-poster">
      <div className="poster-label">
        <span>EXAMPLE / a cat, allegedly</span>
        <span>Human-made. Somehow.</span>
      </div>
      <div className="poster-scene">
        <svg
          className="poster-cat"
          viewBox="0 0 310 230"
          role="img"
          aria-label="An imperfect cat doodle with uneven ears and whiskers"
        >
          <path
            d="M74 105 68 42 117 75Q157 57 195 78L247 35 237 115Q258 173 212 193Q153 215 99 186Q58 170 74 105Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="m111 124 3 2m67-1 3-2m-43 28 16 0-8 8Zm-29-1-74-8m71 19-67 10m149-21 64-14m-60 28 67 7m-122-13q-9 18-20 8m20-8q12 17 22 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="m264 64 14-8m-8 27 15 3"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
        <div className="poster-conversation">
          <span className="poster-bot">THE AI, CONFIDENTLY</span>
          <p>“a stapler?”</p>
          <span className="poster-reply">Sure. A stapler with ears.</span>
          <div className="poster-stamp">
            <ClubFace />
            <span>
              meh.
              <br />
              close enough.
            </span>
          </div>
        </div>
      </div>
      <figcaption>The confidence is computer-generated.</figcaption>
    </figure>
  );
}
