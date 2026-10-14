import type { ReactNode } from "react";
import { connectionLabel, inviteLabel, type InviteResult } from "./labels";
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
  return (
    <aside
      aria-label="Room and scoreboard"
      className="glass"
      style={styles.sidebar}
    >
      <div style={styles.roomHead}>
        <span style={styles.roomMark}>✏️</span>
        <div style={{ minWidth: 0 }}>
          <div className="grad-anim" style={styles.roomName}>
            #{room}
          </div>
          <div style={styles.roomMode}>
            {modeIcon} {modeLabel}
          </div>
        </div>
      </div>

      <div
        style={{
          ...styles.statusPill,
          ...(connected ? styles.statusOk : styles.statusBad),
        }}
      >
        <span style={styles.statusDot} />{" "}
        {connectionLabel(connected, everConnected)}
      </div>

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

      <button className="lift" style={styles.leaveButton} onClick={onLeave}>
        ← leave room
      </button>

      <div style={styles.sectionLabel}>Scoreboard</div>
      {children}
    </aside>
  );
}
