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
- **Replit Auth** via OpenID Connect (PKCE flow) — `/api/auth/*` routes
- **WebSocket** server attached to the same HTTP server at `/api/ws`
  - Real-time events: `MESSAGE_CREATE`, `MESSAGE_UPDATE`, `MESSAGE_DELETE`, `CHANNEL_UPDATE`, `VOICE_SIGNAL`, `PRESENCE_UPDATE`
  - WS broadcast module: `src/lib/ws.ts`
- **Object Storage** via GCS (presigned PUT URL flow)
  - 100MB file size limit enforced server-side
  - MIME type allowlist (images, video, audio, PDF, docs, archives)
- **Routes**: `/api/users`, `/api/servers`, `/api/channels`, `/api/messages`, `/api/dms`, `/api/storage`

### Frontend (artifacts/hollr)

- **React 19** + **Vite 7** + **Tailwind CSS v4** + **shadcn/ui** components
- **Wouter** for routing: `/login` → Login page, `/app` → main Layout
- **Zustand** global state: `use-app-store` (active server/channel, voice connection, modal state)
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

Tables: `user_profiles`, `servers`, `server_members`, `channels`, `dm_threads`, `dm_participants`, `messages`, `attachments`

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

## Key Design Decisions

- WebSocket server is attached to the **same HTTP server** as Express to avoid separate port
- Voice uses a **mesh WebRTC topology** (no SFU needed for small teams)
- Volume control uses the **Web Audio API GainNode** (0.0–2.0 range = 0–200%)
- Screen sharing uses `getDisplayMedia` + `RTCPeerConnection.addTrack` renegotiation
- File uploads go directly to GCS (bypasses the API server for large files)
- Auth is handled entirely by `@workspace/replit-auth-web` (OpenID Connect, not the generated API client)
