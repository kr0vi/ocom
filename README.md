# ocom - Open Code on Mobile

**Control an [OpenCode](https://opencode.ai) server running on your computer from your Android phone.**

ocom is a mobile client for OpenCode. It connects to a live OpenCode server over HTTPS, lets you browse and start sessions, streams the agent's work in real time, and puts permission approvals in your pocket — so you can keep a session moving without being tied to your desk.

Built with Expo SDK 58, React Native 0.88, Expo Router, and TypeScript.

[**Download the latest Android APK**](../../releases/latest) · [Run from source](#run-from-source) · [How it works](#how-it-works)

> The app is Android-first. The same codebase runs on iOS and web, but only Android has been exercised for distribution.

## Download and install

1. Open the [Releases page](../../releases/latest) and download the latest `open-code-mobile-vX.Y.Z.apk`.
2. On your Android phone, open the downloaded file.
3. If Android asks, allow **Install unknown apps** for your browser or file manager.
4. Launch **OpenCode Remote** and pair it with your computer.

The APK is signed for sideloading, not distributed through the Play Store. Only install builds you trust and verify that you downloaded them from this repository's Releases page.

To install over USB instead:

```bash
adb install path/to/open-code-mobile.apk
```

## What it does

- **Pair over the internet** using OpenCode's OpenTunnel (`opencode pair --remote`) and a QR code, or connect manually with a server URL and password.
- **Browse sessions** with busy and approval indicators, create sessions in a specific project directory, and delete sessions.
- **Chat with the agent** and stream text, reasoning, and tool activity live over server-sent events.
- **Approve permissions** — allow once, always allow, or reject tool requests directly from the session.
- **Stay oriented** with batched streaming updates, a jump-to-latest button, quick-prompt chips, and a reconnect banner.
- **Feel connected** with live connection status, haptic feedback, and automatic resync when the app returns to the foreground.

## How it works

```text
┌─────────────────────┐        HTTPS + SSE        ┌──────────────────────┐
│  OpenCode Remote    │  ◄──────────────────────► │  OpenCode server     │
│  Expo / React Native│   /api/session, /api/event │  on your computer    │
└─────────────────────┘                           └──────────┬───────────┘
                                                             │
                                                             ▼
                                                  ┌──────────────────────┐
                                                  │  Your projects       │
                                                  └──────────────────────┘
```

- The phone connects directly to your OpenCode server. There is no third-party backend in between.
- `GET /api/event` is a single long-lived SSE stream for the whole app. Sessions, messages, and permissions are refetched after reconnects and when a turn goes idle.
- Streaming events update a local timeline in small batches, which keeps the UI smooth while tools and text stream in.
- Pairing uses OpenCode's OpenTunnel: `opencode pair --remote` prints a QR code and a single-use link. The app redeems the link for a token and stores it securely on the device.

## Run from source

### Requirements

- Node.js 20+ and npm.
- [Expo Go](https://expo.dev/go) on your Android device, or an emulator.
- OpenCode running on the computer you want to control.
- The phone and computer do not need to be on the same network when using OpenTunnel.

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

3. In the app, either:
   - tap **Scan pairing QR code** and point the camera at the QR code, or
   - paste the link into the text field and tap **Connect**.

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

2. In the app, enter the server URL (for example `https://your-server.example` or `http://192.168.1.20:4096`) and the password, then tap **Connect**.

The app first tries HTTP Basic auth (`opencode:<password>`), then Bearer auth. Plain `http://` LAN addresses may be blocked by Android's cleartext traffic policy in release builds; use an HTTPS tunnel for remote access.

## Build an APK

EAS Build compiles the app in the cloud, so you do not need Android Studio or Xcode on your computer. The `preview` profile in `eas.json` is configured to produce a directly installable `.apk`.

1. Sign in to Expo (free account):

   ```bash
   npx eas-cli@latest login
   ```

   On the first build, EAS asks to create/link the project and stores its ID in `app.json`.

2. Build the APK:

   ```bash
   npx eas-cli@latest build -p android --profile preview
   ```

   The build runs in the cloud and prints a URL when finished.

3. Download the `.apk` from the build page, or install it on a connected device:

   ```bash
   npx eas-cli@latest build:run -p android --latest
   ```

If you prefer to build locally, you need Android Studio/SDK and a JDK:

```bash
npx eas-cli@latest build -p android --profile preview --local
```

The `production` profile builds an `.aab` for the Play Store instead.

### Publishing an APK on GitHub

Use GitHub Releases for public downloads instead of committing the APK to the repository:

1. Go to **Releases → Draft a new release**.
2. Create a tag such as `v1.0.0`.
3. Attach the built `.apk` as a release asset.
4. Publish the release.

The README's download link points to `../../releases/latest`, so it always opens the newest release. Keep the Android signing keystore safe: if it changes, new APKs will not install over an existing installation.

## Project structure

```text
src/
  app/                    Expo Router routes
    _layout.tsx           Fonts, safe area, connection provider, stack
    connect.tsx           Pairing, QR scanning, manual connection
    sessions.tsx          Session list and new-session flow
    session/[id].tsx      Chat timeline, permissions, composer
  components/             Reusable UI (messages, composer, cards, buttons)
  lib/
    api.ts                Typed OpenCode HTTP client
    connection.tsx        Saved connection + shared event stream
    events.ts             SSE parser and reconnect loop
    timeline.ts           Live event → message timeline merge
    types.ts              API, message, and event types
    theme.ts              Colors, spacing, typography
```

## Tech stack

- Expo SDK 58 and React Native 0.88
- TypeScript and Expo Router
- Server-sent events through `GET /api/event`
- `expo-secure-store` for credentials (localStorage on web)
- `expo-camera` for QR pairing and `expo-haptics` for feedback

## Security and privacy

- Credentials are stored only on the device, in secure storage where available.
- The app talks directly to your OpenCode server; there is no analytics or third-party backend.
- Pairing links are single-use and expire after 5 minutes.
- Sideloaded APKs bypass the Play Store. Only install release builds from a source you trust.

## Limitations and roadmap

- No push notifications. If the app is closed, permission requests are only visible the next time you open it.
- One saved connection at a time.
- The session list is capped at 50 sessions; the message timeline loads the latest 200 messages of a session.
- No session forking, archiving, model/agent switching, or file attachments yet.
- Android is the supported target. iOS and web run from source but are not distributed.

## Contributing

Issues and pull requests are welcome. Before opening a PR, run:

```bash
npm run typecheck
npm run lint
npx expo-doctor
```

Please keep changes consistent with the existing structure and mobile-first UI patterns.
