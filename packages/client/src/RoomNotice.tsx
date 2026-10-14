import { Icon } from "./Icon";
export function RoomNotice({
  message,
  reconnecting,
  offline,
  onDismiss,
}: {
  message?: string | null;
  reconnecting?: boolean;
  offline?: boolean;
  onDismiss?: () => void;
}) {
  if (!message && !reconnecting && !offline) return null;
  return (
    <div
      className="room-notice"
      role={reconnecting || offline ? "alert" : "status"}
      aria-live={reconnecting || offline ? "assertive" : "polite"}
    >
      <span>
        {offline
          ? "You’re offline. Your draft is kept in this tab. Reconnect to send."
          : reconnecting
            ? "Connection lost. Reconnecting—your unsent message stays here."
            : message}
      </span>
      {!reconnecting && !offline && onDismiss && (
        <button
          type="button"
          aria-label="Dismiss room update"
          onClick={onDismiss}
        >
          <Icon name="close" />
        </button>
      )}
    </div>
  );
}
