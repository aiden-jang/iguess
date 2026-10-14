import { isAI } from "./roomView";
import { useState } from "react";
import type { DrawOp } from "@iguess/shared";
import type { EvidenceItem } from "./evidenceCard";
import { Replay } from "./Replay";
import { styles } from "./styles";

/** A finished turn: the still for sharing, plus the strokes so it can be replayed. */
export interface GalleryShot extends EvidenceItem {
  drawerId: string | null;
  ops: DrawOp[];
  aspectRatio?: number;
}

export interface Award {
  title: string;
  who: string;
  detail: string;
}

interface EndScreenProps {
  gallery: GalleryShot[];
  awards: Award[];
  onSave: () => Promise<void> | void;
  saving: boolean;
}

export function EndScreen({ gallery, awards, onSave, saving }: EndScreenProps) {
  const [replayIdx, setReplayIdx] = useState<number | null>(null);
  if (gallery.length === 0)
    return (
      <section className="empty-gallery">
        <h2>No evidence on file.</h2>
        <p>
          Drawings are collected while you’re in the room. Play another game to
          start your gallery.
        </p>
      </section>
    );
  return (
    <section
      className="results-gallery"
      aria-label="Finished drawings"
      style={styles.gallery}
    >
      <div className="gallery-heading" style={styles.galleryHead}>
        <div>
          <p className="eyebrow">
            {gallery.length} {gallery.length === 1 ? "work" : "works"} of
            questionable genius
          </p>
          <h2>The evidence.</h2>
        </div>
        <button
          className="lift"
          style={styles.ghostButton}
          disabled={saving}
          onClick={() => void onSave()}
          title="one image of every drawing and what the AI thought it was"
        >
          {saving ? "Preparing image…" : "Share the evidence"}
        </button>
      </div>
      <div className="gallery-strip" style={styles.galleryStrip}>
        {awards.length > 0 && (
          <ul
            className="gallery-awards"
            aria-label="Game awards"
            style={styles.awardList}
          >
            {awards.map((a) => (
              <li key={a.title} style={styles.awardItem}>
                <span style={styles.awardTitle}>{a.title}</span>
                <strong style={styles.awardWho}>{a.who}</strong>
                <span style={styles.awardDetail}>{a.detail}</span>
              </li>
            ))}
          </ul>
        )}
        {gallery.map((g, i) => (
          <figure key={i} className="drawing-card" style={styles.galleryItem}>
            {replayIdx === i ? (
              <Replay ops={g.ops} size={200} aspectRatio={g.aspectRatio} />
            ) : (
              <img
                src={g.png}
                alt={`the drawing for "${g.word}"`}
                style={styles.galleryImg}
                loading="lazy"
              />
            )}
            <button
              style={styles.replayButton}
              aria-pressed={replayIdx === i}
              aria-label={`${replayIdx === i ? "Show still" : "Replay"}: ${g.word}`}
              onClick={() => setReplayIdx(replayIdx === i ? null : i)}
              title={
                replayIdx === i
                  ? "show the finished drawing"
                  : "watch it being drawn"
              }
            >
              {replayIdx === i ? "◼ still" : "▶ replay"}
            </button>
            <figcaption style={styles.galleryCaption}>{g.word}</figcaption>
            {g.aiParticipated === false ? (
              <p style={styles.galleryGuess}>
                {isAI(g.drawerId) ? "Drawn by AI" : "Human-made. Somehow."}
              </p>
            ) : g.right ? (
              <p style={{ ...styles.galleryGuess, color: "#236b64" }}>
                AI got it. Credit where due.
              </p>
            ) : g.guess ? (
              <p style={styles.galleryGuess}>🤖 &ldquo;{g.guess}&rdquo;</p>
            ) : (
              <p style={{ ...styles.galleryGuess, opacity: 1 }}>
                AI: no idea. Same, honestly.
              </p>
            )}
          </figure>
        ))}
      </div>
    </section>
  );
}
