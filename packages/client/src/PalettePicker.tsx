import { COLORS, COLOR_NAMES } from "./brushStyle";
import { useDismissibleDetails } from "./useDismissibleDetails";
import { Icon } from "./Icon";
export function PalettePicker({
  color,
  onChange,
}: {
  color: string;
  onChange: (color: string) => void;
}) {
  const disclosure = useDismissibleDetails();
  const name = COLOR_NAMES[color as keyof typeof COLOR_NAMES] ?? "Custom";
  return (
    <details className="ink-control" {...disclosure}>
      <summary aria-label={`Ink color: ${name}`}>
        <span
          className="ink-preview"
          style={{ background: color }}
          aria-hidden
        />
        <span>Ink</span>
        <Icon name="chevron" />
      </summary>
      <div className="palette-popover" role="group" aria-label="Ink colors">
        {COLORS.map((ink) => (
          <button
            key={ink}
            type="button"
            className="ink-choice"
            aria-label={`Color ${COLOR_NAMES[ink]}`}
            aria-pressed={color === ink}
            onClick={() => {
              onChange(ink);
              if (disclosure.ref.current) {
                disclosure.ref.current.open = false;
                disclosure.ref.current.querySelector("summary")?.focus();
              }
            }}
          >
            <span style={{ background: ink }} aria-hidden>
              {color === ink ? "✓" : ""}
            </span>
            <small>{COLOR_NAMES[ink]}</small>
          </button>
        ))}
      </div>
    </details>
  );
}
