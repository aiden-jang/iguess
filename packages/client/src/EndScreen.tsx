import { isAI } from "./roomView";
import { useState } from "react";
import type { DrawOp, PlayerInfo } from "@iguess/shared";
import type { EvidenceItem } from "./evidenceCard";
import { DrawingThumbnail } from "./DrawingThumbnail";
import { Replay } from "./Replay";
import { styles } from "./styles";

/** A finished turn: the still for sharing, plus the strokes so it can be replayed. */
export interface GalleryShot extends EvidenceItem {
  drawerId: string | null;
  ops: DrawOp[];
  aspectRatio?: number;
}

interface Award {
  title: string;
  who: string;
  detail: string;
}

interface EndScreenProps {
  gallery: GalleryShot[];
  awards: Award[];
  onSave: () => Promise<string | void> | string | void;
  onShare: () => Promise<string | void>;
  canShare: boolean;
  blankRounds?: number;
  saving: boolean;
  players: PlayerInfo[];
}

export function EndScreen({
  gallery,
  blankRounds = 0,
  awards,
  onSave,
  onShare,
  canShare,
  saving,
  players,
}: EndScreenProps) {
  const [shareMessage, setShareMessage] = useState("");
  const [replayIdx, setReplayIdx] = useState<number | null>(null);
  if (gallery.length === 0)
    return (
      <section className="empty-gallery">
        <h2>
          {blankRounds ? "Minimalism. Committed." : "No evidence on file."}
        </h2>
        <p>
          {blankRounds
            ? `${blankRounds} blank ${blankRounds === 1 ? "canvas" : "canvases"}. Nothing to save this time. Another round?`
            : "Drawings are collected while you’re in the room. Play another game to start your gallery."}
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
        <div className="gallery-actions">
          <button
            className="lift"
            style={styles.ghostButton}
            disabled={saving}
            onClick={async () => {
              setShareMessage("");
              try {
                setShareMessage((await onSave()) || "");
              } catch {
                setShareMessage(
                  "Couldn’t prepare the image. Please try again.",
                );
              }
            }}
            title={
              gallery.length > 8
                ? "The share image includes the first eight drawings. All drawings stay in this room."
                : "One image of every drawing and the AI verdicts"
            }
          >
            {saving ? "Preparing image…" : "Save the evidence"}
          </button>
          {canShare && (
            <button
              className="lift"
              style={styles.ghostButton}
              disabled={saving}
              onClick={async () => setShareMessage((await onShare()) || "")}
            >
              Share image
            </button>
          )}
          {gallery.length > 8 && (
            <small className="share-limit">
              First 8 of {gallery.length} drawings in the image.
            </small>
          )}
          <p className="share-feedback" role="status">
            {shareMessage}
          </p>
        </div>
      </div>
      {blankRounds > 0 && (
        <p className="blank-round-note">
          Also submitted: {blankRounds} blank{" "}
          {blankRounds === 1 ? "canvas" : "canvases"}. A restrained
          contribution.
        </p>
      )}
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
              <DrawingThumbnail src={g.png} word={g.word} />
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
