# hollr Desktop

Electron wrapper for hollr.chat with a transparent always-on-top game overlay.

## Features

- Full hollr.chat desktop experience
- System tray icon with right-click menu
- **Ctrl+Shift+H** global hotkey to toggle the in-game overlay
- Transparent overlay HUD showing unread notification count
- Overlay auto-hides mouse clicks to games when not hovering
- Collapses to a tiny gem pill when not in use

## Development

Preview the overlay UI in a browser (does not require Electron or a display):

```bash
pnpm --filter @workspace/desktop run dev:overlay
```

The overlay opens at http://localhost:5173 with mock data.

Full Electron dev mode (requires a local display — Windows/Mac):

```bash
HOLLR_URL=http://localhost:22056 pnpm --filter @workspace/desktop run dev
```

## Building

### Windows installer (.exe)

```bash
pnpm --filter @workspace/desktop run build:win
```

Output: `artifacts/desktop/dist/hollr Setup X.X.X.exe`

Requires: Windows or Linux with wine installed. The CI pipeline (GitHub Actions) handles this automatically when you push a `desktop-v*` tag.

### Linux AppImage

```bash
pnpm --filter @workspace/desktop run build:linux
```

## Release via GitHub Actions

Push a tag to trigger an automated Windows + Linux build and GitHub Release:

```bash
git tag desktop-v1.0.0
git push origin desktop-v1.0.0
```

The `.exe` installer is attached to the GitHub Release automatically.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `HOLLR_URL` | `https://hollr.chat` | URL of the hollr web app to load |
| `HOLLR_DEV` | `false` | Set to `true` for dev mode (loads overlay from localhost:5173) |
