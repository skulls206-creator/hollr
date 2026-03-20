import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { ServerResponse } from 'http';
import ytdl from '@distube/ytdl-core';
import type { Track, MusicState } from '@workspace/api-zod';

export const BOT_USER_ID = 'hollr-music-bot';
export const BOT_DISPLAY_NAME = 'Music Bot';
export const BOT_USERNAME = 'music-bot';

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Pick the best audio-only format from a format list.
 *  Avoids `ytdl.chooseFormat` quality strings that can throw when decipher
 *  function is unparseable; instead sorts by bitrate manually. */
function pickAudioFormat(formats: ytdl.videoFormat[]): ytdl.videoFormat {
  const audio = formats
    .filter(f => f.hasAudio && !f.hasVideo && f.url)
    .sort((a, b) => (b.audioBitrate ?? 0) - (a.audioBitrate ?? 0));
  if (audio.length === 0) {
    // Fall back to any format that has audio (including muxed)
    const any = formats.filter(f => f.hasAudio && f.url)
      .sort((a, b) => (b.audioBitrate ?? 0) - (a.audioBitrate ?? 0));
    if (any.length === 0) throw new Error('No playable audio format found for this video');
    return any[0];
  }
  return audio[0];
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
  private currentInfo: Awaited<ReturnType<typeof ytdl.getInfo>> | null = null;
  private currentUrl: string | null = null;

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
    }, 5000); // Broadcast position every 5 seconds instead of every second (reduces WS noise)
  }

  private stopPositionTimer() {
    if (this.positionTimer) {
      clearInterval(this.positionTimer);
      this.positionTimer = null;
    }
  }

  // ── ffmpeg ────────────────────────────────────────────────────────────────

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

  private async startFfmpeg(seekSecs: number = 0): Promise<void> {
    if (!this.currentInfo || !this.currentUrl) {
      throw new Error('No track loaded');
    }

    // Re-fetch info to get fresh URLs if the cached info is stale
    let info = this.currentInfo;
    try {
      info = await ytdl.getInfo(this.currentUrl);
      this.currentInfo = info;
    } catch (refreshErr) {
      console.warn('[music] Could not refresh track info, using cached:', (refreshErr as Error).message);
    }

    const audioFormat = pickAudioFormat(info.formats);
    console.log(`[music] Selected format: ${audioFormat.mimeType} ${audioFormat.audioBitrate}kbps`);

    const ytStream = ytdl.downloadFromInfo(info, { format: audioFormat });

    const ffmpegArgs = [
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

    // Pipe stderr for debugging
    let stderrBuf = '';
    proc.stderr!.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString();
      const lines = stderrBuf.split('\n');
      stderrBuf = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) console.log(`[ffmpeg] ${line}`);
      }
    });

    ytStream.on('error', (err) => {
      console.error('[music] ytdl stream error:', err.message);
      try { proc.stdin?.destroy(); } catch { /* ignore */ }
    });

    ytStream.pipe(proc.stdin!);

    proc.stdout!.on('data', (chunk: Buffer) => {
      this.broadcastAudio(chunk);
    });

    proc.on('error', (err) => {
      console.error('[music] ffmpeg spawn error:', err.message);
      this.handlePlaybackError(`ffmpeg error: ${err.message}`);
    });

    proc.on('close', (code) => {
      if (proc !== this.ffmpegProc) return; // stale process
      this.ffmpegProc = null;
      console.log(`[music] ffmpeg exited with code ${code} for channel ${this.channelId}`);

      if (code !== 0) {
        console.error(`[music] ffmpeg failed (code ${code}) — stopping playback`);
        this.handlePlaybackError('Playback failed (ffmpeg error)');
      } else if (this.state.isPlaying) {
        // Track finished normally — advance queue
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
    this.currentInfo = null;
    this.currentUrl = null;
    this.emit('stateChange', this.state);
  }

  async playTrack(url: string, requestedBy: string): Promise<Track> {
    this.stopStream();
    this.stopPositionTimer();

    console.log(`[music] Fetching info for: ${url}`);
    const info = await ytdl.getInfo(url);
    this.currentInfo = info;
    this.currentUrl = url;

    const durationSec = parseInt(info.videoDetails.lengthSeconds, 10);
    const track: Track = {
      url,
      title: info.videoDetails.title,
      durationMs: isNaN(durationSec) ? 0 : durationSec * 1000,
      requestedBy,
      thumbnail: info.videoDetails.thumbnails?.[0]?.url ?? null,
    };

    console.log(`[music] Playing "${track.title}" (${track.durationMs / 1000}s) in channel ${this.channelId}`);

    this.state.currentTrack = track;
    this.state.isPlaying = true;
    this.state.positionMs = 0;
    this.state.durationMs = track.durationMs;
    this.state.error = undefined;
    this.pausedPositionMs = 0;
    this.playStartTime = Date.now();

    // Emit state BEFORE starting ffmpeg so UI updates immediately
    this.emit('stateChange', this.state);

    // Start ffmpeg — don't throw here; handle errors in proc event handlers
    this.startFfmpeg(0).catch((err) => {
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
    if (this.state.isPlaying || !this.state.currentTrack || !this.currentUrl) return;
    console.log(`[music] Resuming channel ${this.channelId} from ${this.pausedPositionMs}ms`);
    const seekSecs = this.pausedPositionMs / 1000;
    this.state.isPlaying = true;
    this.state.error = undefined;
    this.playStartTime = Date.now();
    this.emit('stateChange', this.state);
    this.startFfmpeg(seekSecs).catch((err) => {
      console.error('[music] resume ffmpeg error:', err.message);
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
    this.currentInfo = null;
    this.currentUrl = null;
    this.emit('stateChange', this.state);
  }

  enqueue(track: Track): void {
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

  async play(channelId: string, url: string, requestedBy: string): Promise<Track> {
    const ch = this.getOrCreate(channelId);
    // If something is already playing, queue it
    if (ch.state.isPlaying && ch.state.currentTrack) {
      console.log(`[music] Queueing track for channel ${channelId}`);
      const info = await ytdl.getInfo(url);
      const durationSec = parseInt(info.videoDetails.lengthSeconds, 10);
      const track: Track = {
        url,
        title: info.videoDetails.title,
        durationMs: isNaN(durationSec) ? 0 : durationSec * 1000,
        requestedBy,
        thumbnail: info.videoDetails.thumbnails?.[0]?.url ?? null,
      };
      ch.enqueue(track);
      return track;
    }
    return ch.playTrack(url, requestedBy);
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
