export function modifierKey(): "⌘" | "Ctrl" {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? "⌘" : "Ctrl";
}
