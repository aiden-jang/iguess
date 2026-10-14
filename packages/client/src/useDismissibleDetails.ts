import { useEffect, useRef, type KeyboardEvent } from "react";

export function useDismissibleDetails() {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const details = ref.current;
      if (details?.open && !details.contains(event.target as Node)) {
        const active = document.activeElement;
        if (active instanceof HTMLElement && details.contains(active))
          active.blur();
        details.open = false;
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  return {
    ref,
    onKeyDown: (event: KeyboardEvent<HTMLDetailsElement>) => {
      if (event.key === "Escape") {
        event.currentTarget.querySelector("summary")?.focus();
        event.currentTarget.open = false;
      }
    },
  };
}
