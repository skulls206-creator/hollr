# hollr.chat — Real-Time Communication Platform

## Overview

hollr.chat is a real-time communication platform, similar to Discord, designed to provide a rich and interactive user experience. It features persistent chat, voice and video calls, file sharing, and integrated productivity tools like a rich-text editor (Ballpoint Notes) and a cloud file manager (Foldr). The project aims to offer a comprehensive communication and collaboration suite, leveraging modern web technologies for a responsive and scalable solution. Key capabilities include server and channel management, direct messaging, real-time presence, and push notifications.

## User Preferences

The user prefers an iterative development approach, with clear communication about changes and progress. They value clean, maintainable code and well-documented architectural decisions. They prefer to be asked before major architectural changes are made or significant new dependencies are introduced. The user wants the agent to prioritize security and data privacy, especially concerning encrypted data and user authentication.

## System Architecture

The project is structured as a pnpm monorepo, separating frontend, backend, and shared libraries.

**Monorepo Structure:**
- `artifacts/hollr`: React + Vite frontend.
- `artifacts/api-server`: Express + WebSocket backend.
- `lib/db`: Drizzle ORM for PostgreSQL.
- `lib/api-spec`: OpenAPI 3.1 YAML specification.
- `lib/api-zod`: Zod schemas generated from OpenAPI.
- `lib/api-client-react`: React Query hooks generated from OpenAPI.
- `lib/replit-auth-web`: Replit Auth hook.
- `lib/object-storage-web`: Uppy-backed file upload hook.

**Backend (`artifacts/api-server`):**
- **Technology Stack:** Express.js for HTTP, WebSocket for real-time communication.
- **Authentication:** Custom username/password authentication with bcryptjs hashing and PostgreSQL-backed sessions (`connect-pg-simple`).
- **Rate Limiting:** Implemented for authentication, general API, and message sending.
- **CORS:** Strict origin allowlist, fails open in development.
- **Real-time Communication:** WebSocket server at `/api/ws` for events like `MESSAGE_CREATE`, `VOICE_SIGNAL`, `PRESENCE_UPDATE`.
- **Object Storage:** Cloudflare R2 via presigned PUT URLs, with server-side file size and MIME type validation.
- **Music Bot:** Utilizes `@distube/ytdl-core` and `ffmpeg` for YouTube audio streaming, broadcasting state via WebSocket.
- **Push Notifications:** VAPID-based web push notifications with `web-push` library, supporting per-user and per-channel preferences.
- **Data Encryption:** Server-side AES-256-GCM encryption for Foldr files and Ballpoint Notes content/titles.

**Frontend (`artifacts/hollr`):**
- **Technology Stack:** React 19, Vite 7, Tailwind CSS v4, shadcn/ui components.
- **Routing:** Wouter for client-side navigation.
- **State Management:** Zustand for global application state (e.g., active server/channel, voice connection).
- **Data Fetching:** TanStack Query with generated hooks from the OpenAPI spec.
- **Real-time Interaction:** WebSocket client `use-realtime.ts` for live updates and cache invalidation.
- **WebRTC:** `use-webrtc.ts` for voice/video calls, screen sharing, per-participant volume control via `AudioContext` and `GainNode`, and speaking detection via `AnalyserNode`.
- **UI/UX:** Responsive layout, multiple themes (Midnight, Slate, Snow), Dock Mode for server navigation, user profile cards, emoji picker, and a customizable app dock for integrated applications.
- **File Upload:** Direct PUT to R2 presigned URLs with client-side progress tracking and size validation.
- **Push Notifications:** `use-push-notifications.ts` manages subscription and preferences, integrated into user settings.

**Integrated Applications (Khurk OS app dock):**
- **Ballpoint Notes:** Tiptap-based rich text editor with full formatting, multiple notes, search, and autosave to encrypted database storage.
- **Foldr:** macOS Finder-style cloud file manager with folder hierarchies, drag/drop, various views, and server-side AES-256-GCM encrypted files stored in Cloudflare R2.

**Database (`lib/db`):**
- PostgreSQL database managed by Drizzle ORM.
- Key tables include `user_profiles`, `servers`, `channels`, `messages`, `dm_threads`, `attachments`, `push_subscriptions`, `notification_prefs`, `foldr_folders`, `foldr_files`, and `ballpoint_notes`.
- Support for message threads, user mentions, and supporter badges.

**Key Design Decisions:**
- WebSocket server co-located with the HTTP server.
- Mesh WebRTC topology for voice (for small teams).
- Direct-to-R2 file uploads to optimize performance.
- Transparent encryption for sensitive data in Foldr and Ballpoint Notes.
- Client-side volume control via Web Audio API.

## External Dependencies

- **PostgreSQL:** Primary database.
- **Cloudflare R2:** Object storage for files and attachments.
- **Replit Auth (OpenID Connect):** For user authentication.
- **@distube/ytdl-core:** YouTube audio extraction for the music bot.
- **ffmpeg:** Used by the music bot for audio transcoding.
- **web-push:** Library for sending VAPID-based push notifications.
- **Stripe:** For managing supporter subscriptions and webhooks.
- **Tailwind CSS:** Utility-first CSS framework.
- **shadcn/ui:** UI component library.
- **Wouter:** Lightweight React router.
- **Zustand:** Small, fast, and scalable bearbones state-management solution.
- **TanStack Query:** Data fetching and caching library.
- **Uppy:** File upload library (integrated via `object-storage-web`).
- **bcryptjs:** Password hashing.
- **express-rate-limit:** Middleware for rate limiting.
- **connect-pg-simple:** PostgreSQL session store for Express.