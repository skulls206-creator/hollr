# hollr.chat — Real-Time Communication Platform

A Discord-clone built with React + Vite (frontend) and Express + WebSocket (backend) in a pnpm monorepo.

## Architecture

### Monorepo Layout

```
artifacts/
  hollr/          — React + Vite frontend (preview path: /)
  api-server/     — Express + WS backend (port 8080)
lib/
  db/             — Drizzle ORM schema + PostgreSQL client
  api-spec/       — OpenAPI 3.1 YAML spec
  api-zod/        — Zod schemas generated from OpenAPI spec
  api-client-react/ — React Query hooks generated from OpenAPI spec
  replit-auth-web/  — Replit Auth hook (useAuth)
  object-storage-web/ — Uppy-backed file upload hook
```

### Backend (artifacts/api-server)

- **Express** HTTP server with session middleware (PostgreSQL-backed via `connect-pg-simple`)
- **Rate limiting** via `express-rate-limit`: auth (20/15min IP), general API (500/15min IP), message send (60/min per user ID post-auth)
- **CORS**: strict origin allowlist via `ALLOWED_ORIGINS` env var (comma-separated); fails open (allow-all) when not set in dev
- **Custom Auth** (username + password) — `/api/auth/*` routes
  - `POST /api/auth/signup` — register with username + password (email optional)
  - `POST /api/auth/login` — sign in with username OR email + password (auto-detects `@`)
  - `POST /api/auth/logout` — clear session cookie
  - `PATCH /api/auth/email` — authenticated users can add/update their email
  - Passwords hashed with bcryptjs (12 rounds); sessions in PostgreSQL `sessions` table
- **WebSocket** server attached to the same HTTP server at `/api/ws`
  - Real-time events: `MESSAGE_CREATE`, `MESSAGE_UPDATE`, `MESSAGE_DELETE`, `CHANNEL_UPDATE`, `VOICE_SIGNAL`, `PRESENCE_UPDATE`, `THREAD_REPLY_CREATE`
  - WS broadcast module: `src/lib/ws.ts`
- **Object Storage** via Cloudflare R2 (S3-compatible presigned PUT URL flow)
  - 100MB file size limit enforced server-side
  - MIME type allowlist (images, video, audio, PDF, docs, archives)
- **Routes**: `/api/users`, `/api/servers`, `/api/channels`, `/api/messages`, `/api/dms`, `/api/storage`, `/api/voice/:channelId/music/*`
  - Reaction toggle: `PUT /api/channels/:channelId/messages/:messageId/reactions/:emojiId`
  - Thread replies: `GET|POST /api/channels/:channelId/messages/:messageId/thread`
  - User profile: `GET /api/users/:userId` (note: `/users/me` must be registered first)
  - Music bot: `POST /join|leave|play|pause|resume|skip|stop`, `GET /state|stream`
  - Moderation: `DELETE /api/servers/:id/members/:uid` (kick), `POST/DELETE /api/servers/:id/bans/:uid` (ban/unban), `GET /api/servers/:id/bans`
  - Invite with expiry: `POST /api/servers/:id/invite` accepts `{ expiresInHours, maxUses }`; ban + expiry + max-uses checked on both join paths
- **Music Bot** (`src/lib/music-bot.ts`):
  - `@distube/ytdl-core` for YouTube audio extraction; `pickAudioFormat()` manually sorts audio-only formats by bitrate (avoids `ytdl.chooseFormat` which throws on YouTube format changes)
  - `ffmpeg` transcodes stream → 128kbps MP3 → chunked HTTP response to all browser clients
  - `MusicBotManager` singleton; per-channel `ChannelMusic` emits `stateChange` events → WS broadcast every 5s
  - WebSocket event `MUSIC_STATE_UPDATE` carries `MusicState` to all clients
  - Stream endpoint: `GET /api/voice/:channelId/music/stream` (no auth, chunked `audio/mpeg`)

### Frontend (artifacts/hollr)

- **React 19** + **Vite 7** + **Tailwind CSS v4** + **shadcn/ui** components
- **Wouter** for routing: `/login` → Login page, `/app` → main Layout
- **Zustand** global state: `use-app-store` (active server/channel, voice connection, modal state, thread sidebar, profile card)
- **TanStack Query** for all API data fetching (generated hooks from `@workspace/api-client-react`)
- **WebSocket** in `use-realtime.ts` — connects to `/api/ws`, invalidates React Query cache on events
- **WebRTC** in `use-webrtc.ts`:
  - `getUserMedia` with `noiseSuppression: true, echoCancellation: true`
  - `getDisplayMedia` for screen sharing with track renegotiation
  - `AudioContext` + `GainNode` per participant for 0–200% volume control
- **File Upload** in `MessageComposer.tsx`:
  - 100MB client-side check before requesting presigned URL
  - Direct PUT to R2 presigned URL with progress bar
  - Attachments stored as `objectPath` in messages

### Push Notifications (api-server + hollr)

- **VAPID keys**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` in env; `web-push` library sends payloads
- **Backend lib**: `src/lib/push.ts` — `sendPushToUser(userId, payload)` + `getNotifPrefs(userId)` to check per-channel/DM mutes
- **Routes** (`/api/push`): `GET /vapid-key`, `POST /subscribe`, `POST /unsubscribe`, `GET|PUT /prefs` (muteDms, mutedChannelIds[])
- **Fire-and-forget**: `messages.ts` and `dms.ts` broadcast WS first, then call push async (no HTTP delay)
- **Service worker**: `public/sw.js` — handles `push` event → `showNotification`; `notificationclick` → focuses/navigates; registered in `main.tsx` at `BASE_URL + "sw.js"`
- **Frontend hook**: `use-push-notifications.ts` — manages permission, subscription, prefs sync; exposed in `UserSettingsModal` (Notifications tab) + `ChannelSidebar` (context menu per-channel mute)
- **Notifications tab** in `UserSettingsModal`: subscribe/unsubscribe toggle, DM mute toggle, hint for per-channel muting
- **Channel context menu**: Right-click any text channel → Mute/Unmute notifications (when subscribed); also has Rename/Delete for admins

### Database (lib/db)

Tables: `user_profiles`, `servers`, `server_members`, `channels`, `dm_threads`, `dm_participants`, `messages`, `attachments`, `message_reactions`, `push_subscriptions`, `notification_prefs`

New columns on `messages`: `parentMessageId`, `replyCount`, `mentions` (text array)

New columns on `user_profiles`: `isSupporter` (boolean, default false), `stripeCustomerId` (text nullable)

## Development

```bash
# Install deps
pnpm install

# Push DB schema
pnpm --filter @workspace/db push

# Start all services (workflows auto-start via Replit)
# API server: port 8080
# Frontend: port set via PORT env variable
```

## Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `R2_ENDPOINT` | Cloudflare R2 endpoint URL |
| `R2_ACCESS_KEY_ID` | R2 access key ID |
| `R2_SECRET_ACCESS_KEY` | R2 secret access key |
| `R2_BUCKET_NAME` | R2 bucket name |
| `PRIVATE_OBJECT_DIR` | Private object storage path prefix |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Public object search paths |
| `SESSION_SECRET` | Express session secret (set in Replit secrets) |
| `PORT` | Server port (set by Replit per artifact) |
| `REPLIT_DOMAINS` | Comma-separated domains for CORS/auth |

## Features

- **Auth**: Replit OIDC (Sign in with Replit)
- **Servers & Channels**: Create, rename, delete; server settings modal; invite via code
- **Real-time chat**: WebSocket (MESSAGE_CREATE/UPDATE/DELETE); message edit/delete/pin/search
- **Emoji Reactions**: React to messages with any emoji; toggle add/remove; shown as pills with counts
- **Message Threads**: Click thread icon → ThreadSidebar; reply in thread; "X replies" link on parent message
- **@Mention autocomplete**: Type `@` in composer → member dropdown; mention text highlighted in rendered messages
- **Emoji Picker**: `emoji-picker-react` integrated in composer toolbar
- **User Profile Card**: Click avatar/username → floating profile card (no blocking overlay); Escape to close
- **DMs**: Open direct message threads with any server member
- **Voice/Video**: WebRTC mesh with per-participant volume control (0–200%); real-time user presence in sidebar; speaking detection via AnalyserNode; LIVE badge for any connected user
- **Screen Share**: Dropdown in VoiceOverlay to choose Entire Screen / Application Window / Browser Tab; `getDisplayMedia` with `displaySurface` hint + track renegotiation
- **Music Bot**: Type `/play <youtube-url>` in any channel while in a voice channel; real-time `MusicControlBar` shows current track, progress, queue; `/pause`, `/resume`, `/skip`, `/stop` commands; bot avatar appears in voice sidebar; volume 0–200% via Web Audio gain node
- **File Upload**: Direct-to-R2 presigned URL flow, 100MB limit, progress bar
- **Push Notifications**: Web Push (VAPID); per-device subscription; mute DMs globally; mute individual channels via right-click context menu; Notifications tab in User Settings
- **Supporter Badge**: Stripe-backed $1/month or $10/year subscription; `isSupporter` flag synced via webhooks; animated cyan diamond badge (KhurkDiamondBadge SVG) shown next to name in MessageList, MemberList, UserProfileCard; Supporter tab in User Settings for manage/cancel via Stripe portal
- **Mobile**: Responsive layout with slide-in sidebar
- **Presence**: Online/idle/dnd/offline status indicators
- **Dock Mode**: Toggleable layout in User Settings (Profile tab → Layout Style); macOS Dock-style server switcher at the bottom with framer-motion mouse-proximity magnification; DM FAB pinned bottom-left; `layoutMode` persisted to localStorage via Zustand
- **Themes**: Three user-selectable themes in User Settings (Profile tab → Theme): Midnight (deep blue-black, default), Slate (warmer charcoal gray), Snow (light/white). Applied via `data-theme` on `<html>` element; no-flash via blocking inline script in index.html; all 85 hardcoded hex surface colors replaced with CSS-var-backed Tailwind `bg-surface-{0-3}` classes; `theme` persisted to localStorage via Zustand
- **KHURK OS app dock**: Slide-out app dock with macOS-style icons; `AppWindow.tsx` renders apps as overlaid panels. Ballpoint Notes and Foldr run as native React panels (no iframe). All other KHURK apps continue to render in iframes.
  - **Native panel API**: `KhurkApp.nativePanel` — lazy-loaded `ComponentType<NativePanelProps>` replaces iframe rendering. `NativePanelProps` = `{ storagePrefix: string }` only (no FS access needed — both apps are cloud-backed via HOLLR account auth).
  - **BallpointPanel** (`src/components/khurk/apps/BallpointPanel.tsx`): Tiptap-based rich text editor with full formatting toolbar (Bold/Italic/Underline, font size, heading style, font family, lists, task lists, link, image, alignment), tab bar for multiple open notes, sidebar with All/Pinned/Archived/Trash sections, search, context-menu (pin/archive/trash/restore/delete forever), 900ms debounced autosave to DB via `PATCH /api/ballpoint/notes/:id`.
  - **FoldrPanel** (`src/components/khurk/apps/FoldrPanel.tsx`): IPFS-backed cloud file manager — uploads to Lighthouse (lighthouse.storage) via `POST /api/foldr/upload`, lists files from DB, grid/list toggle, file type icons with image previews, detail sidebar showing file info + IPFS CID + copy, download, delete. Drag-and-drop upload supported. Soft-delete only (files remain pinned on IPFS).
  - **DB tables**: `foldr_files` (id, userId, name, size, mimeType, cid, uploadedAt, deletedAt) + `ballpoint_notes` (id, userId, title, content as HTML, isPinned, isArchived, isTrashed, timestamps)
  - **API routes**: `GET/POST /api/ballpoint/notes`, `GET /api/ballpoint/notes/trash`, `PATCH/DELETE /api/ballpoint/notes/:id`; `POST /api/foldr/upload`, `GET /api/foldr/files`, `DELETE /api/foldr/files/:id`
  - **Ballpoint encryption**: All note `title` and `content` fields are AES-256-GCM encrypted at rest before writing to the DB (`artifacts/api-server/src/lib/ballpoint-crypto.ts`). Format: `enc:<base64(iv+authTag+ciphertext)>`. Random 12-byte IV per encryption. Key is `BALLPOINT_ENCRYPTION_KEY` (64-char hex, 256-bit). Legacy plaintext rows pass through transparently. Non-sensitive metadata (isPinned, isArchived, isTrashed, timestamps) stored in plaintext.

## Key Design Decisions

- WebSocket server is attached to the **same HTTP server** as Express to avoid separate port
- Voice uses a **mesh WebRTC topology** (no SFU needed for small teams)
- Volume control uses the **Web Audio API GainNode** (0.0–2.0 range = 0–200%)
- Screen sharing uses `getDisplayMedia` + `RTCPeerConnection.addTrack` renegotiation
- File uploads go directly to Cloudflare R2 via presigned URLs (bypasses the API server for large files)
- Auth is handled entirely by `@workspace/replit-auth-web` (OpenID Connect, not the generated API client)
- `UserProfileCard` uses mousedown-outside-click listener only (no full-screen backdrop overlay) to avoid blocking other interactions
- Route order in `users.ts`: `/users/me` must be registered before `/users/:userId`
- Voice signaling uses a module-level `sendVoiceSignal` singleton in `use-realtime.ts` to avoid creating duplicate WebSocket connections from `use-webrtc.ts`
- Voice room state is tracked server-side in `voiceRooms: Map<channelId, Map<userId, VoiceParticipant>>` and `userVoiceChannel: Map<userId, channelId>` for disconnect cleanup
- Speaking detection polls AnalyserNode every 80ms with RMS threshold=18 and 600ms debounce before `speaking_stop`
- LIVE badge appears when `voiceChannelUsers[channelId].length > 0` (any user, not just self)
- Music bot uses `pickAudioFormat()` (manual bitrate sort on audio-only formats) NOT `ytdl.chooseFormat({ quality: 'highestaudio' })` which throws when YouTube format labels change
- Music stream position timer broadcasts every 5s (not 1s) to reduce WS noise; frontend ticks up locally by 500ms intervals between broadcasts
- `@workspace/api-zod` is a direct devDependency of `@workspace/hollr` (required for music types); added to tsconfig.json references and built with `tsc --build`
- `pickAudioFormat()` must NOT filter by `f.url` — YouTube formats using signatureCipher have no `url` until `downloadFromInfo` deciphers them at download time; filtering by url removed all formats
- `MusicControlBar` is rendered in `Layout.tsx` (NOT in `ChatArea.tsx`) as a global bottom flex-item; root Layout div is `flex-col` so the music bar sits below the content row; `VoiceOverlay` is rendered inside the `relative flex flex-1` content row so its `absolute bottom-X` positioning is scoped to the content area and never covers the music bar
