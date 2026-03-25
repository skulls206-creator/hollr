import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@workspace/replit-auth-web';
import { useAppStore } from '@/store/use-app-store';
import { sendVideoCallSignal, setVideoCallSignalListener } from './use-realtime';
import { startCallRinging, stopCallRinging } from '@/lib/notification-sound';
import { fetchIceServers } from '@/lib/ice-servers';

// ─── Module-level singleton ───────────────────────────────────────────────────
// Lets DmChatArea trigger video calls without mounting the hook itself.
type StartCallFn = (
  targetUserId: string,
  targetDisplayName: string,
  targetAvatarUrl: string | null,
  dmThreadId: string | null,
  callerInfo: { id: string; displayName: string; avatarUrl: string | null },
) => Promise<void>;

let _startCall: StartCallFn | null = null;

export function registerVideoCallStarter(fn: StartCallFn | null) {
  _startCall = fn;
}

export function initiateVideoCall(
  targetUserId: string,
  targetDisplayName: string,
  targetAvatarUrl: string | null,
  dmThreadId: string | null,
  callerInfo: { id: string; displayName: string; avatarUrl: string | null },
) {
  if (_startCall) {
    _startCall(targetUserId, targetDisplayName, targetAvatarUrl, dmThreadId, callerInfo);
  } else {
    console.warn('[VideoCall] initiateVideoCall called before hook registered');
  }
}


const CALL_TIMEOUT_MS = 30_000;

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useVideoCall() {
  const { user } = useAuth();
  const setVideoCallState = useAppStore(s => s.setVideoCallState);
  const endVideoCall = useAppStore(s => s.endVideoCall);

  // Stable ref for user ID — avoids stale closure in callbacks / signal listener
  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerIdRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ICE candidate buffer: candidates that arrive before remoteDescription is set
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSetRef = useRef(false);

  // ── helpers ────────────────────────────────────────────────────────────────

  const stopTimeout = useCallback(() => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  }, []);

  const cleanupMedia = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
    setIsMicMuted(false);
    setIsVideoEnabled(true);
    setFacingMode('user');
  }, []);

  const closePeer = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    pendingIceRef.current = [];
    remoteDescSetRef.current = false;
  }, []);

  const cleanup = useCallback(() => {
    stopTimeout();
    stopCallRinging();
    closePeer();
    cleanupMedia();
    peerIdRef.current = null;
  }, [stopTimeout, closePeer, cleanupMedia]);

  // Apply any buffered ICE candidates after remote desc is set
  const flushPendingIce = useCallback(async (pc: RTCPeerConnection) => {
    const candidates = pendingIceRef.current.splice(0);
    for (const c of candidates) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
  }, []);

  // ── getUserMedia ───────────────────────────────────────────────────────────

  const getLocalStream = useCallback(async (facing: 'user' | 'environment' = 'user') => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  // ── createPeer ─────────────────────────────────────────────────────────────
  // Creates an RTCPeerConnection wired to the current local stream.
  // peerId = the remote user we're connecting to.

  const createPeer = useCallback(async (peerId: string): Promise<RTCPeerConnection> => {
    closePeer();
    peerIdRef.current = peerId;
    remoteDescSetRef.current = false;
    pendingIceRef.current = [];

    const iceServers = await fetchIceServers();
    const pc = new RTCPeerConnection({ iceServers });

    // Add local audio+video tracks to peer
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendVideoCallSignal({ type: 'video_ice', targetId: peerId, candidate: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      setRemoteStream(stream);
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        stopTimeout();
        useAppStore.getState().setVideoCallState({ state: 'connected', startedAt: Date.now() });
      } else if (state === 'failed' || state === 'closed') {
        cleanup();
        useAppStore.getState().endVideoCall();
      }
    };

    pcRef.current = pc;
    return pc;
  }, [closePeer, stopTimeout, cleanup]);

  // ── Public call actions ────────────────────────────────────────────────────

  // Called by DmChatArea (via initiateVideoCall module singleton)
  const startCall = useCallback(async (
    targetUserId: string,
    targetDisplayName: string,
    targetAvatarUrl: string | null,
    dmThreadId: string | null,
    callerInfo: { id: string; displayName: string; avatarUrl: string | null },
  ) => {
    peerIdRef.current = targetUserId;
    await getLocalStream('user');

    setVideoCallState({
      state: 'outgoing_ringing',
      targetUserId,
      targetDisplayName,
      targetAvatarUrl,
      dmThreadId,
      startedAt: null,
    });

    sendVideoCallSignal({
      type: 'video_ring',
      targetId: targetUserId,
      callerId: callerInfo.id,
      callerName: callerInfo.displayName,
      callerAvatar: callerInfo.avatarUrl,
      dmThreadId,
    });

    // Auto-cancel if no answer in 30s
    timeoutRef.current = setTimeout(() => {
      sendVideoCallSignal({ type: 'video_end', targetId: targetUserId });
      cleanup();
      useAppStore.getState().endVideoCall();
    }, CALL_TIMEOUT_MS);
  }, [getLocalStream, setVideoCallState, cleanup]);

  // Called when recipient taps Accept
  const acceptCall = useCallback(async (callerId: string) => {
    stopTimeout();
    stopCallRinging();
    await getLocalStream('user');
    await createPeer(callerId);
    // Send accept; include our own userId so initiator knows who accepted
    sendVideoCallSignal({
      type: 'video_accept',
      targetId: callerId,           // routes to caller (initiator)
      acceptorId: userIdRef.current, // tells initiator WHO accepted
    });
  }, [stopTimeout, getLocalStream, createPeer]);

  const declineCall = useCallback((callerId: string) => {
    stopTimeout();
    stopCallRinging();
    sendVideoCallSignal({ type: 'video_decline', targetId: callerId });
    cleanup();
    useAppStore.getState().endVideoCall();
  }, [stopTimeout, cleanup]);

  const endCall = useCallback(() => {
    const peerId = peerIdRef.current;
    if (peerId) sendVideoCallSignal({ type: 'video_end', targetId: peerId });
    cleanup();
    useAppStore.getState().endVideoCall();
  }, [cleanup]);

  const toggleMic = useCallback(() => {
    if (!localStreamRef.current) return;
    const nextMuted = !isMicMuted;
    localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !nextMuted; });
    setIsMicMuted(nextMuted);
  }, [isMicMuted]);

  const toggleVideo = useCallback(() => {
    if (!localStreamRef.current) return;
    const nextEnabled = !isVideoEnabled;
    localStreamRef.current.getVideoTracks().forEach(t => { t.enabled = nextEnabled; });
    setIsVideoEnabled(nextEnabled);
  }, [isVideoEnabled]);

  const flipCamera = useCallback(async () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    if (!localStreamRef.current) return;
    localStreamRef.current.getVideoTracks().forEach(t => t.stop());
    try {
      const ns = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: next }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      const newVid = ns.getVideoTracks()[0];
      if (!newVid || !localStreamRef.current) return;
      if (pcRef.current) {
        const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(newVid);
      }
      localStreamRef.current.getVideoTracks().forEach(t => localStreamRef.current!.removeTrack(t));
      localStreamRef.current.addTrack(newVid);
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
    } catch (err) {
      console.warn('[VideoCall] flipCamera failed:', err);
    }
  }, [facingMode]);

  // ── Signal listener ────────────────────────────────────────────────────────
  // Registered once per user session; reads live state via refs to avoid stale closures.

  useEffect(() => {
    const userId = userIdRef.current;
    if (!userId) return;

    setVideoCallSignalListener(async (signal) => {
      const {
        type, targetId, acceptorId, sdp, candidate,
        callerId, callerName, callerAvatar, dmThreadId,
      } = signal ?? {};

      // ── Incoming call ring ─────────────────────────────────────────────────
      if (type === 'video_ring') {
        if (callerId === userIdRef.current) return; // ignore self-calls
        useAppStore.getState().setVideoCallState({
          state: 'incoming_ringing',
          targetUserId: callerId,
          targetDisplayName: callerName ?? null,
          targetAvatarUrl: callerAvatar ?? null,
          dmThreadId: dmThreadId ?? null,
        });
        startCallRinging();
        return;
      }

      // ── Recipient accepted — initiator creates and sends offer ─────────────
      // acceptorId is the acceptor's userId (explicitly included so we know who to peer with)
      if (type === 'video_accept') {
        stopTimeout();
        const peerId = acceptorId ?? targetId; // acceptorId is the correct peer
        const pc = await createPeer(peerId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendVideoCallSignal({ type: 'video_offer', targetId: peerId, sdp: offer });
        return;
      }

      // ── Initiator sent offer — acceptor sets descriptions and answers ──────
      if (type === 'video_offer') {
        const pc = pcRef.current;
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        remoteDescSetRef.current = true;
        await flushPendingIce(pc); // apply any buffered ICE candidates
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendVideoCallSignal({ type: 'video_answer', targetId: peerIdRef.current!, sdp: answer });
        // NOTE: state → 'connected' is handled by onconnectionstatechange
        return;
      }

      // ── Acceptor sent answer — initiator sets remote description ──────────
      if (type === 'video_answer') {
        const pc = pcRef.current;
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        remoteDescSetRef.current = true;
        await flushPendingIce(pc); // apply any buffered ICE candidates
        return;
      }

      // ── ICE candidate exchange ─────────────────────────────────────────────
      if (type === 'video_ice') {
        if (!candidate) return;
        const pc = pcRef.current;
        if (pc && remoteDescSetRef.current) {
          try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
        } else {
          // Buffer until setRemoteDescription is called
          pendingIceRef.current.push(candidate);
        }
        return;
      }

      // ── Call declined or ended ─────────────────────────────────────────────
      if (type === 'video_decline' || type === 'video_end') {
        stopCallRinging();
        cleanup();
        useAppStore.getState().endVideoCall();
        return;
      }
    });

    return () => { setVideoCallSignalListener(null); };
  // Re-register when key functions change (all are stable useCallbacks with [] deps)
  }, [user?.id, createPeer, stopTimeout, cleanup, flushPendingIce]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);

  return {
    localStream,
    remoteStream,
    isMicMuted,
    isVideoEnabled,
    facingMode,
    startCall,
    acceptCall,
    declineCall,
    endCall,
    toggleMic,
    toggleVideo,
    flipCamera,
  };
}
