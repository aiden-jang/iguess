import { useEffect, useId, useState } from "react";
import type { RoomSettings } from "@iguess/shared";
import { PACK_NAMES } from "@iguess/shared/words";
import { customWordDraft } from "./customWords";
import { styles } from "./styles";
import { useDismissibleDetails } from "./useDismissibleDetails";

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
  const disclosure = useDismissibleDetails();
  const wordsHint = useId();
  const customWords = settings.customWords.join(", ");
  const [draftWords, setDraftWords] = useState(customWords);
  const preview = customWordDraft(draftWords);
  const saveWords = () => {
    if (!preview.error && youAreHost) onChange({ customWords: preview.words });
  };
  useEffect(() => setDraftWords(customWords), [customWords]);
  return (
    <details className="host-settings" {...disclosure}>
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
      <div className="settings-fields">
        <p className="settings-guidance">
          {youAreHost
            ? "You’re hosting. These rules apply to everyone in the room."
            : "The host chooses these rules. You can review them here."}
        </p>
        <div
          className="word-packs"
          role="group"
          aria-label="Word packs"
          style={styles.packRow}
        >
          <span className="pack-heading">
            Word packs ·{" "}
            {settings.packs.length
              ? `${settings.packs.length} selected`
              : "all words"}
          </span>
          <button
            type="button"
            style={styles.packChip}
            className="all-words"
            aria-pressed={settings.packs.length === 0}
            disabled={!youAreHost}
            onClick={() => onChange({ packs: [] })}
          >
            All words
          </button>
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
            aria-describedby={wordsHint}
            aria-invalid={!!preview.error}
            onBlur={saveWords}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        </label>
        <p
          className="custom-word-feedback"
          id={wordsHint}
          role={preview.error ? "alert" : undefined}
        >
          {preview.error ||
            `${preview.words.length} custom words. Up to 40 unique words; save with Enter or leave the field.`}
        </p>
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
