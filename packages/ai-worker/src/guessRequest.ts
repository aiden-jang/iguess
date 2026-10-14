import type { DrawOp } from "@iguess/shared";
import { isDrawOp, MAX_DRAW_OPS } from "@iguess/shared/protocol";
const MAX_BYTES = 3_000_000;
export function parseGuessRequest(
  value: unknown,
): { ops: DrawOp[]; hint?: string } | null {
  if (!value || typeof value !== "object" || !("ops" in value)) return null;
  const { ops } = value;
  if (!Array.isArray(ops) || ops.length > MAX_DRAW_OPS || !ops.every(isDrawOp))
    return null;
  const raw = "hint" in value ? value.hint : undefined;
  const hint =
    typeof raw === "string" && /^[a-z_ ]{1,24}$/i.test(raw) && raw.includes("_")
      ? raw
      : undefined;
  return { ops, hint };
}
/** Read incrementally so a missing or forged Content-Length cannot bypass the body cap. */
export async function readGuessRequest(request: Request) {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const joined = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.length;
    }
    return parseGuessRequest(JSON.parse(new TextDecoder().decode(joined)));
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}
