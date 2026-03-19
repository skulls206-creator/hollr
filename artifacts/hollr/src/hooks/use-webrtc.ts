import { useEffect, useRef, useState, useCallback } from 'react';
import { sendVoiceSignal, setVoiceSignalListener, setNewPeerHandler } from './use-realtime';
import { useAuth } from '@workspace/replit-auth-web';
import { useAppStore } from '@/store/use-app-store';
import { useGetMyProfile } from '@workspace/api-client-react';

const SPEAKING_THRESHOLD = 18;
const SPEAKING_DEBOUNCE_MS = 600;

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function useWebRTC(channelId: string | null) {
  const { user } = useAuth();
  const { micMuted, deafened } = useAppStore();
  const { data: profile } = useGetMyProfile({ query: { enabled: !!user } });

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [remoteVideoStreams, setRemoteVideoStreams] = useState<Record<string, MediaStream>>({});
  const [volumes, setVolumes] = useState<Record<string, number>>({});

  const peersRef = useRef<Record<string, RTCPeerConnection>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodesRef = useRef<Record<string, GainNode>>({});

  const analyserRef = useRef<AnalyserNode | null>(null);
  const speakingRef = useRef(false);
  const speakingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const channelIdRef = useRef(channelId);
  channelIdRef.current = channelId;

  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;

  const getDisplayInfo = () => {
    const firstName = user?.firstName ?? '';
    const lastName = user?.lastName ?? '';
    const displayName = profile?.displayName
      || (user as any)?.displayName
      || [firstName, lastName].filter(Boolean).join(' ')
      || (user as any)?.username
      || 'User';
    const username = displayName.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 32) || 'user';
    const avatarUrl = profile?.avatarUrl ?? user?.profileImageUrl ?? null;
    return { displayName, username, avatarUrl };
  };

  const stopSpeakingDetection = () => {
    if (speakingIntervalRef.current) { clearInterval(speakingIntervalRef.current); speakingIntervalRef.current = null; }
    if (speakingTimerRef.current) { clearTimeout(speakingTimerRef.current); speakingTimerRef.current = null; }
    speakingRef.current = false;
  };

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

  // Create or replace a peer connection to a given remote user
  const createPeer = useCallback((peerId: string): RTCPeerConnection => {
    if (peersRef.current[peerId]) {
      peersRef.current[peerId].close();
    }

    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add local audio tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        peer.addTrack(track, localStreamRef.current!);
      });
    }

    peer.onicecandidate = (e) => {
      if (e.candidate) {
        sendVoiceSignal({
          type: 'ice_candidate',
          channelId: channelIdRef.current,
          userId: userIdRef.current,
          targetId: peerId,
          candidate: e.candidate,
        });
      }
    };

    peer.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      if (e.track.kind === 'audio') {
        setRemoteStreams(prev => ({ ...prev, [peerId]: stream }));
      } else if (e.track.kind === 'video') {
        setRemoteVideoStreams(prev => ({ ...prev, [peerId]: stream }));
        e.track.onended = () => {
          setRemoteVideoStreams(prev => { const n = { ...prev }; delete n[peerId]; return n; });
        };
      }
    };

    peer.onnegotiationneeded = async () => {
      try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        sendVoiceSignal({
          type: 'offer',
          channelId: channelIdRef.current,
          userId: userIdRef.current,
          targetId: peerId,
          sdp: offer,
        });
      } catch (err) {
        console.error('[WebRTC] onnegotiationneeded failed:', err);
      }
    };

    peersRef.current[peerId] = peer;
    return peer;
  }, []);

  // Handle incoming WebRTC signals
  useEffect(() => {
    const handleSignal = async (payload: any) => {
      const { type: vtype, userId: fromId, targetId, sdp, candidate } = payload;
      if (targetId && targetId !== userIdRef.current) return;
      if (fromId === userIdRef.current) return;

      try {
        if (vtype === 'offer') {
          let peer = peersRef.current[fromId];
          if (!peer || peer.signalingState === 'closed') peer = createPeer(fromId);
          await peer.setRemoteDescription(new RTCSessionDescription(sdp));
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          sendVoiceSignal({
            type: 'answer',
            channelId: channelIdRef.current,
            userId: userIdRef.current,
            targetId: fromId,
            sdp: answer,
          });
        }

        if (vtype === 'answer') {
          const peer = peersRef.current[fromId];
          if (peer && peer.signalingState !== 'stable') {
            await peer.setRemoteDescription(new RTCSessionDescription(sdp));
          }
        }

        if (vtype === 'ice_candidate') {
          const peer = peersRef.current[fromId];
          if (peer && candidate) {
            await peer.addIceCandidate(new RTCIceCandidate(candidate));
          }
        }
      } catch (err) {
        console.error('[WebRTC] Signal handling error:', err);
      }
    };

    setVoiceSignalListener(handleSignal);
    return () => setVoiceSignalListener(null);
  }, [createPeer]);

  // Register new peer handler — called when an existing or new participant appears
  useEffect(() => {
    setNewPeerHandler((peerId: string) => {
      if (!channelIdRef.current) return;
      // createPeer triggers onnegotiationneeded which sends the offer
      createPeer(peerId);
    });
    return () => setNewPeerHandler(null);
  }, [createPeer]);

  // Main effect: join/leave channel, init media
  useEffect(() => {
    if (!channelId) {
      const uid = userIdRef.current;
      if (uid) sendVoiceSignal({ type: 'leave', channelId: channelIdRef.current, userId: uid });

      Object.values(peersRef.current).forEach(p => p.close());
      peersRef.current = {};

      setLocalStream(prev => { prev?.getTracks().forEach(t => t.stop()); localStreamRef.current = null; return null; });
      setScreenStream(prev => { prev?.getTracks().forEach(t => t.stop()); return null; });
      setRemoteStreams({});
      setRemoteVideoStreams({});

      stopSpeakingDetection();
      analyserRef.current = null;
      audioContextRef.current?.close();
      audioContextRef.current = null;
      return;
    }

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
        stream.getAudioTracks().forEach(t => { t.enabled = !micMuted; });
        setLocalStream(stream);
        localStreamRef.current = stream;

        if (ctx.state === 'suspended') await ctx.resume();
        startSpeakingDetection(stream, ctx);

        const { displayName, username, avatarUrl } = getDisplayInfo();
        sendVoiceSignal({ type: 'join', channelId, userId: user?.id, displayName, username, avatarUrl });
      } catch (err) {
        console.error('[WebRTC] Failed to access microphone:', err);
        const { displayName, username, avatarUrl } = getDisplayInfo();
        sendVoiceSignal({ type: 'join', channelId, userId: user?.id, displayName, username, avatarUrl });
      }
    };

    initLocalMedia();
    return () => { stopSpeakingDetection(); };
  }, [channelId]);

  // Connect remote streams through GainNodes
  useEffect(() => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;
    Object.entries(remoteStreams).forEach(([peerId, stream]) => {
      if (!gainNodesRef.current[peerId] && stream.getAudioTracks().length > 0) {
        const source = ctx.createMediaStreamSource(stream);
        const gainNode = ctx.createGain();
        gainNode.gain.value = deafened ? 0 : (volumes[peerId] !== undefined ? volumes[peerId] : 1.0);
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

  // Sync micMuted
  useEffect(() => {
    if (!localStream) return;
    localStream.getAudioTracks().forEach(t => { t.enabled = !micMuted; });
    if (channelIdRef.current && userIdRef.current) {
      sendVoiceSignal({ type: 'mute_update', channelId: channelIdRef.current, userId: userIdRef.current, muted: micMuted });
    }
  }, [micMuted, localStream]);

  // Sync deafened
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

      // Add tracks to all existing peers for renegotiation
      stream.getTracks().forEach(track => {
        Object.values(peersRef.current).forEach(peer => {
          peer.addTrack(track, stream);
        });
        track.onended = () => stopScreenShare();
      });

      // Signal to everyone that we started sharing
      if (channelIdRef.current && userIdRef.current) {
        sendVoiceSignal({ type: 'screen_share_start', channelId: channelIdRef.current, userId: userIdRef.current });
      }
    } catch (err) {
      console.error('[WebRTC] Failed to share screen:', err);
    }
  };

  const stopScreenShare = () => {
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
      setScreenStream(null);
      if (channelIdRef.current && userIdRef.current) {
        sendVoiceSignal({ type: 'screen_share_stop', channelId: channelIdRef.current, userId: userIdRef.current });
      }
    }
  };

  return {
    localStream,
    screenStream,
    remoteStreams,
    remoteVideoStreams,
    volumes,
    setParticipantVolume,
    startScreenShare,
    stopScreenShare,
  };
}
