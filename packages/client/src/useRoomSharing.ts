import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PlayerInfo } from "@iguess/shared";
import { resultsText, type Standings } from "./share";
import { copyText, inviteLink } from "./roomLinks";
import { getStreak } from "./playerStats";
import type { GalleryShot } from "./EndScreen";
import { useRoomInvite } from "./useRoomInvite";
import { useEvidenceSharing } from "./useEvidenceSharing";

type Props = {
  room: string;
  ended: boolean;
  effectiveMode: string;
  modeLabel: string;
  standings: Standings;
  gallery: GalleryShot[];
  players: PlayerInfo[];
  showToast: (message: string) => void;
};
export function useRoomSharing({
  room,
  ended,
  effectiveMode,
  modeLabel,
  standings,
  gallery,
  players,
  showToast,
}: Props) {
  const invite = useRoomInvite(room, effectiveMode, modeLabel);
  const [resultsCopied, setResultsCopied] = useState(false);
  const [resultsFallback, setResultsFallback] = useState("");
  const lifetime = useRef(0);
  useEffect(() => {
    if (!ended) setResultsFallback("");
  }, [ended]);
  useLayoutEffect(() => {
    lifetime.current += 1;
    return () => {
      lifetime.current += 1;
    };
  }, []);
  useEffect(() => {
    if (!resultsCopied) return;
    const timer = setTimeout(() => setResultsCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [resultsCopied]);
  const evidence = useEvidenceSharing(room, gallery, players, standings);

  const resultSummary = (): string =>
    resultsText(standings, {
      modeLabel: modeLabel,
      inviteUrl: inviteLink(room, effectiveMode),
      streak: getStreak(),
    });

  const copyResults = async () => {
    const owner = lifetime.current;
    const summary = resultSummary();
    const ok = await copyText(summary);
    if (owner !== lifetime.current) return;
    if (ok) {
      setResultsFallback("");
      setResultsCopied(true);
    } else {
      setResultsFallback(summary);
      showToast("Couldn’t copy the results. Select the summary to copy it.");
    }
  };

  return {
    ...invite,
    resultsCopied,
    resultsFallback,
    copyResults,
    ...evidence,
    resultSummary,
  };
}
