import { isAI } from "./roomView";
import { useState } from "react";
import type { DrawOp, PlayerInfo } from "@iguess/shared";
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
  players: PlayerInfo[];
}

export function EndScreen({
  gallery,
  awards,
  onSave,
  saving,
  players,
}: EndScreenProps) {
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
    <section className="results-gallery" aria-label="Finished drawings">
      <div className="gallery-heading">
        <div>
          <p className="eyebrow">
            {gallery.length} {gallery.length === 1 ? "work" : "works"} of
            questionable cultural importance
          </p>
          <h2>The exhibition.</h2>
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
      <div className="gallery-strip" data-count={gallery.length}>
        {awards.length > 0 && (
          <ul className="gallery-awards" aria-label="Game awards">
            {awards.map((a) => (
              <li key={a.title}>
                <span>{a.title}</span>
                <strong>{a.who}</strong>
                <span>{a.detail}</span>
              </li>
            ))}
          </ul>
        )}
        {gallery.map((g, i) => (
          <figure key={i} className="drawing-card">
            <div className="exhibit-label">
              <span>EXHIBIT {String(i + 1).padStart(2, "0")}</span>
              <span>
                {g.aiParticipated === false
                  ? isAI(g.drawerId)
                    ? "MACHINE-MADE"
                    : "HUMAN-MADE"
                  : g.right
                    ? "AI GOT IT"
                    : g.guess
                      ? "OPEN TO INTERPRETATION"
                      : "NO AI VERDICT"}
              </span>
            </div>
            {replayIdx === i ? (
              <Replay ops={g.ops} size={200} aspectRatio={g.aspectRatio} />
            ) : (
              <img
                src={g.png}
                alt={`the drawing for "${g.word}"`}
                loading="lazy"
              />
            )}
            <button
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
            <figcaption>
              <strong className="exhibit-word">{g.word}</strong>
              <span className="exhibit-artist">
                {isAI(g.drawerId)
                  ? "A curated doodle from the machine"
                  : `By ${players.find((player) => player.id === g.drawerId)?.name ?? "an uncredited artist"}`}
              </span>
            </figcaption>
            {g.aiParticipated === false ? (
              <p>{isAI(g.drawerId) ? "Drawn by AI" : "Human-made. Somehow."}</p>
            ) : g.right ? (
              <p>AI got it. Credit where due.</p>
            ) : g.guess ? (
              <p>The machine: &ldquo;{g.guess}&rdquo;</p>
            ) : (
              <p>AI: no comment. Probably for the best.</p>
            )}
          </figure>
        ))}
      </div>
    </section>
  );
}
