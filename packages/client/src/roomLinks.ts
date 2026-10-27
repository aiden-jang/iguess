import { decodeRoomCode } from "@iguess/shared/roomCode";

// The clipboard API only exists on https and localhost, so there is a fallback path.
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const focused = document.activeElement as HTMLElement | null;
    let el: HTMLTextAreaElement | undefined;
    try {
      el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      el?.remove();
      if (focused?.isConnected) focused.focus({ preventScroll: true });
    }
  }
}

// Put the room in the path, not after a #. A # never gets sent to the server, so link
// previews could only ever show the same generic picture.
export function inviteLink(room: string, mode: string): string {
  const q = new URLSearchParams({ mode });
  return `${window.location.origin}/r/${encodeURIComponent(room)}?${q.toString()}`;
}

export function readInvite(
  location: Pick<Location, "pathname" | "search" | "hash"> = window.location,
): { room?: string; mode?: string; name?: string } {
  // Three ways in: a /r/room link, an older #room=… link, or a link someone shared into the
  // installed app. The old # form still works because those links are already out there.
  const path = location.pathname.match(/^\/r\/([^/]+)\/?$/);
  if (path) {
    const q = new URLSearchParams(location.search);
    return {
      room: decodeRoomCode(path[1]!),
      mode: q.get("mode") ?? undefined,
      name: q.get("name") ?? undefined,
    };
  }
  const shared = new URLSearchParams(location.search);
  const sharedLink = shared.get("url") ?? shared.get("text") ?? "";
  try {
    const link = new URL(sharedLink);
    if (/^\/r\//.test(link.pathname)) return readInvite(link);
  } catch {
    // Shared text can be a message rather than a URL.
  }
  const fromShare = sharedLink.includes("#")
    ? sharedLink.slice(sharedLink.indexOf("#") + 1)
    : (sharedLink.match(/\/r\/([^/?#\s]+)/)?.[1] ?? "");
  const raw =
    location.hash.replace(/^#/, "") ||
    (fromShare.includes("=") ? fromShare : "");
  if (!raw && fromShare) return { room: decodeRoomCode(fromShare) };
  if (!raw) return {};
  const q = new URLSearchParams(raw);
  return {
    room: q.get("room") ?? undefined,
    mode: q.get("mode") ?? undefined,
    name: q.get("name") ?? undefined,
  };
}
