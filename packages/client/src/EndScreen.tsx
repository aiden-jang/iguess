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
  return (
    <div style={styles.gallery}>
      <div style={styles.galleryHead}>
        <span style={styles.sectionLabel}>the evidence</span>
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
      <div style={styles.galleryStrip}>
        {awards.length > 0 && (
          <ul style={styles.awardList}>
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
          <figure key={i} style={styles.galleryItem}>
            {replayIdx === i ? (
              <Replay ops={g.ops} size={160} />
            ) : (
              <img
                src={g.png}
                alt={`the drawing for "${g.word}"`}
                style={styles.galleryImg}
              />
            )}
            <button
              style={styles.replayButton}
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
              <p style={{ ...styles.galleryGuess, color: "var(--on-good)" }}>
                🤖 got it
              </p>
            ) : g.guess ? (
              <p style={styles.galleryGuess}>🤖 &ldquo;{g.guess}&rdquo;</p>
            ) : (
              <p style={{ ...styles.galleryGuess, opacity: 0.45 }}>
                🤖 no idea
              </p>
            )}
          </figure>
        ))}
      </div>
    </div>
  );
}
