import { useLayoutEffect, useRef, useState } from "react";
import type { PlayerInfo } from "@iguess/shared";
import { awardsFor } from "@iguess/shared/awards";
import { drawingFilename } from "./downloadName";
import { renderEvidencePng } from "./evidenceCard";
import type { GalleryShot } from "./EndScreen";
import {
  canShareFile,
  downloadFile,
  scoreLine,
  shareOrDownload,
  type Standings,
} from "./share";

export function useEvidenceSharing(
  room: string,
  gallery: GalleryShot[],
  players: PlayerInfo[],
  standings: Standings,
) {
  const [savingEvidence, setSaving] = useState(false);
  const [prepared, setPrepared] = useState<{
    gallery: GalleryShot[];
    file: File;
  } | null>(null);
  const latest = useRef(gallery);
  latest.current = gallery;
  const lifetime = useRef(0);
  const pending = useRef(false);
  useLayoutEffect(() => {
    lifetime.current += 1;
    return () => {
      lifetime.current += 1;
      pending.current = false;
    };
  }, []);
  const file = prepared?.gallery === gallery ? prepared.file : null;
  const canShareEvidence = !!file && canShareFile(file);
  const saveEvidence = async () => {
    if (pending.current || gallery.length === 0) return;
    pending.current = true;
    const owner = lifetime.current;
    setSaving(true);
    try {
      const blob = await renderEvidencePng(
        gallery.map((item) => ({
          ...item,
          artist: players.find((player) => player.id === item.drawerId)?.name,
        })),
        scoreLine(standings),
        awardsFor(gallery, players),
      );
      if (owner !== lifetime.current || latest.current !== gallery) return;
      const next = new File([blob], drawingFilename("evidence", room), {
        type: "image/png",
      });
      downloadFile(next);
      setPrepared({ gallery, file: next });
      return "Download started.";
    } catch {
      if (owner === lifetime.current)
        return "Couldn’t save the image. Please try again.";
    } finally {
      if (owner === lifetime.current) {
        pending.current = false;
        setSaving(false);
      }
    }
  };
  const shareEvidence = async () => {
    if (!file || !canShareEvidence || pending.current) return;
    pending.current = true;
    const owner = lifetime.current;
    setSaving(true);
    const current = () =>
      owner === lifetime.current && latest.current === gallery;
    try {
      // The image is already prepared, so this call retains the share button's user activation.
      const outcome = await shareOrDownload(
        file,
        file.name,
        {
          title: "iguess evidence",
          text: "the drawings, the score, and what the AI thought it saw",
        },
        current,
      );
      if (!current()) return;
      return outcome === "cancelled"
        ? "Share cancelled. The drawings are still here."
        : outcome === "shared"
          ? "Shared."
          : "Download started.";
    } catch {
      if (current())
        return "Couldn’t share the image. You can still save a copy.";
    } finally {
      if (owner === lifetime.current) {
        pending.current = false;
        setSaving(false);
      }
    }
  };
  return { savingEvidence, saveEvidence, canShareEvidence, shareEvidence };
}
