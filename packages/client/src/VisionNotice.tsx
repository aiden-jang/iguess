import { usePlayStatus } from "./usePlayStatus";

export function VisionNotice({
  mode,
  onMode,
}: {
  mode: string;
  onMode?: (mode: string) => void;
}) {
  const { vision, retry } = usePlayStatus();
  if (["classic", "ai-drawer"].includes(mode) || vision === "ready")
    return null;
  return (
    <aside className="vision-notice" aria-label="AI availability">
      <p>
        {vision === "checking"
          ? "Checking live AI guessing…"
          : vision === "unknown"
            ? "Couldn’t check live AI guessing."
            : "Live AI guessing is unavailable. Drawing still works."}
      </p>
      {vision !== "checking" && (
        <div>
          {onMode ? (
            <button type="button" onClick={() => onMode("ai-drawer")}>
              Play AI Drawer instead ↗
            </button>
          ) : (
            <a href="/#mode=ai-drawer">Start a new AI Drawer room ↗</a>
          )}
          <button type="button" onClick={retry}>
            Check again
          </button>
        </div>
      )}
    </aside>
  );
}
