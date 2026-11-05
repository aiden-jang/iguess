import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { copyText, inviteLink } from "./roomLinks";
import type { InviteResult } from "./labels";

export function useRoomInvite(
  room: string,
  effectiveMode: string,
  modeLabel: string,
) {
  const [inviteResult, setInviteResult] = useState<InviteResult>(null);
  const invitePending = useRef(false);
  const lifetime = useRef(0);
  useLayoutEffect(() => {
    lifetime.current += 1;
    return () => {
      lifetime.current += 1;
      invitePending.current = false;
    };
  }, []);
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

  return { inviteResult, inviteUrl, handleInvite };
}
