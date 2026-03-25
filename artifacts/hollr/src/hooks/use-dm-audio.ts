import { useRef, useCallback, useEffect } from 'react';
import { useAppStore } from '@/store/use-app-store';
import { setDmCallRtcSignalListener, sendDmCallSignal } from './use-realtime';
import { fetchIceServers } from '@/lib/ice-servers';
import { toast } from '@/hooks/use-toast';

export function useDmCallAudio() {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSetRef = useRef(false);
  const peerIdRef = useRef<string | null>(null);

  const cleanupAudio = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current = null;
    }
    pendingIceRef.current = [];
    remoteDescSetRef.current = false;
    peerIdRef.current = null;
  }, []);

  const createPeer = useCallback(async (peerId: string) => {
    peerIdRef.current = peerId;
    pcRef.current?.close();
    remoteDescSetRef.current = false;
    pendingIceRef.current = [];

    const iceServers = await fetchIceServers();
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;

    // Pre-create the audio element so it's tied to this user gesture stack
    // (avoids autoplay policy blocks when ontrack fires asynchronously)
    if (!remoteAudioRef.current) {
      const audio = new Audio();
      audio.autoplay = true;
      remoteAudioRef.current = audio;
    }

    // Get local audio
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      stream.getAudioTracks().forEach(t => pc.addTrack(t, stream));
    } catch (err) {
      console.error('[DM call] Microphone error:', err);
      toast({ title: 'Microphone unavailable', description: 'Could not access your microphone.', variant: 'destructive' });
    }

    // Play remote audio
    pc.ontrack = (e) => {
      const audio = remoteAudioRef.current!;
      const incomingStream = e.streams[0];
      if (incomingStream) {
        audio.srcObject = incomingStream;
      } else {
        // Fallback: wrap the single track in a MediaStream
        const ms = new MediaStream([e.track]);
        audio.srcObject = ms;
      }
      audio.play().catch((err) => {
        console.warn('[DM call] Remote audio play() blocked:', err);
        // Retry once after a short delay — handles autoplay policy
        setTimeout(() => audio.play().catch(console.warn), 500);
      });
    };

    // Log ICE/connection state transitions for debugging
    pc.oniceconnectionstatechange = () => {
      console.log('[DM call] ICE state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        toast({ title: 'Connection issue', description: 'Could not establish audio link. Check your network.', variant: 'destructive' });
      }
    };
    pc.onconnectionstatechange = () => {
      console.log('[DM call] Connection state:', pc.connectionState);
    };

    // ICE candidate exchange
    pc.onicecandidate = (e) => {
      if (e.candidate && peerIdRef.current) {
        sendDmCallSignal({ type: 'call_ice', targetId: peerIdRef.current, candidate: e.candidate });
      }
    };

    return pc;
  }, []);

  // ── Flush pending ICE candidates once remote description is set ───────────
  const flushIce = useCallback(async (pc: RTCPeerConnection) => {
    for (const c of pendingIceRef.current) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
    pendingIceRef.current = [];
  }, []);

  // ── Called by DmCallOverlay when caller receives call_accept ─────────────
  const startCallerAudio = useCallback(async (peerId: string) => {
    const pc = await createPeer(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendDmCallSignal({ type: 'call_offer', targetId: peerId, sdp: offer });
  }, [createPeer]);

  // ── Called by DmCallOverlay when callee accepts ──────────────────────────
  // Just store peerId; actual peer is created when offer arrives from caller
  const startCalleeAudio = useCallback((peerId: string) => {
    peerIdRef.current = peerId;
  }, []);

  // ── Register WebRTC signal listener ──────────────────────────────────────
  useEffect(() => {
    setDmCallRtcSignalListener(async (signal) => {
      const { type: ctype, sdp, candidate } = signal ?? {};

      if (ctype === 'call_offer') {
        if (!peerIdRef.current) return;
        const pc = await createPeer(peerIdRef.current);
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        remoteDescSetRef.current = true;
        await flushIce(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendDmCallSignal({ type: 'call_answer', targetId: peerIdRef.current, sdp: answer });
      }

      if (ctype === 'call_answer') {
        const pc = pcRef.current;
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        remoteDescSetRef.current = true;
        await flushIce(pc);
      }

      if (ctype === 'call_ice') {
        const pc = pcRef.current;
        if (!candidate) return;
        if (pc && remoteDescSetRef.current) {
          try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
        } else {
          pendingIceRef.current.push(candidate);
        }
      }

      if (ctype === 'call_decline' || ctype === 'call_end') {
        cleanupAudio();
      }
    });

    return () => {
      setDmCallRtcSignalListener(null);
    };
  }, [createPeer, flushIce, cleanupAudio]);

  // ── Mic toggle (actually enables/disables the audio track) ───────────────
  const toggleMic = useCallback(() => {
    const store = useAppStore.getState();
    const nextMuted = !store.micMuted;
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !nextMuted; });
    }
    store.toggleMicMuted();
  }, []);

  // ── Speaker mode toggle (mobile only — tries setSinkId) ──────────────────
  const toggleSpeaker = useCallback((speakerOn: boolean) => {
    const audio = remoteAudioRef.current;
    if (!audio) return;
    const newSink = speakerOn ? 'default' : 'communications';
    if (typeof (audio as any).setSinkId === 'function') {
      (audio as any).setSinkId(newSink).catch(() => {});
    }
  }, []);

  return { startCallerAudio, startCalleeAudio, toggleMic, toggleSpeaker, cleanupAudio };
}
