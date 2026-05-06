# SORI App

Desktop client for SORI, built with Tauri v2, React, Vite, Zustand, Tailwind, Socket.io, LiveKit, and Sonner.

SORI App is a user desktop client. The SORI admin panel remains available only through the server web interface with admin credentials.

<p>
  <a href="./README.md">Русский</a> | English
</p>

The client connects to an existing SORI server through bootstrap discovery:

```text
https://<domain>/.well-known/sori/client.json
```

Fallback:

```text
https://<domain>/client/bootstrap
```

## Development

```bash
npm install
npm run dev
```

Tauri development shell:

```bash
npm run tauri:dev
```

Production web build:

```bash
npm run build
```

Native desktop builds are prepared for future GitHub Actions runners. They are not required for local frontend work:

```bash
npm run tauri:build
```

Architecture notes: [docs/CLIENT_ARCHITECTURE.md](docs/CLIENT_ARCHITECTURE.md).

Build/release notes: [docs/BUILD_AND_RELEASE.md](docs/BUILD_AND_RELEASE.md).

Desktop test builds:

1. Push branch `sori-app-win`.
2. Open GitHub Actions.
3. Run **Windows Desktop Build** / **macOS Desktop Build** or wait for the push-triggered runs.
4. Download artifact `sori-app-windows-installer` or `sori-app-macos-dmg`.

First-run smoke test checklist: [docs/TESTING.md](docs/TESTING.md).

## Updates

SORI App checks for new versions through GitHub Releases. When an update is available, the app shows an in-app notification and lets the user install it now or later.

Updates install over the current version and keep user data intact. During the early test phase, macOS or Windows may show a warning because builds are not yet signed with paid OS certificates.
