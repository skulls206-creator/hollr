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
- **Replit Auth** via OpenID Connect (PKCE flow) — `/api/auth/*` routes
- **WebSocket** server attached to the same HTTP server at `/api/ws`
  - Real-time events: `MESSAGE_CREATE`, `MESSAGE_UPDATE`, `MESSAGE_DELETE`, `CHANNEL_UPDATE`, `VOICE_SIGNAL`, `PRESENCE_UPDATE`, `THREAD_REPLY_CREATE`
  - WS broadcast module: `src/lib/ws.ts`
- **Object Storage** via GCS (presigned PUT URL flow)
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
  - Direct PUT to GCS presigned URL with progress bar
  - Attachments stored as `objectPath` in messages

### Database (lib/db)

Tables: `user_profiles`, `servers`, `server_members`, `channels`, `dm_threads`, `dm_participants`, `messages`, `attachments`, `message_reactions`

New columns on `messages`: `parentMessageId`, `replyCount`, `mentions` (text array)

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
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | GCS bucket ID for Replit object storage |
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
- **File Upload**: Direct-to-GCS presigned URL flow, 100MB limit, progress bar
- **Mobile**: Responsive layout with slide-in sidebar
- **Presence**: Online/idle/dnd/offline status indicators

## Key Design Decisions

- WebSocket server is attached to the **same HTTP server** as Express to avoid separate port
- Voice uses a **mesh WebRTC topology** (no SFU needed for small teams)
- Volume control uses the **Web Audio API GainNode** (0.0–2.0 range = 0–200%)
- Screen sharing uses `getDisplayMedia` + `RTCPeerConnection.addTrack` renegotiation
- File uploads go directly to GCS (bypasses the API server for large files)
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
