# Repository audit

The audit covers the client, game Worker, AI Worker, shared rules, tests, build configuration,
CI, public assets, comments and maintained documentation. Local development and browser
tests share a binding-free mock configuration; obsolete environment examples have been
replaced with per-Worker local templates. The visual baseline is the
[finishing review](ui-review/finish/README.md); this pass preserves its studio layout.

## Boundaries and changes

| Boundary            | Ownership and checks                                                                                                                                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser transport   | `roomTransport` owns one socket, retry timers and browser listeners. Checked server messages reach `roomMessages`; pointer traffic goes directly to canvas subscribers.                                                                                         |
| Browser state       | The reducer owns room snapshots and a bounded chat log. Reaction expiry, unsent drafts, blocked storage, preference synchronization and wake-lock cleanup have explicit lifetimes.                                                                              |
| Drawing input       | `useCanvasPointer` owns pointer identity, normalized coordinates, buffered batches and its animation frame. The final batch flushes before pointer-up, including under network backpressure.                                                                    |
| Room transport      | `GameRoom` composes the roster, credentials, canvas, action dispatcher and persistence. Runtime decoders reject malformed frames, oversized messages and invalid drawing values.                                                                                |
| Game rules          | The engine owns phases and a cancellable clock; modes own their drawing order, bets, team scores and AI progress. Scoring is closed outside a live turn and for nonparticipants.                                                                                |
| Recovery            | Versioned checkpoints retain game/mode state, remaining deadlines, bounded ink, roster reservations, word history and AI budget. The recovery clock pauses downtime. A partial or expired checkpoint is not replayed.                                           |
| Reconnect ownership | Public player IDs grant no authority. A server-issued room credential proves possession; only its SHA-256 digest is checkpointed. Credentials travel in WebSocket negotiation, not URLs. Reopened connections replace the old socket; kicks revoke credentials. |
| AI I/O              | Bounded, validated drawing requests go through provider deadlines and abortable HTTP adapters. Disposed loops ignore late responses. Shared WASM initialization and explicit renderer disposal serve both vision and invite images.                             |
| Repository gates    | Common strict TypeScript settings reject unused declarations. Lint includes scripts, service workers and configuration. Source size/comment checks cover JavaScript as well as TypeScript, and the test gate checks both process exit status and suite floors.  |

Temporary room recovery uses the existing Durable Object storage binding; it requires no new
secret, service or migration. Writes are coalesced and chunked into an atomic transaction so
one drawing cannot exceed a single storage value. Inactive recovery data expires after a day.
See Cloudflare’s [storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
and [limits](https://developers.cloudflare.com/durable-objects/platform/limits/).

## Repository review

The source inventory includes runtime code, tests, scripts, browser fixtures, Worker and client
configuration, CI, install assets and maintained docs. Generated build output, dependencies,
local Worker databases, test results and secrets stay ignored. Existing review images remain
historical evidence rather than being mixed into production rooms or silently replaced.

Comments explaining ownership, privacy boundaries, browser constraints and algorithms remain.
Narration, stale implementation references, repeated descriptions and unsupported pricing claims
were removed or corrected. Protocol settings are separate from event types; shared decoders
check external data before game rules or UI consumers use it. Module extraction follows those
responsibilities rather than creating generic utilities for unrelated behavior.

README, architecture, deployment and the public privacy copy describe durable recovery and
room credentials. Older clients with only a claimed player ID acquire a fresh identity on
rejoining after this release; legacy IDs cannot be trusted as ownership proof. An invite is
still public access to its room, not an account or private-room authentication system.

## Validation record

The repository gate and complete Chromium/WebKit browser suite passed on the final sources.
The full dependency audit, including development tools, reported no known advisories. CI rejects
moderate-or-higher advisories; patched Wrangler and Vite versions retain Node.js 22 support.
A separate local Worker restart
restored a live room's identity, private drawer word, active turn, score and exact canvas;
the observer still received only a masked word. This used local storage and no vision provider.

- Repository verification covers types, lint, source/comment constraints, complete package
  suites and production builds. Gate mutations check that JavaScript files, unused declarations
  and failing test processes cannot silently pass.
- Regression tests exercise delayed settings acknowledgements without losing a newer draft,
  malformed protocol data, possession/revocation, capacities, host
  transfer, storage chunking/expiry, pending writes, all game-mode snapshots, private word
  recovery, phase restrictions, timer disposal, AI cancellation and provider deadlines.
- Real local Worker/browser tests cover entry, drawing, guessing, refresh, reconnects, results,
  replay, exports, privacy, accessibility, service-worker caching and the audit regressions.
  Automated vision stays mock-only, without a Workers AI binding or production provider URL.
- Desktop and mobile captures for the affected public information and room behavior belong
  in `ui-review/repository/`; the earlier finishing captures remain the comparison baseline.

## Operational limits

A checkpoint is recovery, not a permanent drawing archive or a guarantee that the most recent
pointer event survived a crash. The last completed checkpoint wins; browser-local galleries
and unsent drafts are not server history. Recovery reserves former seats briefly while people
reconnect. Room credentials expire and are scoped to a browser session and room; losing one
means rejoining with a fresh identity. A host kick revokes that credential, not the person’s
ability to visit a public room with a new browser identity.

Vision rendering shares midpoint curves, pressure segments and scanline fill rules with the
browser. It preserves transparent erasing, operation order and undo before adding the white
export background. Canvas and SVG antialiasing and viewport-dependent fill boundaries can differ.
Mock tests establish flow and fallback behavior, not paid-model recognition quality. HTTP
provider requests can be aborted; a Workers AI binding invocation may continue remotely after
the local deadline, although its result is ignored.

Physical phone keyboards, haptic hardware, native share sheets, constrained-device performance,
manual screen-reader use and paid recognition require their own environments. Provider secrets
remain managed by Cloudflare rather than being copied into this repository.

## GitHub configuration

The repository description, live website link and topics match the product. Private vulnerability
reporting, dependency graph, Dependabot alerts, malware alerts and grouped security-fix pull
requests are enabled. CodeQL default setup covers JavaScript/TypeScript and GitHub Actions;
its initial setup scan completed successfully.
The resulting source findings were addressed with an explicit read-only workflow token,
literal callback-based template substitution and a direct string assertion for the malicious-color
test. The interpolation regressions cover replacement metacharacters in model text and commentary.
Secret scanning and secret push protection were already enabled. Branch protection remains
unchanged at the owner's request. The owner is handling the social-preview image upload.

The rendering follow-up shares pressure-aware midpoint paths and scanline fills between the
browser and vision export. Pixel regression tests use the real rasterizer to check transparent
erasing, refilling, operation order, clear and undo. Browser checks exercise the same tools.
