# Chat composition

Enter confirms an in-progress IME composition without sending it as a chat message.
The composition flag, native composing event and Safari's confirming key are
covered. A subsequent Enter sends once, clears the draft and retains input focus.

The browser journey checks these transitions in Chromium and WebKit with Korean
and Japanese text and emoji. Existing room-scoped drafts and keyboard-height chat
layout remain in use; the room-fit journeys cover the playing layout separately.

- [Desktop](composition-1440.png)
- [Phone](composition-390.png)

Composition events and viewport sizes are emulated. This does not establish the
behavior of every physical keyboard or installed input method.
