# OpenCode Remote

A React Native (Expo) remote control for an [OpenCode](https://opencode.ai) server running on your computer. Pair your phone with the server over the internet, then browse sessions, chat with the agent, watch tool calls stream in, and approve permission requests from your pocket.

Built with Expo SDK 58, React Native 0.88, Expo Router, and TypeScript.

## What it does

- **Pair over the internet** using OpenCode's OpenTunnel (`opencode pair --remote`) and a QR code, or connect manually with a server URL and password.
- **Browse sessions** with busy/approval indicators, create new sessions (optionally in a specific project directory), and delete sessions.
- **Chat** with the agent, stream reasoning and tool calls live over SSE, and stop a running turn.
- **Approve permissions** — allow once, always allow, or reject tool requests from the session screen.

## Requirements

- Node.js 20+ and npm.
- [Expo Go](https://expo.dev/go) on your Android device (or a development build).
- OpenCode running on the computer you want to control.
- The phone and computer do not need to be on the same network — pairing uses OpenTunnel.

## Run the app

```bash
npm install
npx expo start
```

Scan the QR code with Expo Go. The app opens the connection screen.

### Testing on a PC

- **Android emulator** (closest to the real thing): start an emulator in Android Studio, then run `npx expo start --android`. Install Expo Go in the emulator when prompted. Camera access uses the emulator's virtual camera, but the easiest path is pasting the pairing link.
- **Browser**: run `npm run web` and open the printed `http://localhost:8081` URL. The UI, pairing-link flow, manual connection, sessions, chat, and permissions all work. Two caveats:
  - QR scanning in the browser needs the Barcode Detection API. Chrome on Android/ChromeOS/macOS has it; other browsers need the optional `barcode-detector` package (`npm install barcode-detector`). Otherwise paste the pairing link.
  - The browser enforces CORS, so API/SSE requests may be rejected by the server depending on its configuration. Use the emulator or a phone to validate the real transport.


Useful commands:

```bash
npx expo start --android   # open on a connected Android device/emulator
npx expo start --web       # browser preview (SecureStore falls back to localStorage)
npm run typecheck          # tsc --noEmit
npm run lint               # expo lint
npx expo-doctor            # dependency / config checks
```

## Pair with your computer

1. On the computer, start a remote pairing session:

   ```bash
   opencode pair --remote
   ```

   The first run asks for confirmation before exposing the server to the internet. Accept it (or pass `--yes` in scripts).

2. OpenCode prints a pairing URL and QR code.

3. In the app, choose **Pairing link**, then either:
   - tap **Scan pairing QR code** and point the camera at the QR code, or
   - paste the link into the text field and tap **Connect with pairing link**.

Pairing links are single-use and expire after 5 minutes. The app stores the resulting session token securely on the device (`expo-secure-store`).

### Deep link

The app registers the `opencode-mobile` scheme, so a pairing link can also be opened directly:

```bash
adb shell am start -a android.intent.action.VIEW \
  -d "opencode-mobile://connect?url=https://…/auth/connect/…"
```

## Connect manually

Useful for a LAN address, a reverse proxy, or any HTTPS tunnel:

1. Find or set the server password:

   ```bash
   opencode service set password "a-long-secret"
   # or
   OPENCODE_PASSWORD="a-long-secret" opencode serve --port 4096
   ```

2. In the app, choose **Password**, enter the server URL (for example `https://your-server.example` or `http://192.168.1.20:4096`) and the password, then tap **Connect**.

The app first tries HTTP Basic auth (`opencode:<password>`), then Bearer auth. Plain `http://` LAN addresses may be blocked by Android's cleartext traffic policy in release builds; use an HTTPS tunnel for remote access.

## How live updates work

The app opens a single server-sent-events connection to `GET /api/event` for the whole session. Because OpenCode events are live-only, the app refetches sessions, messages, and permissions after every reconnect and whenever a turn goes idle. Streaming text, reasoning, and tool results are merged locally so the timeline stays responsive.

## MVP limitations

- No push notifications. If the app is closed, permission requests are only visible the next time you open it.
- One saved connection at a time.
- Session list is capped at 50 sessions; the message timeline loads the latest 200 messages of a session.
- No session forking, archiving, model/agent switching, or file attachments yet.
- Built for Android first; the same code runs on iOS and web, but only Android has been exercised.

## Building with EAS

```bash
npx eas-cli@latest build --profile preview --platform android
```

`eas.json` is not included yet; create profiles with `npx eas-cli@latest build:configure`. Since `android/` and `ios/` are not committed, native projects are generated by Expo's Continuous Native Generation from `app.json`.
