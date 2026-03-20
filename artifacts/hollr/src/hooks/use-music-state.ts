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

  // Loop mode — client-side only
  const [loopEnabled, setLoopEnabled] = useState(false);
  const loopRef = useRef(false);
  loopRef.current = loopEnabled;

  // Track the last played URL so loop can replay it
  const lastTrackUrlRef = useRef<string | null>(null);

  // Audio element — stable for the lifetime of the hook
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const trackSrcRef = useRef<string | null>(null);

  // Seek offset: the server-side positionMs at the moment the current stream started.
  // audio.currentTime is 0-based within that stream, so true position = offset + currentTime.
  const seekOffsetMsRef = useRef(0);

  // Live position read from the audio element (250 ms interval)
  const [audioPositionMs, setAudioPositionMs] = useState(0);

  // Fetch the current server-side state when mounting
  useEffect(() => {
    if (!voiceChannelId) {
      setMusicState(MUSIC_DEFAULT_STATE);
      return;
    }
    fetch(`${BASE}api/voice/${voiceChannelId}/music/state`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setMusicState(data); })
      .catch(() => {});
  }, [voiceChannelId]);

  // Subscribe to WS MUSIC_STATE_UPDATE events
  useEffect(() => {
    setMusicStateListener((payload: MusicState) => {
      if (!voiceChannelId || payload.channelId !== voiceChannelId) return;
      setMusicState(payload);
    });
    return () => setMusicStateListener(null);
  }, [voiceChannelId]);

  // Create Audio element once
  useEffect(() => {
    if (audioRef.current) return;
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

  // Poll audio.currentTime every 250 ms for a smooth, accurate progress bar
  useEffect(() => {
    const id = setInterval(() => {
      const audio = audioRef.current;
      if (!audio || !musicState.isPlaying) return;
      const pos = Math.round(seekOffsetMsRef.current + audio.currentTime * 1000);
      setAudioPositionMs(Math.min(pos, musicState.durationMs || Infinity));
    }, 250);
    return () => clearInterval(id);
  }, [musicState.isPlaying, musicState.durationMs]);

  // Reset audio position when track changes or stops
  useEffect(() => {
    if (!musicState.isPlaying || !musicState.currentTrack) {
      setAudioPositionMs(musicState.positionMs);
    }
  }, [musicState.isPlaying, musicState.currentTrack, musicState.positionMs]);

  // Connect audio to stream when isPlaying / track changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !voiceChannelId) return;

    if (musicState.isPlaying && musicState.currentTrack) {
      const streamUrl = `${BASE}api/voice/${voiceChannelId}/music/stream`;
      const trackKey = `${voiceChannelId}:${musicState.currentTrack.url}`;

      if (trackSrcRef.current !== trackKey) {
        // Capture seek offset at the moment the stream begins
        seekOffsetMsRef.current = musicState.positionMs;
        trackSrcRef.current = trackKey;
        audio.src = `${streamUrl}?t=${Date.now()}`;
        audio.load();
      }

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
        const onInteraction = () => {
          audio.play().catch(() => {});
          document.removeEventListener('click', onInteraction);
          document.removeEventListener('keydown', onInteraction);
        };
        document.addEventListener('click', onInteraction, { once: true });
        document.addEventListener('keydown', onInteraction, { once: true });
      });
    } else {
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
      audioRef.current.volume = Math.min(musicVolume / 100, 1);
    }
  }, [musicVolume]);

  // Save last track URL whenever a track is playing
  useEffect(() => {
    if (musicState.currentTrack?.url) {
      lastTrackUrlRef.current = musicState.currentTrack.url;
    }
  }, [musicState.currentTrack?.url]);

  // Loop: when track ends (currentTrack→null) and loop is enabled, replay last track
  const prevCurrentTrackRef = useRef(musicState.currentTrack);
  useEffect(() => {
    const prev = prevCurrentTrackRef.current;
    prevCurrentTrackRef.current = musicState.currentTrack;

    if (prev !== null && musicState.currentTrack === null && loopRef.current && lastTrackUrlRef.current) {
      const urlToReplay = lastTrackUrlRef.current;
      console.log('[music-loop] Replaying:', urlToReplay);
      // Slight delay so the state settles before we call play
      setTimeout(() => {
        if (loopRef.current) {
          apiCallRef.current('play', 'POST', { url: urlToReplay }).catch(() => {});
        }
      }, 800);
    }
  }, [musicState.currentTrack]);

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

  // Keep a stable ref so the loop effect can call it without adding to its deps
  const apiCallRef = useRef(apiCall);
  apiCallRef.current = apiCall;

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

  const error = musicState.error ?? localError;

  return {
    musicState,
    audioPositionMs,
    musicVolume,
    setMusicVolume,
    error,
    loading,
    loopEnabled,
    setLoopEnabled,
    join,
    leave,
    play,
    pause,
    resume,
    skip,
    stop,
  };
}
