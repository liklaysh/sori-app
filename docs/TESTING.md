# SORI App Testing

Use this checklist for the first Windows build smoke test.

## Install

1. Download the latest artifact from GitHub Actions.
2. Windows: use `sori-app-windows-installer` and run the `.exe` installer.
3. macOS: use `sori-app-macos-dmg`, open the `.dmg`, and start `SORI App`.
4. Start `SORI App`.

The first macOS test build is unsigned, so macOS can show a Gatekeeper warning. Signing and notarization are planned for release builds.

## Server Bootstrap

1. Enter the server domain, for example `sorihub.ru`.
2. Confirm the app resolves the server through bootstrap discovery.
3. Confirm invalid domains show a clear error.
4. Use **Change server** from login and confirm the app returns to the server screen.

## Auth

1. Login as a regular SORI user.
2. Confirm `adminpanel` credentials are rejected in the desktop app.
3. Logout and confirm the selected server remains saved.

## Chat

1. Open a text channel.
2. Send and receive a channel message.
3. Open a direct message.
4. Send and receive a DM.
5. Confirm unread badges still work when popup notifications are disabled.
6. Upload an attachment and confirm it sends.

## Voice And Calls

1. Join a voice channel.
2. Confirm join sound plays once.
3. Switch between text channels and DMs while staying connected to voice.
4. Leave the voice channel manually and confirm leave sound plays once.
5. Start a direct call.
6. Receive an incoming direct call.
7. Confirm direct-call sound loops until accept, reject, timeout, missed, or end.

## Settings

1. Open Settings.
2. Check Profile, Voice & Video, and Notifications tabs.
3. Change language and restart the app.
4. Change notification toggles and restart the app.
5. Check output volume affects call audio.
6. Run hardware test and confirm camera/mic permission behavior.
