import type { ReactNode } from "react";
import { useDismissibleDetails } from "./useDismissibleDetails";
import { connectionLabel, inviteLabel, type InviteResult } from "./labels";
import { FeedbackSettings } from "./FeedbackSettings";
import { ScoreReadout } from "./ScoreReadout";
import { Icon } from "./Icon";
import { ResourceLinks } from "./ResourceDialog";
import { ClubFace } from "./ClubFace";
import { ConfirmButton } from "./ConfirmButton";

interface Props {
  room: string;
  points?: number;
  modeLabel: string;
  connected: boolean;
  everConnected: boolean;
  inviteResult: InviteResult;
  onInvite: () => void;
  muted: boolean;
  onToggleMute: () => void;
  onLeave: () => void;
  children: ReactNode;
}

export function RoomHeader(p: Props) {
  const roster = useDismissibleDetails();
  return (
    <header className="room-header" aria-label="Room controls">
      <div className="room-identity">
        <span className="room-wordmark">
          iguess
          <ClubFace />
        </span>
        <div className="room-context">
          <span title={p.room} className="room-code">
            #{p.room}
          </span>
          <span className="room-mode">{p.modeLabel}</span>
        </div>
      </div>
      <div className="room-connection" data-connected={p.connected}>
        <span aria-hidden />
        {connectionLabel(p.connected, p.everConnected)}
      </div>
      <div className="room-actions">
        <details {...roster} className="room-roster">
          <summary>
            <span className="roster-long">Players & scores</span>
            <span className="roster-short">Players</span>
            <ScoreReadout points={p.points} />
            <Icon name="chevron" />
          </summary>
          <div className="roster-popover">
            <div className="roster-heading">
              <span className="eyebrow">The jury</span>
              <span>Everybody has an opinion.</span>
            </div>
            {p.children}
            <FeedbackSettings />
          </div>
        </details>
        <button
          type="button"
          className="room-invite"
          onClick={p.onInvite}
          aria-label={inviteLabel(p.inviteResult)}
        >
          <span className="invite-full" aria-hidden>
            {inviteLabel(p.inviteResult)}
          </span>
          <span className="invite-short" aria-hidden>
            {p.inviteResult === "copied"
              ? "Copied ✓"
              : p.inviteResult === "shared"
                ? "Shared ✓"
                : "Invite"}
          </span>
          {!p.inviteResult && <Icon name="arrow" />}
        </button>
        <button
          type="button"
          className="room-sound"
          aria-pressed={!p.muted}
          onClick={p.onToggleMute}
        >
          {p.muted ? "Sound off" : "Sound on"}
        </button>
        <ConfirmButton
          className="room-leave"
          title="Leave this room?"
          description="You’ll return to the join screen. Save any drawings you want to keep first."
          confirmLabel="Leave room"
          onConfirm={p.onLeave}
        >
          ← Leave
        </ConfirmButton>
        <ResourceLinks />
      </div>
    </header>
  );
}
