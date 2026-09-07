import { useEffect, useRef, useState } from "react";

const SHOW_MS = 2600;

/** One transient line at the top of the screen. A new one replaces whatever is showing. */
export function useToast() {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = (): void => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => clear, []);

  const showToast = (text: string, ms: number = SHOW_MS): void => {
    setToast(text);
    clear();
    timer.current = setTimeout(() => setToast(null), ms);
  };

  const hideToast = (): void => {
    clear();
    setToast(null);
  };

  return { toast, showToast, hideToast };
}
