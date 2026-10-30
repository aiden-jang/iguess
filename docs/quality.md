# Quality checks

Use the runtime and pnpm version from [README](../README.md). Install browser engines once:

```sh
pnpm exec playwright install chromium webkit
```

Then run the repository gate followed by the browser suite:

```sh
pnpm run verify
pnpm run test:e2e --workers=1
```

The repository gate audits runtime and development dependencies, checks types and lint,
enforces source/comment budgets and test floors, runs package suites, and builds the client.
No source ceiling or test floor may be raised or lowered to hide a regression.

## Browser stack

The browser suite refuses to reuse running servers. Keep its ports free:

| Service        | Origin                   | Purpose                                                          |
| -------------- | ------------------------ | ---------------------------------------------------------------- |
| Game Worker    | `http://127.0.0.1:33300` | Production client assets, room sockets and real Durable Objects  |
| Mock AI Worker | `http://127.0.0.1:33400` | Binding-free mock vision and renderer probes                     |
| Vite           | `http://127.0.0.1:33100` | Source imports for the isolated export and pixel-renderer probes |

The Workers use separate local databases and inspector ports. The game server has an empty
AI destination and preserves its real loopback origin with Wrangler's route inference disabled.
The mock AI config has no paid binding or adjacent provider credentials;
AI request tests check its health before sending drawings. Never substitute a production vision URL.

Chromium and WebKit exercise the shipped client, including drawing, guessing, secret-word
masking, permissions, reconnects, invalid drafts, results, replay, downloads, accessibility,
keyboard focus, enlarged text and narrow layouts. The installed-app check uses the real
service worker and public offline shell. Native share sheets are mocked; the share-image
journey checks actual browser user activation with a prepared file.

WebKit upgrades HTTP loopback assets when the CSP contains an HTTPS-upgrade directive.
The Worker omits that directive only for exact HTTP loopback origins. Secure and public
origins retain it, along with the rest of the policy. Unit tests check both boundaries.
This permits local production-build testing without accepting a certificate warning.

Failure artifacts include browser screenshots/traces and local Worker logs under
`.wrangler/e2e-logs/`. CI retains them briefly. Delivery downloads the same verified client
artifact rather than building a different client after tests.

## Visual review and limits

Inspect actual screenshots as well as assertions. Review phone, tablet and desktop widths,
both palettes, long content, focus, reduced motion and interrupted tasks. Use disposable
room names and drawings, and summarize relevant findings in the change description.

For fresh captures without replacing curated or install images, set `CAPTURE_UI_OUTPUT`
to a temporary folder and run the relevant `polish` and `game` journeys with Chromium.
Keep the output local. Leave `CAPTURE_UI` unset; that older refresh mode also updates
installation screenshots. Generated review captures use ignored test output.

Browser automation does not establish physical phone keyboards, native share-sheet delivery,
haptic hardware, constrained-device performance, manual screen-reader usability or paid-model
recognition. Automated WebKit is useful coverage, and still requires real Safari/device review.
An observed visitor session is separate; use the [walkthrough](visitor-review.md).

## Review artifacts

Keep generated screenshot sets, videos, traces and run reports in ignored
`test-results/` output or a temporary local directory. CI artifacts should expire.
Commit authored design references and a small curated set of README images only;
keep runtime and installation assets separate. Earlier audit records remain in Git
history. Use synthetic data and remove private information from shared evidence.
