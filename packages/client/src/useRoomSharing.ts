import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PlayerInfo } from "@iguess/shared";
import { resultsText, type Standings } from "./share";
import { copyText, inviteLink } from "./roomLinks";
import { getStreak } from "./playerStats";
import type { GalleryShot } from "./EndScreen";
import type { InviteResult } from "./labels";
import { useEvidenceSharing } from "./useEvidenceSharing";

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
  const [inviteResult, setInviteResult] = useState<InviteResult>(null);
  const [resultsCopied, setResultsCopied] = useState(false);
  const invitePending = useRef(false);
  const lifetime = useRef(0);
  useLayoutEffect(() => {
    lifetime.current += 1;
    return () => {
      lifetime.current += 1;
      invitePending.current = false;
    };
  }, []);
  const evidence = useEvidenceSharing(room, gallery, players, standings);
  const inviteUrl = inviteLink(room, effectiveMode);
  useEffect(() => {
    if (
      !inviteResult ||
      inviteResult === "sharing" ||
      inviteResult === "failed"
    )
      return;
    const timer = setTimeout(() => setInviteResult(null), 1800);
    return () => clearTimeout(timer);
  }, [inviteResult]);
  useEffect(() => {
    if (!resultsCopied) return;
    const timer = setTimeout(() => setResultsCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [resultsCopied]);
  const handleInvite = async () => {
    if (invitePending.current) return;
    invitePending.current = true;
    const owner = lifetime.current;
    const opener = document.activeElement as HTMLElement | null;
    const current = () => owner === lifetime.current;
    setInviteResult("sharing");
    try {
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({
            title: "iguess",
            text: `Join room ${room} · ${modeLabel}`,
            url: inviteUrl,
          });
          if (current()) setInviteResult("shared");
          return;
        } catch (err) {
          // Closing the share sheet is a decision, not a failure. Real errors fall through to copy.
          if (!current()) return;
          if (err instanceof Error && err.name === "AbortError") {
            setInviteResult(null);
            return;
          }
        }
      }
      if (!current()) return;
      const copied = await copyText(inviteUrl);
      if (current()) setInviteResult(copied ? "copied" : "failed");
    } finally {
      if (current()) {
        invitePending.current = false;
        requestAnimationFrame(() => {
          if (
            current() &&
            opener?.isConnected &&
            document.activeElement === document.body
          )
            opener.focus({ preventScroll: true });
        });
      }
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
    const owner = lifetime.current;
    const ok = await copyText(resultSummary());
    if (owner !== lifetime.current) return;
    if (ok) {
      setResultsCopied(true);
    } else {
      showToast("Couldn’t copy the results. Please try again.");
    }
  };

  return {
    inviteResult,
    inviteUrl,
    resultsCopied,
    handleInvite,
    copyResults,
    ...evidence,
    resultSummary,
  };
}
