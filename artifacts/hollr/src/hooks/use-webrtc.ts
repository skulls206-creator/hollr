import { useEffect, useRef, useState } from 'react';
import { sendVoiceSignal } from './use-realtime';
import { useAuth } from '@workspace/replit-auth-web';
import { useAppStore } from '@/store/use-app-store';

const SPEAKING_THRESHOLD = 18;       // RMS level 0-255
const SPEAKING_DEBOUNCE_MS = 600;    // how long below threshold before stopping

export function useWebRTC(channelId: string | null) {
  const { user } = useAuth();
  const { micMuted, deafened } = useAppStore();

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);

  // participantId -> MediaStream
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  // participantId -> gain value (0 to 2.0)
  const [volumes, setVolumes] = useState<Record<string, number>>({});

  const peersRef = useRef<Record<string, RTCPeerConnection>>({});
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodesRef = useRef<Record<string, GainNode>>({});

  // Speaking detection
  const analyserRef = useRef<AnalyserNode | null>(null);
  const speakingRef = useRef(false);
  const speakingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const channelIdRef = useRef(channelId);
  channelIdRef.current = channelId;

  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;

  // Derive display info from auth user
  const getDisplayInfo = () => {
    const firstName = user?.firstName ?? '';
    const lastName = user?.lastName ?? '';
    const displayName = [firstName, lastName].filter(Boolean).join(' ') || `User`;
    const username = displayName.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 32) || 'user';
    const avatarUrl = user?.profileImageUrl ?? null;
    return { displayName, username, avatarUrl };
  };

  // Stop speaking detection interval
  const stopSpeakingDetection = () => {
    if (speakingIntervalRef.current) {
      clearInterval(speakingIntervalRef.current);
      speakingIntervalRef.current = null;
    }
    if (speakingTimerRef.current) {
      clearTimeout(speakingTimerRef.current);
      speakingTimerRef.current = null;
    }
    speakingRef.current = false;
  };

  // Start speaking detection on localStream
  const startSpeakingDetection = (stream: MediaStream, ctx: AudioContext) => {
    stopSpeakingDetection();
    if (!stream.getAudioTracks().length) return;

    try {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);

      speakingIntervalRef.current = setInterval(() => {
        const chId = channelIdRef.current;
        const uid = userIdRef.current;
        if (!chId || !uid) return;

        analyser.getByteFrequencyData(data);
        const rms = Math.sqrt(data.reduce((acc, v) => acc + v * v, 0) / data.length);

        if (rms > SPEAKING_THRESHOLD) {
          if (!speakingRef.current) {
            speakingRef.current = true;
            sendVoiceSignal({ type: 'speaking_start', channelId: chId, userId: uid });
          }
          // Reset debounce timer
          if (speakingTimerRef.current) clearTimeout(speakingTimerRef.current);
          speakingTimerRef.current = setTimeout(() => {
            if (speakingRef.current) {
              speakingRef.current = false;
              sendVoiceSignal({ type: 'speaking_stop', channelId: chId, userId: uid });
            }
          }, SPEAKING_DEBOUNCE_MS);
        }
      }, 80);
    } catch (err) {
      console.warn('[WebRTC] Speaking detection setup failed:', err);
    }
  };

  useEffect(() => {
    if (!channelId) {
      // Disconnected — send leave signal and clean up
      const uid = userIdRef.current;
      if (uid) {
        // Find channel we were in (we can't know which channel we left here, but
        // the server tracks it by userId on disconnect anyway)
        sendVoiceSignal({ type: 'leave', channelId: channelIdRef.current, userId: uid });
      }

      Object.values(peersRef.current).forEach(p => p.close());
      peersRef.current = {};

      setLocalStream(prev => {
        prev?.getTracks().forEach(t => t.stop());
        return null;
      });
      setScreenStream(prev => {
        prev?.getTracks().forEach(t => t.stop());
        return null;
      });
      setRemoteStreams({});

      stopSpeakingDetection();
      analyserRef.current = null;
      audioContextRef.current?.close();
      audioContextRef.current = null;
      return;
    }

    // Initialize AudioContext
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    const ctx = audioContextRef.current;

    const initLocalMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
          video: false,
        });

        setLocalStream(stream);

        // Resume AudioContext if it was suspended (browser autoplay policy)
        if (ctx.state === 'suspended') await ctx.resume();

        // Start speaking detection
        startSpeakingDetection(stream, ctx);

        // Send join signal with user profile info
        const { displayName, username, avatarUrl } = getDisplayInfo();
        sendVoiceSignal({
          type: 'join',
          channelId,
          userId: user?.id,
          displayName,
          username,
          avatarUrl,
        });
      } catch (err) {
        console.error('[WebRTC] Failed to access microphone:', err);
        // Still send join so we appear in the user list (muted)
        const { displayName, username, avatarUrl } = getDisplayInfo();
        sendVoiceSignal({
          type: 'join',
          channelId,
          userId: user?.id,
          displayName,
          username,
          avatarUrl,
        });
      }
    };

    initLocalMedia();

    return () => {
      stopSpeakingDetection();
    };
  }, [channelId]);

  // Handle incoming streams and connect them through GainNodes
  useEffect(() => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;

    Object.entries(remoteStreams).forEach(([peerId, stream]) => {
      if (!gainNodesRef.current[peerId] && stream.getAudioTracks().length > 0) {
        const source = ctx.createMediaStreamSource(stream);
        const gainNode = ctx.createGain();
        gainNode.gain.value = volumes[peerId] !== undefined ? volumes[peerId] : 1.0;
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        gainNodesRef.current[peerId] = gainNode;
      }
    });
  }, [remoteStreams]);

  const setParticipantVolume = (participantId: string, volume: number) => {
    setVolumes(prev => ({ ...prev, [participantId]: volume }));
    if (gainNodesRef.current[participantId]) {
      gainNodesRef.current[participantId].gain.value = volume;
    }
  };

  // Sync store micMuted → localStream track.enabled + broadcast mute_update
  useEffect(() => {
    if (!localStream) return;
    localStream.getAudioTracks().forEach(track => {
      track.enabled = !micMuted;
    });
    if (channelIdRef.current && userIdRef.current) {
      sendVoiceSignal({
        type: 'mute_update',
        channelId: channelIdRef.current,
        userId: userIdRef.current,
        muted: micMuted,
      });
    }
  }, [micMuted, localStream]);

  // Sync store deafened → all remote gain nodes
  useEffect(() => {
    Object.entries(gainNodesRef.current).forEach(([peerId, gainNode]) => {
      gainNode.gain.value = deafened ? 0 : (volumes[peerId] !== undefined ? volumes[peerId] : 1.0);
    });
  }, [deafened]);

  const startScreenShare = async (displaySurface?: 'monitor' | 'window' | 'browser') => {
    try {
      const videoConstraints: MediaTrackConstraints & { displaySurface?: string } = {};
      if (displaySurface) videoConstraints.displaySurface = displaySurface;
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: Object.keys(videoConstraints).length ? videoConstraints : true,
        audio: true,
      });
      setScreenStream(stream);
      stream.getTracks().forEach(track => {
        Object.values(peersRef.current).forEach(peer => {
          peer.addTrack(track, stream);
        });
        track.onended = () => stopScreenShare();
      });
    } catch (err) {
      console.error('[WebRTC] Failed to share screen:', err);
    }
  };

  const stopScreenShare = () => {
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
      setScreenStream(null);
    }
  };

  return {
    localStream,
    screenStream,
    remoteStreams,
    volumes,
    setParticipantVolume,
    startScreenShare,
    stopScreenShare,
  };
}
