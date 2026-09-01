# P2P Collaborative Text Editor — Part 1

Real-time collaborative rich-text editing over direct WebRTC connections between browsers, using Yjs CRDTs. A minimal Node.js WebSocket server is used **only** for initial peer discovery/signaling — it never sees document content. See `ARCHITECTURE.md` for the full data-flow diagram and the CRDT/no-central-authority explanation for your report.

## Stack

- Frontend: React + Vite
- CRDT: Yjs
- P2P transport: y-webrtc (WebRTC data channels, Google STUN)
- Editor: Quill.js bound via y-quill
- Presence: y-webrtc's built-in awareness (`y-protocols/awareness`, bundled in `yjs`)
- Local persistence: y-indexeddb (survives tab refresh only — not distributed storage)
- Signaling: custom Node.js + `ws` server

## Project layout

```
p2p-editor/
├── signaling-server/   # Node.js ws signaling server (peer discovery only)
├── frontend/           # React + Vite app
├── ARCHITECTURE.md      # diagrams + CRDT / no-central-authority explanation
└── README.md
```

## Setup

Requires Node.js >= 18.

```bash
cd p2p-editor
npm run install:all
```

(equivalent to running `npm install` inside both `signaling-server/` and `frontend/`)

Copy the frontend env example (defaults are fine for local testing):

```bash
cp frontend/.env.example frontend/.env
```

## Running locally

Two terminals, from the `p2p-editor/` root:

```bash
# Terminal 1 — signaling server (localhost:4444)
npm run signaling

# Terminal 2 — frontend dev server (localhost:5173)
npm run dev
```
```bash
# for cross device testing - terminal 1
cd signaling-server && npm start

# Terminal 2 
cd frontend && npm run dev -- --host
```





Open `http://localhost:5173` — a room ID is generated automatically and appended to the URL (`?room=...`). Open the same URL in a second tab (or an incognito window) to test sync.

## Testing checklist (all verified against this implementation)

1. **Two-way sync**: Open the room URL in two browser windows (e.g. one normal, one incognito, so they don't share `sessionStorage`/identity). Type in one — text appears in the other within ~1s on the same machine/network.
2. **Three-way sync**: Open a third window with the same room URL. All three should converge, not just pairwise — try typing in different windows in quick succession and confirm every window ends up with identical text.
3. **Presence on close**: Close one window. The remaining windows' peer list should drop that peer within a few seconds (awareness timeout), with no crash or console error.
4. **Refresh recovery**: Refresh one tab. It reconnects (status goes Connecting → Connected) and the editor repopulates from `y-indexeddb`'s local cache immediately, then re-syncs with peers over WebRTC to catch up on anything it missed while reloading.
5. **Signaling server killed after connection**: With two tabs already showing "Connected via P2P", stop the signaling server (Ctrl+C in its terminal). Keep typing in both tabs — **sync keeps working**, confirmed by testing: the connection between the two browsers was already established and does not depend on the signaling server staying up.
   - **Important nuance found during testing**: if the *new* peer you open afterwards is another tab in the **same browser**, it will still connect — y-webrtc also uses the browser's `BroadcastChannel` API as a same-origin fast path, completely independent of the signaling server, so same-browser tabs can always find each other regardless of signaling state. This is expected y-webrtc behavior, not a bug, but it means "open a 3rd tab" is *not* a valid way to test signaling-dependent discovery.
   - To actually observe discovery failing, the new peer must be a genuinely separate browser context that shares no `BroadcastChannel` with the existing tabs — e.g. a **different device** (see the cross-device section below), or a different browser entirely (Chrome vs. Firefox) on the same machine. In that situation, with the signaling server down, the new peer correctly gets stuck on "Connecting…" and then "Connection error", while the original two tabs keep syncing unaffected.
6. **Cross-device on the same Wi-Fi** — see below.

## Testing across two real devices on the same Wi-Fi

`localhost` only works within one machine, so for a genuine second-device test:

1. On the machine running the servers, find its LAN IP:
   - Windows (PowerShell): `ipconfig` → look for "IPv4 Address" under your active Wi-Fi adapter (e.g. `192.168.1.23`).
2. Edit `frontend/.env`:
   ```
   VITE_SIGNALING_URL=ws://192.168.1.23:4444
   ```
   (use your actual IP)
3. Restart the frontend dev server (`npm run dev`) — Vite is already configured with `host: true` (see `frontend/vite.config.js`), so it binds to all network interfaces, not just localhost.
4. On the **first** device, open `http://192.168.1.23:5173` (note: not `localhost`) and copy the room link from the "Copy link" button.
5. On the **second** device (phone, laptop, another PC — same Wi-Fi network), open that copied link in a browser.
6. Both devices must be able to reach `192.168.1.23:4444` and `:5173` — if your OS firewall prompts to allow Node.js/network access the first time you start these servers, allow it (Private/Home network), otherwise the second device's connections will be blocked before they even reach WebRTC.
7. Confirm typing syncs both ways and both devices show each other in the presence panel.

If the two devices can't establish a WebRTC connection despite signaling succeeding (visible as "Connecting…" that never resolves to "Connected"), it's most likely router client isolation (some Wi-Fi APs, especially "guest" networks, block device-to-device traffic) — this is a network configuration issue, not a bug in the app, and is the boundary case where a TURN server (intentionally out of scope for Part 1) would normally be added.

## Deploying the signaling server

A `Dockerfile` is provided in `signaling-server/`. Any container host works; Render's free tier is the simplest:

1. Push this repo to GitHub.
2. On Render: **New → Web Service**, point at the repo, set root directory to `signaling-server`, and either let it detect the `Dockerfile` or set:
   - Build command: `npm install`
   - Start command: `npm start`
3. Render assigns a public URL like `wss://your-service.onrender.com` (Render terminates TLS, so use `wss://` not `ws://`). Set `VITE_SIGNALING_URL` in `frontend/.env` to that URL and rebuild the frontend.

No environment variables are required beyond the optional `PORT` (Render sets this automatically; the server already reads `process.env.PORT`).

## What was NOT fully implemented, and why

- **TURN server**: intentionally excluded per the project spec (STUN-only, same-network demo assumption). Flagged again here since it's the most likely cause of a failed cross-network demo.
- **Deterministic "WebRTC failed" error detection**: y-webrtc doesn't expose one clean event for "handshake failed" at the provider API level; the app uses an 8-second timeout heuristic (see `frontend/src/hooks/useYjsRoom.js`) instead of a guaranteed instant failure signal. Documented in `ARCHITECTURE.md` under Known Limitations.
- **QR code generation**: not in the required dependency list; a copyable share link is provided instead so as not to introduce an unrequested dependency. Easy to add later with a small `qrcode` package if wanted.
- Everything else in the requirements (room sessions, real-time sync, presence + remote cursors, connection status, signaling boundary, local persistence) is implemented and covered by the testing checklist above.
