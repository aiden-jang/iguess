import { useEffect, useState } from "react";
import { readStored, writeStored } from "./storage";

const session = new Map<string, boolean>();
const EVENT = "iguess:preferences";
export const MOTION_KEY = "iguess_motion";
export const HAPTICS_KEY = "iguess_haptics";
export function preference(key: string, fallback: boolean): boolean {
  const value = readStored(key);
  return value === null ? (session.get(key) ?? fallback) : value === "1";
}
export function usePreference(key: string, fallback: boolean) {
  const [value, setValue] = useState(() => preference(key, fallback));
  useEffect(() => {
    const sync = () => setValue(preference(key, fallback));
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [key, fallback]);
  const update = (next: boolean) => {
    session.set(key, next);
    writeStored(key, next ? "1" : "0");
    setValue(next);
    window.dispatchEvent(new Event(EVENT));
  };
  return [value, update] as const;
}
