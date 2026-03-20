export interface Track {
  url: string;
  title: string;
  durationMs: number;
  requestedBy: string;
  thumbnail?: string | null;
}

export interface MusicState {
  channelId: string;
  isPlaying: boolean;
  currentTrack: Track | null;
  positionMs: number;
  durationMs: number;
  queue: Track[];
  botConnected: boolean;
  error?: string;
}

export type MusicStateUpdatePayload = MusicState;

export type MusicWsMessage =
  | { type: 'MUSIC_STATE_UPDATE'; payload: MusicStateUpdatePayload };
