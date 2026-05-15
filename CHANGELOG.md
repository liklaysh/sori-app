# Changelog

## 0.1.5

- Fixed a desktop media settings sync loop that repeatedly reloaded chat data and could make the app flicker.
- Fixed desktop voice channel manual leave behavior so stale occupant snapshots no longer reconnect the user after pressing disconnect.
- Updated desktop release metadata for the 0.1.5 hotfix build.

## 0.1.4

- Added synced desktop noise suppression mode selection with WebRTC Basic, RNNoise, and an Experimental AI provider layer with safe fallback behavior.
- Restored voice channel state after app reload so the desktop connected voice module returns to the active session.
- Reworked message reactions so reaction pills attach to the message bubble instead of rendering as detached rows.
- Redesigned audio attachment bubbles with compact file metadata, inline playback controls, progress seeking, and volume handling.
- Updated desktop release metadata for the 0.1.4 app build.

## 0.1.3

- Improved voice channel leave and mute/deafen UI synchronization in the desktop client.
- Added the chat "scroll to latest message" control to match the web client behavior.
- Rebuilt the production app icon set from the final 1024px source icon for Windows, macOS, and Tauri.
- Refined desktop chat behavior, including initial scroll position, screen share cancellation handling, drag-and-drop support, and call timer formatting.

## 0.1.2

- Improved desktop voice reliability, media device publishing, and reconnect behavior.
- Added desktop telemetry and reconnect notices aligned with the SORI server diagnostics.
- Improved chat file UX with drag-and-drop handling, max file size hints, paste support, audio attachments, and post-send input focus.
- Synchronized message context menu and quick reaction behavior with the web client.
- Updated the app icon set to a transparent SORI logo without the dark background/card shape.
- Refined the combined user/voice connected control so it renders as one coherent component.
- Continued foundation work for app updates through GitHub Releases and Tauri Updater.

## 0.1.1

- Added Windows tray mode and release build fixes.
- Improved desktop chat, voice, settings, notifications, and update readiness.
- Fixed session persistence, voice state synchronization, and release console behavior.
