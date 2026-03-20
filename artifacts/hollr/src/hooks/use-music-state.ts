import { useEffect, useRef, useState, useCallback } from 'react';
import { setMusicStateListener } from './use-realtime';
import type { MusicState } from '@workspace/api-zod';

const BASE = import.meta.env.BASE_URL;

export const MUSIC_DEFAULT_STATE: MusicState = {
  channelId: '',
  isPlaying: false,
  currentTrack: null,
  positionMs: 0,
  durationMs: 0,
  queue: [],
  botConnected: false,
};

export function useMusicState(voiceChannelId: string | null) {
  const [musicState, setMusicState] = useState<MusicState>(MUSIC_DEFAULT_STATE);
  const [musicVolume, setMusicVolume] = useState(100);
  const [localError, setLocalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const trackSrcRef = useRef<string | null>(null); // tracks which stream URL is loaded

  // Fetch the current server-side state when mounting so we always have up-to-date info
  useEffect(() => {
    if (!voiceChannelId) {
      setMusicState(MUSIC_DEFAULT_STATE);
      return;
    }
    fetch(`${BASE}api/voice/${voiceChannelId}/music/state`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setMusicState(data); })
      .catch(() => {}); // not critical
  }, [voiceChannelId]);

  // Subscribe to WS MUSIC_STATE_UPDATE events
  useEffect(() => {
    setMusicStateListener((payload: MusicState) => {
      if (!voiceChannelId || payload.channelId !== voiceChannelId) return;
      setMusicState(payload);
    });
    return () => setMusicStateListener(null);
  }, [voiceChannelId]);

  // Create Audio element once and keep stable
  useEffect(() => {
    if (audioRef.current) return; // already created
    const audio = new Audio();
    audio.preload = 'none';
    audioRef.current = audio;

    audio.addEventListener('error', (e) => {
      console.warn('[music-audio] element error:', e);
    });
    audio.addEventListener('stalled', () => {
      console.warn('[music-audio] stream stalled');
    });
    audio.addEventListener('waiting', () => {
      console.log('[music-audio] buffering...');
    });
    audio.addEventListener('playing', () => {
      console.log('[music-audio] playing');
    });

    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, []);

  // Connect audio to stream when isPlaying / track changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !voiceChannelId) return;

    if (musicState.isPlaying && musicState.currentTrack) {
      // Build stream URL — use track URL as cache key so we reconnect on new track or resume
      const streamUrl = `${BASE}api/voice/${voiceChannelId}/music/stream`;
      const trackKey = `${voiceChannelId}:${musicState.currentTrack.url}`;

      if (trackSrcRef.current !== trackKey) {
        // New track or new stream needed — attach a fresh URL with timestamp to bust cache
        trackSrcRef.current = trackKey;
        audio.src = `${streamUrl}?t=${Date.now()}`;
        audio.load();
      }

      // Bootstrap Web Audio API for gain control (needs user gesture — safe here since
      // the user just clicked play or issued a command)
      if (!audioCtxRef.current) {
        try {
          const ctx = new AudioContext();
          audioCtxRef.current = ctx;
          const gain = ctx.createGain();
          gainRef.current = gain;
          gain.gain.value = musicVolume / 100;
          const src = ctx.createMediaElementSource(audio);
          src.connect(gain);
          gain.connect(ctx.destination);
        } catch (err) {
          console.warn('[music-audio] AudioContext init failed:', err);
        }
      }

      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }

      audio.play().catch((err) => {
        console.warn('[music-audio] play() rejected:', err.message);
        // On autoplay policy failure, try on next user interaction
        const onInteraction = () => {
          audio.play().catch(() => {});
          document.removeEventListener('click', onInteraction);
          document.removeEventListener('keydown', onInteraction);
        };
        document.addEventListener('click', onInteraction, { once: true });
        document.addEventListener('keydown', onInteraction, { once: true });
      });
    } else {
      // Paused or stopped — pause audio and reset stream key so next play reconnects
      audio.pause();
      if (!musicState.isPlaying) {
        trackSrcRef.current = null;
      }
    }
  }, [musicState.isPlaying, musicState.currentTrack?.url, voiceChannelId]);

  // Volume changes
  useEffect(() => {
    if (gainRef.current) {
      gainRef.current.gain.value = musicVolume / 100;
    } else if (audioRef.current) {
      // Fall back to element volume if Web Audio isn't set up
      audioRef.current.volume = Math.min(musicVolume / 100, 1);
    }
  }, [musicVolume]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  // ── HTTP control helpers ───────────────────────────────────────────────────

  const apiCall = useCallback(async (
    path: string,
    method = 'POST',
    body?: object,
  ): Promise<{ ok: boolean; error?: string; [k: string]: any }> => {
    if (!voiceChannelId) return { ok: false, error: 'Not in a voice channel' };
    setLocalError(null);
    try {
      const res = await fetch(`${BASE}api/voice/${voiceChannelId}/music/${path}`, {
        method,
        credentials: 'include',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error ?? `Request failed (${res.status})`;
        setLocalError(msg);
        return { ok: false, error: msg };
      }
      return { ok: true, ...data };
    } catch {
      const msg = 'Network error — check your connection';
      setLocalError(msg);
      return { ok: false, error: msg };
    }
  }, [voiceChannelId]);

  const join   = useCallback(() => apiCall('join'), [apiCall]);
  const leave  = useCallback(() => apiCall('leave'), [apiCall]);
  const pause  = useCallback(() => apiCall('pause'), [apiCall]);
  const resume = useCallback(() => apiCall('resume'), [apiCall]);
  const skip   = useCallback(() => apiCall('skip'), [apiCall]);
  const stop   = useCallback(() => apiCall('stop'), [apiCall]);

  const play = useCallback(async (url: string) => {
    setLoading(true);
    setLocalError(null);
    const result = await apiCall('play', 'POST', { url });
    if (!result.ok && result.error) setLocalError(result.error);
    setLoading(false);
    return result;
  }, [apiCall]);

  // Merged error: prefer server-side error from state, fallback to local HTTP error
  const error = musicState.error ?? localError;

  return {
    musicState,
    musicVolume,
    setMusicVolume,
    error,
    loading,
    join,
    leave,
    play,
    pause,
    resume,
    skip,
    stop,
  };
}
