# Build and Release

SORI App is prepared for native desktop builds through GitHub Actions. Local development can happen on macOS without building `.exe`, `.msi`, `.dmg`, or `.app` artifacts.

## Local Development

Install JavaScript dependencies:

```bash
npm install
```

Run the frontend dev server:

```bash
npm run dev
```

Run the Tauri dev shell when the local machine has Rust/Cargo installed:

```bash
npm run tauri:dev
```

Frontend checks do not require Rust:

```bash
npm run build
```

Native Tauri builds do require:

- Rust toolchain (`rustc`, `cargo`, `rustup`)
- platform-specific build dependencies
- Tauri-supported system webview/runtime dependencies

The current macOS development machine can prepare and validate the React/Vite side even if Rust/Cargo is not installed.

## Future GitHub Actions Builds

Production desktop artifacts should be built in CI/CD, not manually on the local development machine.

Current workflow:

- `.github/workflows/windows-build.yml`
  - manual trigger: **Actions -> Windows Desktop Build -> Run workflow**
  - automatic trigger: push to `sori-app-win`
  - runner: `windows-latest`
  - output artifact: `sori-app-windows-installer`
  - artifact contents: NSIS `.exe` installer from `src-tauri/target/release/bundle/nsis`
  - artifact retention: 14 days
- `.github/workflows/macos-build.yml`
  - manual trigger: **Actions -> macOS Desktop Build -> Run workflow**
  - automatic trigger: push to `sori-app-win`
  - runner: `macos-latest`
  - output artifact: `sori-app-macos-dmg`
  - artifact contents: universal macOS `.dmg` from `src-tauri/target/universal-apple-darwin/release/bundle/dmg`
  - artifact retention: 14 days
  - signing/notarization: disabled for the first test build

Planned future matrix:

- `windows-latest`
  - target artifacts: `.exe`, later optionally `.msi`
  - command: `npm run tauri:build -- --bundles nsis --ci`
- `macos-latest`
  - target artifacts: `.dmg`, `.app`
  - command: `npm run tauri:build -- --target universal-apple-darwin --bundles dmg --ci --no-sign`

The first macOS test build is unsigned. macOS Gatekeeper may warn on first launch. For public distribution, add Apple Developer signing and notarization later.

The project already keeps Tauri bundle targets platform-neutral through `"targets": "all"`, so each runner can emit the artifacts supported by its operating system.

## Application Updates

SORI App checks for new desktop versions published through GitHub Releases. When a newer version is available, the app shows an in-app notification with two choices:

- update now
- remind later

If the user chooses to update, the app downloads the new version, installs it over the current one, and restarts. User data and the selected SORI server remain in place.

Updates are versioned as product releases, for example `0.1.1`, `0.1.2`, and later patch versions. Internet access is only required while checking for and downloading the update.

During the early development phase, Windows or macOS may show a security warning because the app is not signed with a paid operating-system certificate yet. This is expected for the current test builds.

## Window and Platform Policy

The Tauri window is configured with native decorations enabled by default. At runtime:

- Windows/Linux switch to frameless mode and show SORI custom window controls.
- macOS keeps native traffic-light controls and hides custom minimize/maximize/close buttons.

This avoids Windows-only assumptions while preserving the SORI desktop UX.

## Icons

Production icons are stored under `src-tauri/icons` and wired into `src-tauri/tauri.conf.json`.

Current icon set:

- shared Tauri icon: `src-tauri/icons/icon.png`
- Windows: `src-tauri/icons/icon.ico`
- macOS: `src-tauri/icons/icon.icns`

## Release Checklist

- Confirm `package.json` version.
- Confirm `src-tauri/tauri.conf.json` version.
- Confirm release icons render correctly on Windows and macOS.
- Run frontend build: `npm run build`.
- Run Tauri build in GitHub Actions on Windows and macOS runners.
- Upload generated installer artifacts from each runner.
- Smoke test Windows installer with [TESTING.md](./TESTING.md).
