import { useEffect } from "react";
export function useRoomViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;
    const update = () => {
      const editing = document.activeElement?.matches(
        'input:not([type="range"]),textarea',
      );
      const keyboard = !!(
        editing &&
        viewport &&
        viewport.scale <= 1.1 &&
        innerHeight - viewport.height > 140
      );
      root.dataset.keyboard = String(keyboard);
      if (keyboard)
        root.style.setProperty("--room-height", `${viewport!.height}px`);
      else root.style.removeProperty("--room-height");
    };
    viewport?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    update();
    return () => {
      viewport?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      root.style.removeProperty("--room-height");
      delete root.dataset.keyboard;
    };
  }, []);
}
