import { AVATARS } from "@iguess/shared";
const names = [
  "Unbothered",
  "Mildly interested",
  "Quietly judging",
  "Holding it together",
  "Soft launch",
  "Just observing",
  "Very official",
  "Many opinions",
  "New here",
  "Off duty",
  "Still awake",
  "Incognito",
  "Lunch break",
  "Thirsty",
  "Sudden thought",
  "Seen enough",
];
const inks = ["#d8ed79", "#e6ad96", "#c3d6c6", "#d8cfe2", "#e8d6a7"];
export const avatarName = (value: string) =>
  names[Math.max(0, (AVATARS as readonly string[]).indexOf(value))]!;
export function AvatarFace({ value }: { value: string }) {
  const index = Math.max(0, (AVATARS as readonly string[]).indexOf(value));
  const mouths = ["M24 44h16", "M25 45q7 5 14 0", "m26 46 13-3", "M27 44h10"];
  return (
    <span className="avatar-portrait" data-avatar={value}>
      <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <path
          d={
            index % 2
              ? "M12 12Q32 2 51 14l3 35Q31 62 9 48Z"
              : "M9 18Q15 6 34 8q23 0 23 24 0 24-25 24Q7 57 9 18Z"
          }
          fill={inks[index % inks.length]}
        />
        <g stroke="#202522" strokeLinecap="round" strokeWidth="2.5">
          <path
            className="avatar-eyes"
            d={
              index % 4 === 2
                ? "m21 29 7-1m10 1 7-1"
                : index % 4 === 3
                  ? "M22 29h5m13 0h5"
                  : "m24 28 0 4m16-4v4"
            }
          />
          <path d={mouths[index % mouths.length]} />
          {index >= 8 && (
            <path d={index % 2 ? "M17 17q14-7 30 1" : "m18 19 8-3m12-1 8 3"} />
          )}
          {index === 9 && <path d="M7 18h50M19 17l4-11h19l5 11" />}
          {index === 14 && <path d="m32 8 3 7-8 3 5 6" />}
        </g>
      </svg>
    </span>
  );
}
