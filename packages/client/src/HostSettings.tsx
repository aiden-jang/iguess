import { useEffect, useState } from "react";
import type { RoomSettings } from "@iguess/shared";
import { PACK_NAMES } from "@iguess/shared/words";
import { styles } from "./styles";

interface HostSettingsProps {
  settings: RoomSettings;
  /** Only the host's changes reach the server, so everyone else sees these disabled. */
  youAreHost: boolean;
  isAIMode: boolean;
  onChange: (patch: Partial<RoomSettings>) => void;
}

export function HostSettings({
  settings,
  youAreHost,
  isAIMode,
  onChange,
}: HostSettingsProps) {
  const customWords = settings.customWords.join(", ");
  const [draftWords, setDraftWords] = useState(customWords);
  useEffect(() => setDraftWords(customWords), [customWords]);
  return (
    <details className="host-settings">
      <summary>
        <span>Game settings</span>
        <small className="settings-compact">
          {settings.turnSeconds}s ·{" "}
          {settings.scoreTarget > 0
            ? `First to ${settings.scoreTarget}`
            : `${settings.rounds} ${settings.rounds === 1 ? "round" : "rounds"}`}
        </small>
        <span aria-hidden>⌄</span>
      </summary>
      <p className="settings-summary">
        {settings.turnSeconds}s turns ·{" "}
        {settings.scoreTarget > 0
          ? `First to ${settings.scoreTarget}`
          : `${settings.rounds} ${settings.rounds === 1 ? "round" : "rounds"}`}{" "}
        · {youAreHost ? "You’re hosting" : "Host chooses the rules"}
      </p>
      <div className="settings-fields" style={styles.settingsRow}>
        <p className="settings-guidance">
          Changes apply to this room. No packs selected means all words. Custom
          words save when you leave the field.
        </p>
        <div
          className="word-packs"
          role="group"
          aria-label="Word packs"
          style={styles.packRow}
        >
          {PACK_NAMES.map((p) => {
            const on = settings.packs.includes(p);
            return (
              <button
                key={p}
                className="lift"
                style={{
                  ...styles.packChip,
                  ...(on ? styles.packChipOn : null),
                }}
                aria-pressed={on}
                disabled={!youAreHost}
                onClick={() =>
                  onChange({
                    packs: on
                      ? settings.packs.filter((x) => x !== p)
                      : [...settings.packs, p],
                  })
                }
              >
                {p}
              </button>
            );
          })}
        </div>
        <label style={styles.settingLabel}>
          Custom words
          <input
            style={{ ...styles.settingSelect, width: 150 }}
            disabled={!youAreHost}
            placeholder="your own words, comma separated"
            value={draftWords}
            onChange={(event) => setDraftWords(event.target.value)}
            onBlur={(e) => onChange({ customWords: e.target.value.split(",") })}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        </label>
        <label style={styles.settingLabel}>
          Turn time
          <select
            style={styles.settingSelect}
            disabled={!youAreHost}
            value={settings.turnSeconds}
            onChange={(e) => onChange({ turnSeconds: Number(e.target.value) })}
          >
            {[30, 45, 60, 90, 120].map((n) => (
              <option key={n} value={n}>
                {n}s
              </option>
            ))}
          </select>
        </label>
        {isAIMode && (
          <label style={styles.settingLabel}>
            AI skill
            <select
              style={styles.settingSelect}
              disabled={!youAreHost}
              value={settings.aiSkill}
              onChange={(e) =>
                onChange({ aiSkill: e.target.value as typeof settings.aiSkill })
              }
            >
              <option value="easy">blindfolded</option>
              <option value="normal">normal</option>
              <option value="brutal">scary good</option>
            </select>
          </label>
        )}
        <label style={styles.settingLabel}>
          Game length
          <select
            style={styles.settingSelect}
            disabled={!youAreHost}
            value={
              settings.scoreTarget > 0
                ? `t${settings.scoreTarget}`
                : `r${settings.rounds}`
            }
            onChange={(e) => {
              const v = e.target.value;
              onChange(
                v.startsWith("t")
                  ? { scoreTarget: Number(v.slice(1)) }
                  : { scoreTarget: 0, rounds: Number(v.slice(1)) },
              );
            }}
          >
            {[1, 2, 3, 4, 5, 6, 8].map((n) => (
              <option key={`r${n}`} value={`r${n}`}>
                {n} {n === 1 ? "round" : "rounds"}
              </option>
            ))}
            {[300, 500, 1000].map((n) => (
              <option key={`t${n}`} value={`t${n}`}>
                first to {n}
              </option>
            ))}
          </select>
        </label>
      </div>
    </details>
  );
}
