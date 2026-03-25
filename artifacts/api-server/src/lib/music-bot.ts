import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { ServerResponse } from 'http';
import playdl, { type SoundCloudTrack } from 'play-dl';
import type { Track, MusicState } from '@workspace/api-zod';

export const BOT_USER_ID = 'hollr-music-bot';
export const BOT_DISPLAY_NAME = 'Music Bot';
export const BOT_USERNAME = 'music-bot';

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

// ── play-dl initialisation ────────────────────────────────────────────────────

let playdlReady = false;

async function ensurePlaydl() {
  if (playdlReady) return;
  try {
    const clientId = await playdl.getFreeClientID();
    await playdl.setToken({ soundcloud: { client_id: clientId } });
    playdlReady = true;
    console.log('[music] play-dl initialised with SoundCloud client ID');
  } catch (err: any) {
    console.error('[music] Failed to init play-dl:', err.message);
  }
}

ensurePlaydl().catch(() => {});

// ── Track resolution ──────────────────────────────────────────────────────────

/** Resolved metadata + a SoundCloud URL to actually stream. */
interface Resolved {
  track: Omit<Track, 'requestedBy'>;
  scUrl: string;
}

function isYouTubeUrl(input: string) {
  return input.includes('youtube.com/') || input.includes('youtu.be/');
}

function isSoundCloudUrl(input: string) {
  return input.includes('soundcloud.com/');
}

/** Remove common YouTube title noise like "(Official Visualizer)", "(Audio)", etc. */
function cleanYouTubeTitle(title: string): string {
  return title
    // Normalize Unicode dashes (en-dash –, em-dash —, horizontal bar ―) to ASCII hyphen
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/\(official\s*(music\s*)?video\)/gi, '')
    .replace(/\(official\s*(audio|visualizer|lyric\s*video|version)\)/gi, '')
    .replace(/\(lyric\s*video\)/gi, '')
    .replace(/\(audio\)/gi, '')
    .replace(/\(hd\)/gi, '')
    .replace(/\[official\s*(music\s*)?video\]/gi, '')
    .replace(/\[official\s*(audio|visualizer|lyric\s*video)\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Resolve any input (YouTube URL, SoundCloud URL, or search query) to a
 * streamable SoundCloud track + metadata.
 *
 * Strategy:
 *   - SoundCloud URL → fetch info directly, stream directly
 *   - YouTube URL   → get YT metadata for title/duration/thumbnail, then
 *                     search SoundCloud by title (closest duration match)
 *   - Search query  → search SoundCloud directly
 */
export async function resolveTrack(input: string): Promise<Resolved> {
  await ensurePlaydl();

  // ── SoundCloud URL ─────────────────────────────────────────────────────────
  if (isSoundCloudUrl(input)) {
    const info = await playdl.soundcloud(input);
    if (info.type !== 'track') throw new Error('Only SoundCloud track URLs are supported (not playlists)');
    const t = info as SoundCloudTrack;
    return {
      track: {
        url: input,
        title: t.name,
        durationMs: t.durationInSec * 1000,
        thumbnail: t.thumbnail ?? null,
      },
      scUrl: input,
    };
  }

  // ── YouTube URL → auto-switch to SoundCloud ────────────────────────────────
  if (isYouTubeUrl(input)) {
    // Step 1: get YouTube metadata — three-tier fallback so transient errors
    // (rate-limits, PoToken, network blips) don't block playback.
    let ytTitle = '';
    let ytChannel = '';
    let ytDurationSec = 0;
    let ytThumbnail: string | null = null;
    let metaOk = false;

    // Tier 1: play-dl video_info (tries twice before giving up)
    for (let attempt = 1; attempt <= 2 && !metaOk; attempt++) {
      try {
        // Re-init play-dl on retry in case the SoundCloud token drifted
        if (attempt === 2) { playdlReady = false; await ensurePlaydl(); }
        const ytInfo = await playdl.video_info(input);
        const d = ytInfo.video_details;
        ytTitle = d.title ?? '';
        ytChannel = d.channel?.name ?? '';
        ytDurationSec = d.durationInSec ?? 0;
        ytThumbnail = d.thumbnails?.[0]?.url ?? null;
        metaOk = true;
      } catch {
        console.warn(`[music] video_info attempt ${attempt} failed for: ${input}`);
        if (attempt < 2) await new Promise(r => setTimeout(r, 1500));
      }
    }

    // Tier 2: scrape YouTube's og:title via plain HTTPS fetch (no auth required)
    if (!metaOk) {
      try {
        const res = await fetch(input, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
          signal: AbortSignal.timeout(6000),
        });
        const html = await res.text();
        const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
                     ?? html.match(/<title>([^<]+)<\/title>/i)?.[1]
                     ?? '';
        if (ogTitle) {
          ytTitle = ogTitle.replace(/ - YouTube$/, '').trim();
          metaOk = true;
          console.log(`[music] og:title fallback: "${ytTitle}"`);
        }
      } catch (fetchErr: any) {
        console.warn('[music] og:title fetch failed:', fetchErr.message);
      }
    }

    // Tier 3: truly no metadata — throw the user-facing error
    if (!metaOk || !ytTitle) {
      throw new Error(
        `That YouTube video is unavailable (private, deleted, or region-blocked). ` +
        `Try a SoundCloud link or search: /play <song name>`
      );
    }

    const cleanTitle = cleanYouTubeTitle(ytTitle);
    const dashIdx = cleanTitle.indexOf(' - ');
    const songName = dashIdx > 0 ? cleanTitle.slice(dashIdx + 3).trim() : cleanTitle;
    const artistName = dashIdx > 0 ? cleanTitle.slice(0, dashIdx).trim() : ytChannel;

    console.log(`[music] YouTube → SoundCloud auto-switch for: "${cleanTitle}" (${ytDurationSec}s)`);

    // Step 2: search SoundCloud with multiple query strategies
    const queries = [
      `${songName} ${artistName}`.trim(),
      `${songName} ${ytChannel}`.trim(),
      songName,
    ].filter((q, i, arr) => q && arr.indexOf(q) === i);

    let scResults: SoundCloudTrack[] = [];
    for (const q of queries) {
      console.log(`[music] Searching SoundCloud: "${q}"`);
      const found = await playdl.search(q, { source: { soundcloud: 'tracks' }, limit: 10 }) as SoundCloudTrack[];
      if (found.length > 0) { scResults = found; break; }
    }

    if (scResults.length === 0) {
      throw new Error(
        `"${cleanTitle}" wasn't found on SoundCloud. ` +
        `Try a SoundCloud link or search: /play ${songName}`
      );
    }

    // Step 3: score candidates
    // A good match: song name appears at START or END of result title, and duration is close
    const songNameLower = songName.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    const artistLower = artistName.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

    interface Candidate { r: SoundCloudTrack; score: number; diff: number; }
    const candidates: Candidate[] = scResults.map(r => {
      const rLower = r.name.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
      const diff = Math.abs(r.durationInSec - ytDurationSec);

      // Score: exact name match at boundary = 3, artist match = 2, any containment = 1
      let score = 0;
      if (rLower === songNameLower) score += 5;                          // exact title match
      else if (rLower.startsWith(songNameLower + ' ') || rLower.endsWith(' ' + songNameLower)) score += 3;
      else if (rLower.includes(songNameLower)) score += 1;

      const rArtistLower = (r.user?.name ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, '');
      if (artistLower && rArtistLower.includes(artistLower)) score += 2;  // artist match
      if (diff <= 10) score += 2;                                          // very close duration
      else if (diff <= 30) score += 1;                                     // close duration

      return { r, score, diff };
    });

    // Pick best candidate: must have score > 0.
    // Only apply duration filter when we actually know the YT duration (> 0).
    const best = candidates
      .filter(c => c.score > 0 && (ytDurationSec === 0 || c.diff <= 60))
      .sort((a, b) => b.score - a.score || a.diff - b.diff)[0];

    if (!best) {
      throw new Error(
        `"${cleanTitle}" isn't available on SoundCloud. ` +
        `Try: /play ${songName}, or paste a SoundCloud link.`
      );
    }

    console.log(`[music] Auto-matched SoundCloud: "${best.r.name}" by ${best.r.user?.name} (score=${best.score}, diff=${best.diff}s)`);

    return {
      track: {
        url: input,               // keep YouTube URL for display
        title: ytTitle,           // use YouTube title for display
        durationMs: (ytDurationSec || best.r.durationInSec) * 1000,
        thumbnail: ytThumbnail ?? best.r.thumbnail ?? null,
      },
      scUrl: best.r.url,
    };
  }

  // ── Search query ───────────────────────────────────────────────────────────
  const results = await playdl.search(input, { source: { soundcloud: 'tracks' }, limit: 5 });
  if (results.length === 0) {
    throw new Error(`No results found for "${input}" on SoundCloud`);
  }
  const t = results[0] as SoundCloudTrack;
  console.log(`[music] Search resolved to: "${t.name}" by ${t.user?.name}`);
  return {
    track: {
      url: t.url,
      title: t.name,
      durationMs: t.durationInSec * 1000,
      thumbnail: t.thumbnail ?? null,
    },
    scUrl: t.url,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Per-channel music session
// ──────────────────────────────────────────────────────────────────────────────
export interface MusicEffects {
  bassBoost: boolean;
  nightcore: boolean;
  normalize: boolean;
}

function buildAudioFilter(effects: MusicEffects): string[] {
  const filters: string[] = [];
  if (effects.bassBoost) filters.push('bass=g=8');
  if (effects.nightcore) filters.push('asetrate=53900,aresample=44100');
  if (effects.normalize) filters.push('loudnorm=I=-16:LRA=11:TP=-1.5');
  if (filters.length === 0) return [];
  return ['-af', filters.join(',')];
}

class ChannelMusic extends EventEmitter {
  readonly channelId: string;
  state: MusicState;
  effects: MusicEffects = { bassBoost: false, nightcore: false, normalize: false };

  private streamClients = new Set<ServerResponse>();
  private ffmpegProc: ChildProcess | null = null;
  private playStartTime: number = 0;
  private pausedPositionMs: number = 0;
  private positionTimer: ReturnType<typeof setInterval> | null = null;
  private currentScUrl: string | null = null;
  private playbackEndTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(channelId: string) {
    super();
    this.channelId = channelId;
    this.state = {
      channelId,
      isPlaying: false,
      currentTrack: null,
      positionMs: 0,
      durationMs: 0,
      queue: [],
      botConnected: false,
    };
  }

  // ── streaming ─────────────────────────────────────────────────────────────

  addStreamClient(res: ServerResponse) {
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-cache, no-store',
      'Transfer-Encoding': 'chunked',
      'X-Content-Type-Options': 'nosniff',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    this.streamClients.add(res);
    console.log(`[music] Stream client connected to channel ${this.channelId} (total: ${this.streamClients.size})`);
    res.on('close', () => {
      this.streamClients.delete(res);
      console.log(`[music] Stream client disconnected from channel ${this.channelId} (remaining: ${this.streamClients.size})`);
    });
  }

  private broadcastAudio(chunk: Buffer) {
    for (const client of this.streamClients) {
      try {
        if (!client.writableEnded) client.write(chunk);
      } catch { /* client gone */ }
    }
  }

  private closeStreamClients() {
    for (const client of this.streamClients) {
      try { client.end(); } catch { /* ignore */ }
    }
    this.streamClients.clear();
  }

  // ── position timer ────────────────────────────────────────────────────────

  private startPositionTimer() {
    if (this.positionTimer) clearInterval(this.positionTimer);
    this.positionTimer = setInterval(() => {
      if (this.state.isPlaying) {
        this.state.positionMs = Math.min(
          this.pausedPositionMs + (Date.now() - this.playStartTime),
          this.state.durationMs || Infinity,
        );
        this.emit('stateChange', this.state);
      }
    }, 5000);
  }

  private stopPositionTimer() {
    if (this.positionTimer) {
      clearInterval(this.positionTimer);
      this.positionTimer = null;
    }
  }

  // ── ffmpeg + play-dl stream ───────────────────────────────────────────────

  private stopStream() {
    // Cancel any pending end-of-track timer
    if (this.playbackEndTimer) {
      clearTimeout(this.playbackEndTimer);
      this.playbackEndTimer = null;
    }
    if (this.ffmpegProc) {
      const proc = this.ffmpegProc;
      this.ffmpegProc = null;
      proc.removeAllListeners();
      try { proc.stdin?.destroy(); } catch { /* ignore */ }
      try { proc.kill('SIGKILL'); } catch { /* ignore */ }
    }
    this.closeStreamClients();
  }

  private async startFfmpeg(scUrl: string, seekSecs: number = 0): Promise<void> {
    // Get a fresh play-dl stream from SoundCloud
    const dlStream = await playdl.stream(scUrl, { quality: 1 });
    console.log(`[music] play-dl stream type: ${dlStream.type} for channel ${this.channelId}`);

    const ffmpegArgs: string[] = [
      '-loglevel', 'warning',
      '-i', 'pipe:0',
      ...(seekSecs > 0 ? ['-ss', seekSecs.toFixed(3)] : []),
      '-vn',
      ...buildAudioFilter(this.effects),
      '-c:a', 'libmp3lame',
      '-b:a', '128k',
      '-ar', '44100',
      '-f', 'mp3',
      'pipe:1',
    ];

    console.log(`[music] Spawning ffmpeg for channel ${this.channelId}, seek=${seekSecs}s`);
    const proc = spawn(FFMPEG, ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.ffmpegProc = proc;

    let stderrBuf = '';
    proc.stderr!.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString();
      const lines = stderrBuf.split('\n');
      stderrBuf = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) console.log(`[ffmpeg] ${line}`);
      }
    });

    dlStream.stream.on('error', (err) => {
      console.error('[music] play-dl stream error:', err.message);
      try { proc.stdin?.destroy(); } catch { /* ignore */ }
    });

    dlStream.stream.pipe(proc.stdin!);

    proc.stdout!.on('data', (chunk: Buffer) => {
      this.broadcastAudio(chunk);
    });

    proc.on('error', (err) => {
      console.error('[music] ffmpeg spawn error:', err.message);
      this.handlePlaybackError(`ffmpeg error: ${err.message}`);
    });

    proc.on('close', (code) => {
      if (proc !== this.ffmpegProc) return;
      this.ffmpegProc = null;
      console.log(`[music] ffmpeg exited with code ${code} for channel ${this.channelId}`);

      if (code !== 0) {
        console.error(`[music] ffmpeg failed (code ${code})`);
        this.handlePlaybackError('Playback failed (ffmpeg error)');
        return;
      }

      if (!this.state.isPlaying) return; // was paused or stopped externally

      // SoundCloud often delivers ALL audio as an instant burst, so ffmpeg
      // exits immediately even though the browser is still playing the buffered
      // audio.  Calculate how much time remains and wait before advancing the
      // queue so the frontend doesn't see isPlaying→false too early.
      const elapsed = Date.now() - this.playStartTime + this.pausedPositionMs;
      const durationMs = this.state.durationMs || 0;
      const remaining = durationMs - elapsed;

      if (remaining > 2000) {
        console.log(`[music] ffmpeg burst-processed; delaying queue advance by ${Math.round(remaining / 1000)}s`);
        this.playbackEndTimer = setTimeout(() => {
          this.playbackEndTimer = null;
          if (this.state.isPlaying) {
            this.advanceQueue();
          }
        }, remaining);
      } else {
        this.advanceQueue();
      }
    });
  }

  private handlePlaybackError(message: string) {
    this.stopPositionTimer();
    this.state.isPlaying = false;
    this.state.currentTrack = null;
    this.state.positionMs = 0;
    this.state.error = message;
    this.emit('stateChange', this.state);
  }

  // ── queue management ──────────────────────────────────────────────────────

  private advanceQueue() {
    const next = this.state.queue.shift();
    if (next) {
      console.log(`[music] Advancing queue → "${next.title}"`);
      this.playTrack(next.url, next.requestedBy).catch((err) => {
        console.error('[music] Queue advance error:', err.message);
        this.handlePlaybackError(`Could not play next track: ${err.message}`);
      });
    } else {
      console.log(`[music] Queue exhausted for channel ${this.channelId}`);
      this.state.isPlaying = false;
      this.state.currentTrack = null;
      this.state.positionMs = 0;
      this.stopPositionTimer();
      this.emit('stateChange', this.state);
    }
  }

  // ── public API ────────────────────────────────────────────────────────────

  async join(): Promise<void> {
    console.log(`[music] Bot joined channel ${this.channelId}`);
    this.state.botConnected = true;
    this.state.error = undefined;
    this.emit('stateChange', this.state);
  }

  async leave(): Promise<void> {
    console.log(`[music] Bot leaving channel ${this.channelId}`);
    this.stopStream();
    this.stopPositionTimer();
    this.state = {
      channelId: this.channelId,
      isPlaying: false,
      currentTrack: null,
      positionMs: 0,
      durationMs: 0,
      queue: [],
      botConnected: false,
    };
    this.currentScUrl = null;
    this.emit('stateChange', this.state);
  }

  async playTrack(input: string, requestedBy: string): Promise<Track> {
    this.stopStream();
    this.stopPositionTimer();

    console.log(`[music] Resolving: ${input}`);
    const { track: meta, scUrl } = await resolveTrack(input);
    this.currentScUrl = scUrl;

    const track: Track = { ...meta, requestedBy };

    console.log(`[music] Playing "${track.title}" (${track.durationMs / 1000}s) via SoundCloud in channel ${this.channelId}`);

    this.state.currentTrack = track;
    this.state.isPlaying = true;
    this.state.positionMs = 0;
    this.state.durationMs = track.durationMs;
    this.state.error = undefined;
    this.pausedPositionMs = 0;
    this.playStartTime = Date.now();

    this.emit('stateChange', this.state);

    this.startFfmpeg(scUrl, 0).catch((err) => {
      console.error('[music] startFfmpeg error:', err.message);
      this.handlePlaybackError(`Could not start playback: ${err.message}`);
    });

    this.startPositionTimer();
    return track;
  }

  pause(): void {
    if (!this.state.isPlaying) return;
    console.log(`[music] Pausing channel ${this.channelId}`);
    this.pausedPositionMs = this.state.positionMs;
    this.state.isPlaying = false;
    this.stopPositionTimer();
    this.stopStream();
    this.emit('stateChange', this.state);
  }

  async resume(): Promise<void> {
    if (this.state.isPlaying || !this.state.currentTrack || !this.currentScUrl) return;
    console.log(`[music] Resuming channel ${this.channelId} from ${this.pausedPositionMs}ms`);
    const seekSecs = this.pausedPositionMs / 1000;
    this.state.isPlaying = true;
    this.state.error = undefined;
    this.playStartTime = Date.now();
    this.emit('stateChange', this.state);
    this.startFfmpeg(this.currentScUrl, seekSecs).catch((err) => {
      console.error('[music] resume error:', err.message);
      this.handlePlaybackError(`Could not resume: ${err.message}`);
    });
    this.startPositionTimer();
  }

  async applyEffects(effects: MusicEffects): Promise<void> {
    this.effects = { ...effects };
    if (!this.state.isPlaying || !this.currentScUrl) return;
    console.log(`[music] Re-applying effects for channel ${this.channelId}:`, effects);
    const seekSecs = this.state.positionMs / 1000;
    this.stopStream();
    this.playStartTime = Date.now();
    this.pausedPositionMs = this.state.positionMs;
    this.startFfmpeg(this.currentScUrl, seekSecs).catch((err) => {
      console.error('[music] applyEffects restart error:', err.message);
    });
  }

  async skip(): Promise<void> {
    console.log(`[music] Skipping in channel ${this.channelId}`);
    this.stopStream();
    this.stopPositionTimer();
    this.state.isPlaying = false;
    this.state.currentTrack = null;
    this.state.positionMs = 0;
    this.emit('stateChange', this.state);
    this.advanceQueue();
  }

  async stop(): Promise<void> {
    console.log(`[music] Stopping in channel ${this.channelId}`);
    this.stopStream();
    this.stopPositionTimer();
    this.state.queue = [];
    this.state.isPlaying = false;
    this.state.currentTrack = null;
    this.state.positionMs = 0;
    this.currentScUrl = null;
    this.emit('stateChange', this.state);
  }

  enqueue(track: Track, scUrl: string): void {
    console.log(`[music] Queued "${track.title}" in channel ${this.channelId}`);
    this.state.queue.push(track);
    this.emit('stateChange', this.state);
  }

  getState(): MusicState {
    return { ...this.state, queue: [...this.state.queue] };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Singleton manager
// ──────────────────────────────────────────────────────────────────────────────
class MusicBotManager {
  private channels = new Map<string, ChannelMusic>();

  private getOrCreate(channelId: string): ChannelMusic {
    if (!this.channels.has(channelId)) {
      this.channels.set(channelId, new ChannelMusic(channelId));
    }
    return this.channels.get(channelId)!;
  }

  addStreamClient(channelId: string, res: ServerResponse) {
    this.getOrCreate(channelId).addStreamClient(res);
  }

  async join(channelId: string, onStateChange: (s: MusicState) => void): Promise<void> {
    const ch = this.getOrCreate(channelId);
    ch.removeAllListeners('stateChange');
    ch.on('stateChange', onStateChange);
    await ch.join();
  }

  async leave(channelId: string): Promise<void> {
    const ch = this.channels.get(channelId);
    if (ch) {
      await ch.leave();
      ch.removeAllListeners();
      this.channels.delete(channelId);
    }
  }

  async play(channelId: string, input: string, requestedBy: string): Promise<Track> {
    const ch = this.getOrCreate(channelId);
    if (ch.state.isPlaying && ch.state.currentTrack) {
      console.log(`[music] Resolving queued track for channel ${channelId}`);
      const { track: meta, scUrl } = await resolveTrack(input);
      const track: Track = { ...meta, requestedBy };
      ch.enqueue(track, scUrl);
      return track;
    }
    return ch.playTrack(input, requestedBy);
  }

  pause(channelId: string): void {
    this.channels.get(channelId)?.pause();
  }

  async resume(channelId: string): Promise<void> {
    await this.channels.get(channelId)?.resume();
  }

  async skip(channelId: string): Promise<void> {
    await this.channels.get(channelId)?.skip();
  }

  async stop(channelId: string): Promise<void> {
    await this.channels.get(channelId)?.stop();
  }

  async applyEffects(channelId: string, effects: MusicEffects): Promise<void> {
    await this.channels.get(channelId)?.applyEffects(effects);
  }

  getEffects(channelId: string): MusicEffects {
    return this.channels.get(channelId)?.effects ?? { bassBoost: false, nightcore: false, normalize: false };
  }

  getState(channelId: string): MusicState {
    return this.channels.get(channelId)?.getState() ?? {
      channelId,
      isPlaying: false,
      currentTrack: null,
      positionMs: 0,
      durationMs: 0,
      queue: [],
      botConnected: false,
    };
  }
}

export const musicBot = new MusicBotManager();
