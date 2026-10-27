# October recovery and repository review

Reviewed from base revision `dedda12` with the changes committed alongside this record.
Rooms, players and drawings used disposable local state. Game testing used an empty vision
destination and the separate binding-free mock Worker; no production game or paid vision request
was used.

## Behavior and ownership

Regressions first reproduced socket construction/submission failures, sending after transport
disposal, invitation cache poisoning, failed HTML replacing the shell, cross-origin interception,
unrelated cache deletion and cache writes without a fetch-event lifetime. Browser regressions
also reproduced duplicate invite sheets, missing selectable recovery and lost keyboard focus.
File-delivery regressions cover a refused capability check and native failure after cleanup.

Transport failures now preserve composer ownership and enter recovery. Invitation sharing
coalesces pending requests and leaves a selectable link when both sharing and copying fail.
Temporary clipboard fields are removed and keyboard focus returns to the control.

Gallery preparation belongs to `useEvidenceSharing`, with explicit lifetime and gallery identity.
Save the evidence downloads the image; Share image appears for supported prepared files.
The share click retains browser user activation. Cancellation leaves the gallery intact and
does not download again. Leaving the room or replacing the gallery invalidates old work.

## Interface evidence

The review retains the studio's composition and authored illustrations. Coverage includes
entry, invitations, both player roles, word selection, drawing tools, guesses, settings, dialogs,
feedback, reconnects, results and replay. The invitation recovery matrix exercises widths
320, 390, 430, 768 and 1440 in both palettes with accessibility and overflow checks.

Selected captures:

- [Desktop entry](join-desktop-light-chromium.jpg)
- [Dark drawing workspace](drawing-desktop-dark-chromium.jpg)
- [Phone results](results-mobile-webkit.jpg)
- [Narrow invitation recovery](invite-dark-320-webkit.png)

Fresh captures use a temporary output folder. Earlier review records and installation images
remain separate. Large-gallery clones and labeled export probes remain QA scenarios rather
than inserted game history.

## Repository and GitHub

Compatible dependency patches address the advisories found by the baseline audit. Source
ceilings were preserved or reduced; test floors increased with the regression cases. Docs
now describe actual sharing ownership, supported runtimes, direct-main commits and verification.

Browser journeys serve the production build through the real game Worker. Only pure export
and pixel probes import Vite source modules. The Worker keeps its real loopback origin during
tests; local HTTP omits the HTTPS-upgrade directive so WebKit can load assets. Secure/public
origins retain their policy, with explicit regression coverage.

CI keeps its verification and dependent delivery jobs, reuses the tested artifact and retains
browser/Worker diagnostics on failure. CI actions are pinned to verified current release commits;
routine action updates are grouped. Existing main safeguards retain linear history and block
force pushes/deletion while allowing direct commits.

## Limits

Automated Chromium and WebKit do not establish physical phone keyboard behavior, actual Safari
device behavior, native share-sheet delivery, haptic hardware, constrained-device performance,
manual screen-reader usability or paid-provider recognition. Share sheets are mocked, while
downloads, user activation, room sockets and installed-shell behavior use the actual browser.
This was an engineering and visual review, not an observed visitor study. See the
[walkthrough](../../visitor-review.md) and [quality checks](../../quality.md).
