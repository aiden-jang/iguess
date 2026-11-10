import { useEffect, useId, useRef, useState } from "react";
import { teamWinTarget, type RoomSettings } from "@iguess/shared";
import { PACK_NAMES } from "@iguess/shared/words";
import { customWordDraft } from "./customWords";
import { styles } from "./styles";
import { useDismissibleDetails } from "./useDismissibleDetails";
import { gameLengthLabel } from "./labels";
import { usesVision } from "./gameModes";

interface HostSettingsProps {
  settings: RoomSettings;
  /** Only the host's changes reach the server, so everyone else sees these disabled. */
  youAreHost: boolean;
  connected?: boolean;
  mode: string;
  onChange: (patch: Partial<RoomSettings> & { togglePack?: string }) => void;
}

export function HostSettings({
  settings,
  youAreHost,
  connected = true,
  mode,
  onChange,
}: HostSettingsProps) {
  const teamBattle = mode === "team-battle";
  const disclosure = useDismissibleDetails();
  const wordsHint = useId();
  const customWords = settings.customWords.join(", ");
  const [draftWords, setDraftWords] = useState(customWords);
  const currentDraft = useRef(customWords);
  const dirty = useRef(false);
  const preview = customWordDraft(draftWords);
  const saveWords = () => {
    if (preview.error || !youAreHost || !connected) return;
    if (preview.words.join(", ") === customWords) {
      dirty.current = false;
      currentDraft.current = customWords;
      setDraftWords(customWords);
    }
    onChange({ customWords: preview.words });
  };
  useEffect(() => {
    const latest = customWordDraft(currentDraft.current);
    const acknowledged =
      !latest.error && latest.words.join(", ") === customWords;
    // A delayed acknowledgement must not replace edits made after saving.
    if (dirty.current && youAreHost && !acknowledged) return;
    dirty.current = false;
    currentDraft.current = customWords;
    setDraftWords(customWords);
  }, [customWords, youAreHost]);
  return (
    <details className="host-settings" {...disclosure}>
      <summary>
        <span>Game settings</span>
        <small className="settings-compact">
          {settings.turnSeconds}s · {gameLengthLabel(settings, teamBattle)}
        </small>
        <span aria-hidden>⌄</span>
      </summary>
      <p className="settings-summary">
        {settings.turnSeconds}s turns · {gameLengthLabel(settings, teamBattle)}{" "}
        · {youAreHost ? "You’re hosting" : "Host chooses the rules"}
      </p>
      <div className="settings-fields">
        <p className="settings-guidance">
          {youAreHost
            ? "You’re hosting. These rules apply to everyone in the room."
            : "The host chooses these rules. You can review them here."}
        </p>
        {mode !== "ai-drawer" && (
          <>
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
                disabled={!youAreHost || !connected}
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
                    disabled={!youAreHost || !connected}
                    onClick={() => onChange({ togglePack: p })}
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
                disabled={!youAreHost || !connected}
                placeholder="your own words, comma separated"
                value={draftWords}
                onChange={(event) => {
                  dirty.current = true;
                  currentDraft.current = event.target.value;
                  setDraftWords(event.target.value);
                }}
                aria-describedby={wordsHint}
                aria-invalid={!!preview.error}
                onBlur={saveWords}
                onKeyDown={(event) => {
                  if (
                    event.key !== "Enter" ||
                    event.nativeEvent.isComposing ||
                    event.keyCode === 229
                  )
                    return;
                  event.preventDefault();
                  saveWords();
                }}
              />
            </label>
            <p
              className="custom-word-feedback"
              id={wordsHint}
              role={preview.error ? "alert" : undefined}
            >
              {preview.error
                ? `Not applied. ${preview.error} The room still uses its saved words.`
                : youAreHost
                  ? `${preview.words.length} custom words. Up to 40 unique words; save with Enter or leave the field.`
                  : `${preview.words.length} custom words. The host chooses these words.`}
            </p>
          </>
        )}
        <label style={styles.settingLabel}>
          Turn time
          <select
            style={styles.settingSelect}
            disabled={!youAreHost || !connected}
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
        {usesVision(mode) && (
          <label style={styles.settingLabel}>
            AI skill
            <select
              style={styles.settingSelect}
              disabled={!youAreHost || !connected}
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
            disabled={!youAreHost || !connected}
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
            {(teamBattle ? [300, 500, 800] : [300, 500, 1000]).map((n) => (
              <option key={`t${n}`} value={`t${n}`}>
                first to {teamBattle ? `${teamWinTarget(n)} team wins` : n}
              </option>
            ))}
          </select>
        </label>
      </div>
    </details>
  );
}
