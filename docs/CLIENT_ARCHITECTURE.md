# SORI App Client Architecture

SORI App is a desktop wrapper over the existing SORI web/backend architecture. It does not introduce a separate backend, token system, or hardcoded service endpoints.

The desktop app is intentionally a user client only. It does not expose the admin panel, and `adminpanel` sessions are rejected and logged out. System administration remains in the SORI web interface.

## Bootstrap Flow

1. The user enters a domain, for example `sorihub.ru`.
2. The app normalizes the input by removing `https://`, `http://`, `www.`, and paths.
3. The app always connects over HTTPS.
4. Discovery tries:
   - `https://<domain>/.well-known/sori/client.json`
   - fallback: `https://<domain>/client/bootstrap`
5. The bootstrap payload becomes the single source of truth for:
   - API URL
   - WebSocket URL
   - LiveKit URL
   - media URL
   - default community id
   - upload limit

No runtime endpoint is hardcoded in the app.

## Server Input UX

The first screen is a server connection screen.

- The user only enters a domain.
- The UI displays the normalized `https://` target.
- Input is checked after a short debounce.
- While checking, the field shows a spinner.
- On success, the app stores the bootstrap payload and automatically moves to login.
- On error, the app shows an inline message and a Sonner toast can be used by flows around it.

The selected server persists locally and survives logout.

## Auth Flow

Authentication follows the SORI backend contract:

- cookie-based auth through `sori_auth`
- `credentials: "include"` on API requests
- no access tokens stored in the desktop app
- `/auth/login`, `/auth/me`, `/auth/logout`, and `/auth/csrf` are taken from bootstrap auth paths
- `adminpanel` users are rejected by the desktop client and immediately logged out server-side

After logout, the server remains selected and the user returns to the login state. The login screen exposes “Change server” to return to bootstrap input.

## Socket Flow

Socket.io connects only after:

- bootstrap is present
- `/auth/me` returns an authenticated user

The socket URL and socket path come from bootstrap:

- `bootstrap.endpoints.ws`
- `bootstrap.realtime.socketPath`
- `bootstrap.realtime.transports`

The app uses cookie auth with `withCredentials: true`, matching the web client direction.

## LiveKit Flow

LiveKit URL is resolved through bootstrap only:

- `bootstrap.endpoints.livekit`

The current MVP exposes the integration helper and keeps LiveKit dependencies installed so voice and call UI can be ported from the web app without changing the server contract.

## Settings Model

SORI App keeps the same user-facing settings direction as the web client:

- Profile
  - username/email editing through `/users/me`
  - avatar upload through the existing SORI upload endpoint, then `/users/me`
- Voice & Video
  - input/output device selection persisted locally
  - mic gain, output volume, and noise suppression synced through `/users/me`
  - hardware test uses browser media APIs inside the Tauri WebView
- Notifications
  - regular popup toggles
  - sound notification toggles
  - group-level switches for regular and sound notification sections
  - notification sound assets are served as public files under `/sounds/notifications`
- Language selector and version line remain in the settings sidebar

The desktop client does not include admin/system settings. Those stay in the web admin panel.

## Notifications Model

The MVP uses the same notification direction as the web app:

- Sonner toast notifications
- no native OS notifications yet
- errors, connection state, and user actions should surface through toast messages
- user settings can disable channel-message and direct-message popup toasts separately
- unread badges are independent from popup notification settings
- sound effects are handled by a small reusable service with preload, one-shot play, loop start, and loop stop helpers
- incoming direct-call sound loops until the call is accepted, rejected, missed, timed out, or ended

This keeps notification behavior close to the web UX and avoids platform-specific notification permission work in the first Windows build.

## Version Sync

Client version comes from `package.json`.

Server version is fetched from:

- `<bootstrap.endpoints.api>/api/system/version`

Settings displays:

`SORI App <clientVersion> • Server <serverVersion> • build <serverBuildId>`

If the server version endpoint is unavailable, the UI falls back to showing only the client version.

## Current MVP Scope

Implemented foundation:

- Tauri v2 shell
- React + Vite frontend
- Zustand stores
- Tailwind-based SORI visual style
- custom title bar
- bootstrap discovery
- cookie-auth API helper
- Socket.io lifecycle
- real community channel list loaded from SORI API
- real DM conversation list loaded from SORI API
- channel and DM message history
- sending channel and DM messages through SORI REST endpoints
- uploading message attachments through SORI REST endpoints
- live incoming channel/DM messages through Socket.io events
- basic voice-channel join/leave through `/calls/token`
- LiveKit audio session loaded lazily only when a voice channel is connected
- voice occupants, speaking state, mute/deafen state through Socket.io events
- direct call lifecycle over Socket.io
- incoming direct call popup with accept/reject
- outgoing direct call action from DM conversations
- direct call LiveKit token retrieval through `/calls/token`
- settings panel with language, notification toggles, and version line
- settings page with profile, voice/video, and notifications tabs
- Sonner notifications with basic popup preferences

The next step is porting richer voice UI, sound playback assets, call telemetry, and per-user voice volume controls from the web frontend into this shell.

## Build and Release

Native Windows/macOS builds are intended to run through GitHub Actions. See [BUILD_AND_RELEASE.md](./BUILD_AND_RELEASE.md).
