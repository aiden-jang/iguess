import { AVATARS } from "@iguess/shared";
import { AvatarFace, avatarName } from "./AvatarFace";
export function AvatarPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <details className="avatar-options">
      <summary>
        <AvatarFace value={value} />
        <span>Change face</span>
        <span aria-hidden>+</span>
      </summary>
      <div className="avatar-grid">
        {AVATARS.map((avatar) => (
          <button
            key={avatar}
            type="button"
            data-avatar={avatar}
            aria-label={`Avatar: ${avatarName(avatar)}`}
            title={avatarName(avatar)}
            aria-pressed={avatar === value}
            onClick={() => onChange(avatar)}
          >
            <AvatarFace value={avatar} />
            <span>{avatarName(avatar)}</span>
          </button>
        ))}
      </div>
    </details>
  );
}
