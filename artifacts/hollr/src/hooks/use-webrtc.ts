import { useEffect, useRef, useState, useCallback } from 'react';
import { sendVoiceSignal, setVoiceSignalListener, setNewPeerHandler } from './use-realtime';
import { useAuth } from '@workspace/replit-auth-web';
import { useAppStore } from '@/store/use-app-store';

const SPEAKING_THRESHOLD = 18;
const SPEAKING_DEBOUNCE_MS = 600;

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function useWebRTC(
  channelId: string | null,
  profileData?: { displayName?: string | null; avatarUrl?: string | null },
) {
  const { user } = useAuth();
  const { micMuted, deafened, audioInputDeviceId } = useAppStore();

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [remoteVideoStreams, setRemoteVideoStreams] = useState<Record<string, MediaStream>>({});
  const [connectionTypes, setConnectionTypes] = useState<Record<string, 'lan' | 'stun' | 'relay' | 'connecting'>>({});

  const peersRef = useRef<Record<string, RTCPeerConnection>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  // Per-peer video sender for screen share — used so replaceTrack avoids renegotiation
  const screenVideoSenderRef = useRef<Map<string, RTCRtpSender>>(new Map());

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
    const displayName = profileData?.displayName
      || (user as any)?.displayName
      || [firstName, lastName].filter(Boolean).join(' ')
      || (user as any)?.username
      || 'User';
    const username = displayName.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 32) || 'user';
    const avatarUrl = profileData?.avatarUrl ?? user?.profileImageUrl ?? null;
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

    // Add screen share video track if sharing is already active
    if (screenStreamRef.current) {
      const s = screenStreamRef.current;
      s.getTracks().forEach(track => {
        const sender = peer.addTrack(track, s);
        // Save video sender so we can replaceTrack later without renegotiation
        if (track.kind === 'video') screenVideoSenderRef.current.set(peerId, sender);
      });
    }

    // Add local camera tracks if camera is active
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(track => {
        peer.addTrack(track, cameraStreamRef.current!);
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
      const track = e.track;
      if (track.kind === 'audio') {
        setRemoteStreams(prev => {
          const existing = prev[peerId];
          if (existing) {
            const ids = existing.getAudioTracks().map(t => t.id);
            if (!ids.includes(track.id)) existing.addTrack(track);
            return prev[peerId] === existing ? prev : { ...prev, [peerId]: existing };
          }
          const newStream = e.streams[0] ?? new MediaStream([track]);
          return { ...prev, [peerId]: newStream };
        });
      } else if (track.kind === 'video') {
        const videoStream = e.streams[0] ?? new MediaStream([track]);
        setRemoteVideoStreams(prev => ({ ...prev, [peerId]: videoStream }));
        track.onended = () => {
          setRemoteVideoStreams(prev => { const n = { ...prev }; delete n[peerId]; return n; });
        };
      }
    };

    peer.oniceconnectionstatechange = () => {
      const state = peer.iceConnectionState;
      console.log(`[WebRTC] ICE ${peerId}:`, state);
      if (state === 'failed') {
        console.warn('[WebRTC] ICE failed — restarting ICE for', peerId);
        peer.restartIce();
      }
    };

    peer.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection ${peerId}:`, peer.connectionState);
    };

    peer.onnegotiationneeded = async () => {
      // Only start negotiation from a stable state — browser will re-fire this
      // event once the connection returns to stable, so no explicit retry needed.
      try {
        if (peer.signalingState !== 'stable') return;
        const offer = await peer.createOffer();
        // Re-check after async boundary — another negotiation may have started
        if (peer.signalingState !== 'stable') return;
        await peer.setLocalDescription(offer);
        sendVoiceSignal({
          type: 'offer',
          channelId: channelIdRef.current,
          userId: userIdRef.current,
          targetId: peerId,
          sdp: peer.localDescription,
        });
        console.log(`[WebRTC] Sent renegotiation offer to ${peerId}`);
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
      if (screenStreamRef.current) { screenStreamRef.current.getTracks().forEach(t => t.stop()); screenStreamRef.current = null; }
      setScreenStream(null);
      screenVideoSenderRef.current.clear();
      setCameraStream(prev => { prev?.getTracks().forEach(t => t.stop()); cameraStreamRef.current = null; return null; });
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
        const audioConstraints: MediaTrackConstraints = {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
        };
        if (audioInputDeviceId) audioConstraints.deviceId = { exact: audioInputDeviceId };
        const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
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

  // Sync micMuted
  useEffect(() => {
    if (!localStream) return;
    localStream.getAudioTracks().forEach(t => { t.enabled = !micMuted; });
    if (channelIdRef.current && userIdRef.current) {
      sendVoiceSignal({ type: 'mute_update', channelId: channelIdRef.current, userId: userIdRef.current, muted: micMuted });
    }
  }, [micMuted, localStream]);

  // Sync deafened state to all peers — only when connected
  useEffect(() => {
    if (channelIdRef.current && userIdRef.current && localStream) {
      sendVoiceSignal({ type: 'deafen_update', channelId: channelIdRef.current, userId: userIdRef.current, deafened });
    }
  }, [deafened, localStream]);

  // Poll ICE stats to determine connection path per peer (LAN / STUN / TURN)
  useEffect(() => {
    const poll = async () => {
      const updates: Record<string, 'lan' | 'stun' | 'relay' | 'connecting'> = {};
      for (const [peerId, peer] of Object.entries(peersRef.current)) {
        if (peer.connectionState === 'closed') continue;
        try {
          const stats = await peer.getStats();
          let selectedPairId: string | null = null;
          stats.forEach((r: any) => {
            if (r.type === 'transport' && r.selectedCandidatePairId) {
              selectedPairId = r.selectedCandidatePairId;
            }
          });

          if (!selectedPairId) { updates[peerId] = 'connecting'; continue; }

          let localType: string | null = null;
          let remoteType: string | null = null;
          let pairFound = false;

          stats.forEach((r: any) => {
            if (r.type === 'candidate-pair' && r.id === selectedPairId) {
              pairFound = true;
              stats.forEach((c: any) => {
                if (c.id === r.localCandidateId)  localType  = c.candidateType;
                if (c.id === r.remoteCandidateId) remoteType = c.candidateType;
              });
            }
          });

          if (!pairFound) { updates[peerId] = 'connecting'; continue; }

          if (localType === 'relay' || remoteType === 'relay') {
            updates[peerId] = 'relay';
          } else if (localType === 'host' && remoteType === 'host') {
            updates[peerId] = 'lan';
          } else {
            updates[peerId] = 'stun';
          }
        } catch {
          updates[peerId] = 'connecting';
        }
      }
      if (Object.keys(updates).length > 0) setConnectionTypes(prev => ({ ...prev, ...updates }));
    };

    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  const stopScreenShare = useCallback(() => {
    const stream = screenStreamRef.current;
    if (!stream) return;

    // Stop all tracks
    stream.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    setScreenStream(null);

    // Remove the screen video sender from every peer → renegotiation tells the
    // remote that the video track is gone so ontrack.ended fires correctly
    screenVideoSenderRef.current.forEach((sender, peerId) => {
      const peer = peersRef.current[peerId];
      if (peer && peer.signalingState !== 'closed') {
        try { peer.removeTrack(sender); } catch (e) {
          console.warn('[WebRTC] removeTrack failed for', peerId, e);
        }
      }
    });
    screenVideoSenderRef.current.clear();

    if (channelIdRef.current && userIdRef.current) {
      sendVoiceSignal({ type: 'screen_share_stop', channelId: channelIdRef.current, userId: userIdRef.current });
    }
    console.log('[WebRTC] Screen share stopped');
  }, []);

  const startScreenShare = async (displaySurface?: 'monitor' | 'window' | 'browser') => {
    // Stop any previous share first
    if (screenStreamRef.current) stopScreenShare();

    try {
      const videoConstraints: MediaTrackConstraints & { displaySurface?: string } = {};
      if (displaySurface) videoConstraints.displaySurface = displaySurface;
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: Object.keys(videoConstraints).length ? videoConstraints : true,
        audio: true,
      });

      screenStreamRef.current = stream;
      setScreenStream(stream);

      // Add every track to every peer; track the video sender per peer so
      // stopScreenShare can call removeTrack without needing to scan getSenders().
      stream.getTracks().forEach(track => {
        Object.entries(peersRef.current).forEach(([peerId, peer]) => {
          if (peer.signalingState === 'closed') return;
          const sender = peer.addTrack(track, stream);
          if (track.kind === 'video') screenVideoSenderRef.current.set(peerId, sender);
        });
        track.onended = () => stopScreenShare();
      });

      if (channelIdRef.current && userIdRef.current) {
        sendVoiceSignal({ type: 'screen_share_start', channelId: channelIdRef.current, userId: userIdRef.current });
      }
      console.log('[WebRTC] Screen share started, peers notified');
    } catch (err: any) {
      // User cancelled the picker — not a real error
      if (err?.name !== 'NotAllowedError') {
        console.error('[WebRTC] Failed to share screen:', err);
      }
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      setCameraStream(stream);
      cameraStreamRef.current = stream;

      // Add video tracks to all existing peer connections
      stream.getTracks().forEach(track => {
        Object.values(peersRef.current).forEach(peer => {
          peer.addTrack(track, stream);
        });
        track.onended = () => stopCamera();
      });

      if (channelIdRef.current && userIdRef.current) {
        sendVoiceSignal({ type: 'camera_start', channelId: channelIdRef.current, userId: userIdRef.current });
      }
    } catch (err) {
      console.error('[WebRTC] Failed to start camera:', err);
    }
  };

  const stopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(t => t.stop());
      cameraStreamRef.current = null;
    }
    setCameraStream(null);
    if (channelIdRef.current && userIdRef.current) {
      sendVoiceSignal({ type: 'camera_stop', channelId: channelIdRef.current, userId: userIdRef.current });
    }
  };

  return {
    localStream,
    screenStream,
    cameraStream,
    remoteStreams,
    remoteVideoStreams,
    connectionTypes,
    startScreenShare,
    stopScreenShare,
    startCamera,
    stopCamera,
  };
}
