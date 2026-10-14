import { Icon } from "./Icon";
export function RoomNotice({
  message,
  reconnecting,
  onDismiss,
}: {
  message?: string | null;
  reconnecting?: boolean;
  onDismiss?: () => void;
}) {
  if (!message && !reconnecting) return null;
  return (
    <div
      className="room-notice"
      role={reconnecting ? "alert" : "status"}
      aria-live={reconnecting ? "assertive" : "polite"}
    >
      <span>
        {reconnecting
          ? "Connection lost. Reconnecting—your unsent message stays here."
          : message}
      </span>
      {!reconnecting && onDismiss && (
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
