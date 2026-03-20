import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { ServerResponse } from 'http';
import ytdl from '@distube/ytdl-core';
import type { Track, MusicState } from '@workspace/api-zod';

const BOT_USER_ID = 'hollr-music-bot';
const BOT_DISPLAY_NAME = 'Music Bot';
const BOT_USERNAME = 'music-bot';

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

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
    });
    this.streamClients.add(res);
    res.on('close', () => this.streamClients.delete(res));
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
    }, 1000);
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
      this.ffmpegProc.removeAllListeners();
      try { this.ffmpegProc.stdin?.destroy(); } catch { /* ignore */ }
      try { this.ffmpegProc.kill('SIGKILL'); } catch { /* ignore */ }
      this.ffmpegProc = null;
    }
    this.closeStreamClients();
  }

  private async startFfmpeg(seekSecs: number = 0) {
    if (!this.currentInfo) return;

    const audioFormat = ytdl.chooseFormat(this.currentInfo.formats, {
      filter: 'audioonly',
      quality: 'highestaudio',
    });

    const ytStream = ytdl.downloadFromInfo(this.currentInfo, { format: audioFormat });

    const ffmpegArgs = [
      '-i', 'pipe:0',
      ...(seekSecs > 0 ? ['-ss', String(seekSecs.toFixed(3))] : []),
      '-vn',
      '-c:a', 'libmp3lame',
      '-b:a', '128k',
      '-f', 'mp3',
      'pipe:1',
    ];

    const proc = spawn(FFMPEG, ffmpegArgs, { stdio: ['pipe', 'pipe', 'ignore'] });
    this.ffmpegProc = proc;

    ytStream.on('error', () => { try { proc.stdin?.destroy(); } catch { /* ignore */ } });
    ytStream.pipe(proc.stdin!);

    proc.stdout!.on('data', (chunk: Buffer) => {
      this.broadcastAudio(chunk);
    });

    proc.on('close', (code) => {
      if (proc !== this.ffmpegProc) return; // stale
      this.ffmpegProc = null;
      if (code === 0 && this.state.isPlaying) {
        this.advanceQueue();
      }
    });
  }

  // ── queue management ──────────────────────────────────────────────────────

  private advanceQueue() {
    const next = this.state.queue.shift();
    if (next) {
      this.playTrack(next.url, next.requestedBy).catch(() => {});
    } else {
      this.state.isPlaying = false;
      this.state.currentTrack = null;
      this.state.positionMs = 0;
      this.stopPositionTimer();
      this.emit('stateChange', this.state);
    }
  }

  // ── public API ────────────────────────────────────────────────────────────

  async join(): Promise<void> {
    this.state.botConnected = true;
    this.emit('stateChange', this.state);
  }

  async leave(): Promise<void> {
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
    this.emit('stateChange', this.state);
  }

  async playTrack(url: string, requestedBy: string): Promise<Track> {
    this.stopStream();
    this.stopPositionTimer();

    const info = await ytdl.getInfo(url);
    this.currentInfo = info;

    const durationSec = parseInt(info.videoDetails.lengthSeconds, 10);
    const track: Track = {
      url,
      title: info.videoDetails.title,
      durationMs: isNaN(durationSec) ? 0 : durationSec * 1000,
      requestedBy,
      thumbnail: info.videoDetails.thumbnails?.[0]?.url ?? null,
    };

    this.state.currentTrack = track;
    this.state.isPlaying = true;
    this.state.positionMs = 0;
    this.state.durationMs = track.durationMs;
    this.pausedPositionMs = 0;
    this.playStartTime = Date.now();

    await this.startFfmpeg(0);
    this.startPositionTimer();
    this.emit('stateChange', this.state);
    return track;
  }

  pause(): void {
    if (!this.state.isPlaying) return;
    this.pausedPositionMs = this.state.positionMs;
    this.state.isPlaying = false;
    this.stopPositionTimer();
    this.stopStream();
    this.emit('stateChange', this.state);
  }

  async resume(): Promise<void> {
    if (this.state.isPlaying || !this.state.currentTrack || !this.currentInfo) return;
    const seekSecs = this.pausedPositionMs / 1000;
    this.state.isPlaying = true;
    this.playStartTime = Date.now();
    await this.startFfmpeg(seekSecs);
    this.startPositionTimer();
    this.emit('stateChange', this.state);
  }

  async skip(): Promise<void> {
    this.stopStream();
    this.stopPositionTimer();
    this.state.isPlaying = false;
    this.state.currentTrack = null;
    this.state.positionMs = 0;
    this.emit('stateChange', this.state);
    this.advanceQueue();
  }

  async stop(): Promise<void> {
    this.stopStream();
    this.stopPositionTimer();
    this.state.queue = [];
    this.state.isPlaying = false;
    this.state.currentTrack = null;
    this.state.positionMs = 0;
    this.currentInfo = null;
    this.emit('stateChange', this.state);
  }

  enqueue(track: Track): void {
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

  get(channelId: string): ChannelMusic | undefined {
    return this.channels.get(channelId);
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
    if (ch.state.isPlaying && ch.state.currentTrack) {
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
    if (!ch.state.botConnected) {
      ch.state.botConnected = true;
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
export { BOT_USER_ID, BOT_DISPLAY_NAME, BOT_USERNAME };
