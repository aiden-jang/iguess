import { useEffect, useState } from "react";
import type { PlayerInfo } from "@iguess/shared";
import { awardsFor } from "@iguess/shared/awards";
import { renderEvidencePng } from "./evidenceCard";
import {
  resultsText,
  scoreLine,
  shareOrDownload,
  type Standings,
} from "./share";
import { copyText, inviteLink } from "./roomLinks";
import { getStreak } from "./playerStats";
import type { GalleryShot } from "./EndScreen";

type Props = {
  room: string;
  effectiveMode: string;
  modeLabel: string;
  standings: Standings;
  gallery: GalleryShot[];
  players: PlayerInfo[];
  showToast: (message: string) => void;
};
export function useRoomSharing({
  room,
  effectiveMode,
  modeLabel,
  standings,
  gallery,
  players,
  showToast,
}: Props) {
  const [inviteResult, setInviteResult] = useState<"copied" | "shared" | null>(
    null,
  );
  const [resultsCopied, setResultsCopied] = useState(false);
  const [savingEvidence, setSavingEvidence] = useState(false);
  useEffect(() => {
    if (!inviteResult) return;
    const timer = setTimeout(() => setInviteResult(null), 1800);
    return () => clearTimeout(timer);
  }, [inviteResult]);
  useEffect(() => {
    if (!resultsCopied) return;
    const timer = setTimeout(() => setResultsCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [resultsCopied]);
  const handleInvite = async () => {
    const url = inviteLink(room, effectiveMode);

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "iguess",
          text: `Join room ${room} · ${modeLabel}`,
          url,
        });
        setInviteResult("shared");
        return;
      } catch (err) {
        // Closing the share sheet is a decision, not a failure. Real errors fall through to copy.
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }

    if (await copyText(url)) {
      setInviteResult("copied");
    } else {
      showToast("Couldn’t copy the invite. Share the URL in your address bar.");
    }
  };

  const saveEvidence = async () => {
    if (savingEvidence || gallery.length === 0) return;
    setSavingEvidence(true);
    try {
      const blob = await renderEvidencePng(
        gallery.map((item) => ({
          ...item,
          artist: players.find((player) => player.id === item.drawerId)?.name,
        })),
        scoreLine(standings),
        awardsFor(gallery, players),
      );
      const outcome = await shareOrDownload(
        blob,
        `iguess-evidence-${room}.png`,
        {
          title: "iguess evidence",
          text: "the drawings, the score, and what the AI thought it saw",
        },
      );
      return outcome === "cancelled"
        ? "Share cancelled. The drawings are still here."
        : outcome === "shared"
          ? "Shared."
          : "Download started.";
    } catch {
      return "Couldn’t save the image. Please try again.";
    } finally {
      setSavingEvidence(false);
    }
  };

  // Read at click time, not on render: getStreak hits storage and the score can still move.
  const resultSummary = (): string =>
    resultsText(standings, {
      modeLabel: modeLabel,
      inviteUrl: inviteLink(room, effectiveMode),
      streak: getStreak(),
    });

  const copyResults = async () => {
    const ok = await copyText(resultSummary());
    if (ok) {
      setResultsCopied(true);
    } else {
      showToast("Couldn’t copy the results. Please try again.");
    }
  };

  return {
    inviteResult,
    resultsCopied,
    savingEvidence,
    handleInvite,
    copyResults,
    saveEvidence,
    resultSummary,
  };
}
