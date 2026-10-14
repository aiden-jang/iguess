import { useEffect, useState } from "react";
import { ClubFace } from "./ClubFace";
export function DrawingThumbnail({ src, word }: { src: string; word: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (failed)
    return (
      <div
        className="thumbnail-fallback"
        role="img"
        aria-label={`Preview unavailable for ${word}`}
      >
        <ClubFace />
        <p>Preview couldn’t load.</p>
        <small>The stroke replay is still available.</small>
      </div>
    );
  return (
    <img
      src={src}
      alt={`the drawing for "${word}"`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
