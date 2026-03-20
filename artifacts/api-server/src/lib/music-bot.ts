import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { ServerResponse } from 'http';
import playdl from 'play-dl';
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
    const t = info as playdl.SoundCloudTrack;
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

  // ── YouTube URL ────────────────────────────────────────────────────────────
  if (isYouTubeUrl(input)) {
    // Try to get the video title so we can suggest a useful search query
    let songHint = '';
    try {
      const ytInfo = await playdl.video_info(input);
      const rawTitle = ytInfo.video_details.title ?? '';
      const cleanTitle = cleanYouTubeTitle(rawTitle);
      const dashIdx = cleanTitle.indexOf(' - ');
      songHint = dashIdx > 0 ? cleanTitle.slice(dashIdx + 3).trim() : cleanTitle;
    } catch { /* ignore */ }

    const suggestion = songHint
      ? `Try: /play ${songHint}`
      : 'Try searching by song name: /play <song name>';

    throw new Error(
      `YouTube links can't be streamed from this server. ` +
      `${suggestion}, or paste a SoundCloud link (soundcloud.com).`
    );
  }

  // ── Search query ───────────────────────────────────────────────────────────
  const results = await playdl.search(input, { source: { soundcloud: 'tracks' }, limit: 5 });
  if (results.length === 0) {
    throw new Error(`No results found for "${input}" on SoundCloud`);
  }
  const t = results[0] as playdl.SoundCloudTrack;
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
class ChannelMusic extends EventEmitter {
  readonly channelId: string;
  state: MusicState;

  private streamClients = new Set<ServerResponse>();
  private ffmpegProc: ChildProcess | null = null;
  private playStartTime: number = 0;
  private pausedPositionMs: number = 0;
  private positionTimer: ReturnType<typeof setInterval> | null = null;
  private currentScUrl: string | null = null;

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
      } else if (this.state.isPlaying) {
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
