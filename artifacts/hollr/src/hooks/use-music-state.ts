import { useEffect, useRef, useState, useCallback } from 'react';
import { setMusicStateListener } from './use-realtime';
import type { MusicState } from '@workspace/api-zod';

const BASE = import.meta.env.BASE_URL;

const DEFAULT_STATE: MusicState = {
  channelId: '',
  isPlaying: false,
  currentTrack: null,
  positionMs: 0,
  durationMs: 0,
  queue: [],
  botConnected: false,
};

export function useMusicState(voiceChannelId: string | null) {
  const [musicState, setMusicState] = useState<MusicState>(DEFAULT_STATE);
  const [musicVolume, setMusicVolume] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const srcNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

  // Create the audio element once
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.preload = 'none';
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, []);

  // Subscribe to music state WS updates
  useEffect(() => {
    setMusicStateListener((payload: MusicState) => {
      if (!voiceChannelId || payload.channelId !== voiceChannelId) return;
      setMusicState(payload);
    });
    return () => setMusicStateListener(null);
  }, [voiceChannelId]);

  // Manage audio element when isPlaying / currentTrack changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !voiceChannelId) return;

    if (musicState.isPlaying && musicState.currentTrack) {
      // Reconnect to streaming endpoint (cache-bust so browser opens fresh connection)
      const newSrc = `${BASE}api/voice/${voiceChannelId}/music/stream?t=${Date.now()}`;
      if (audio.src !== newSrc) {
        audio.src = newSrc;
      }
      // Init Web Audio graph on first play (requires user gesture to have happened)
      if (!ctxRef.current) {
        try {
          const ctx = new AudioContext();
          ctxRef.current = ctx;
          const gain = ctx.createGain();
          gainRef.current = gain;
          gain.gain.value = musicVolume / 100;
          const srcNode = ctx.createMediaElementSource(audio);
          srcNodeRef.current = srcNode;
          srcNode.connect(gain);
          gain.connect(ctx.destination);
        } catch { /* AudioContext may not be available yet */ }
      }
      if (ctxRef.current?.state === 'suspended') {
        ctxRef.current.resume().catch(() => {});
      }
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [musicState.isPlaying, musicState.currentTrack?.url, voiceChannelId]);

  // Volume changes
  useEffect(() => {
    if (gainRef.current) {
      gainRef.current.gain.value = musicVolume / 100;
    }
  }, [musicVolume]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  // ── HTTP control functions ─────────────────────────────────────────────────

  const api = useCallback(async (path: string, method = 'POST', body?: object) => {
    if (!voiceChannelId) return;
    setError(null);
    try {
      const res = await fetch(`${BASE}api/voice/${voiceChannelId}/music/${path}`, {
        method,
        credentials: 'include',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? 'Request failed');
      return data;
    } catch {
      setError('Network error');
    }
  }, [voiceChannelId]);

  const join = useCallback(() => api('join'), [api]);
  const leave = useCallback(() => api('leave'), [api]);
  const pause = useCallback(() => api('pause'), [api]);
  const resume = useCallback(() => api('resume'), [api]);
  const skip = useCallback(() => api('skip'), [api]);
  const stop = useCallback(() => api('stop'), [api]);

  const play = useCallback(async (url: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api('play', 'POST', { url });
      if (data?.error) setError(data.error);
    } finally {
      setLoading(false);
    }
  }, [api]);

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
