import { useEffect, useState, type ReactNode } from "react";
import { connectionLabel, inviteLabel, type InviteResult } from "./labels";
import { ResourceLinks } from "./ResourceDialog";
import { ClubFace } from "./ClubFace";
import { ConfirmButton } from "./ConfirmButton";
import { styles } from "./styles";

interface RoomSidebarProps {
  room: string;
  modeIcon?: string;
  modeLabel: string;
  connected: boolean;
  everConnected: boolean;
  inviteResult: InviteResult;
  onInvite: () => void;
  muted: boolean;
  onToggleMute: () => void;
  onLeave: () => void;
  /** The scoreboard. It needs the whole roster, which is no business of the chrome around it. */
  children: ReactNode;
}

export function RoomSidebar({
  room,
  modeIcon,
  modeLabel,
  connected,
  everConnected,
  inviteResult,
  onInvite,
  muted,
  onToggleMute,
  onLeave,
  children,
}: RoomSidebarProps) {
  const [rosterOpen, setRosterOpen] = useState(
    () => !window.matchMedia("(max-width: 880px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 880px)");
    const resize = () => setRosterOpen(!media.matches);
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, []);
  return (
    <aside
      aria-label="Room and scoreboard"
      className="glass room-sidebar"
      style={styles.sidebar}
    >
      <div className="room-head" style={styles.roomHead}>
        <span className="room-logo">
          <ClubFace />
        </span>
        <div style={{ minWidth: 0 }}>
          <span className="room-brand">iguess / drawing club</span>
          <div className="grad-anim" title={room} style={styles.roomName}>
            #{room}
          </div>
          <div style={styles.roomMode}>
            {modeIcon} {modeLabel}
          </div>
        </div>
      </div>

      <div
        className="room-connection"
        style={{
          ...styles.statusPill,
          ...(connected ? styles.statusOk : styles.statusBad),
        }}
      >
        <span style={styles.statusDot} />{" "}
        {connectionLabel(connected, everConnected)}
      </div>

      <div className="room-actions">
        <button
          className="lift"
          style={{
            ...styles.inviteButton,
            ...(inviteResult ? styles.inviteButtonOk : null),
          }}
          onClick={onInvite}
        >
          {inviteLabel(inviteResult)}
        </button>

        <button
          aria-pressed={!muted}
          className="lift"
          style={styles.muteButton}
          onClick={onToggleMute}
        >
          {muted ? "🔇 sound off" : "🔊 sound on"}
        </button>

        <ConfirmButton
          className="lift"
          style={styles.leaveButton}
          title="Leave this room?"
          description="You’ll return to the join screen. Save any drawings you want to keep first."
          confirmLabel="Leave room"
          onConfirm={onLeave}
        >
          ← Leave
        </ConfirmButton>
      </div>
      <details
        className="room-roster"
        open={rosterOpen}
        onToggle={(event) => setRosterOpen(event.currentTarget.open)}
      >
        <summary>
          Players & scores <span aria-hidden>⌄</span>
        </summary>
        {children}
      </details>
      <ResourceLinks />
    </aside>
  );
}
