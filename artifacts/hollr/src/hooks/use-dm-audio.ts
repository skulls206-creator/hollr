import { useRef, useCallback, useEffect } from 'react';
import { useAppStore } from '@/store/use-app-store';
import { setDmCallRtcSignalListener, sendDmCallSignal } from './use-realtime';
import { fetchIceServers } from '@/lib/ice-servers';
import { toast } from '@/hooks/use-toast';

// ── Create a hidden video element and attach it to the DOM.
// Using <video> (not <audio>) is required for iOS Safari earpiece routing
// via playsInline. The element must be in the DOM for iOS to honor routing.
function createHiddenVideoElement(): HTMLVideoElement {
  const el = document.createElement('video');
  el.autoplay = true;
  el.playsInline = true; // default: earpiece on iOS; inline on everything else
  el.setAttribute('webkit-playsinline', 'true');
  el.muted = false;
  el.style.cssText =
    'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;' +
    'top:-9999px;left:-9999px;';
  document.body.appendChild(el);
  return el;
}

// ── Silent AudioContext keepalive ──────────────────────────────────────────
// iOS suspends WebRTC audio when the app backgrounds *unless* there is an
// active AudioContext playing something. We create a 1-second silent buffer
// looping forever for the lifetime of the call. Cost: effectively zero CPU.
function startSilentKeepalive(): () => void {
  let ctx: AudioContext | null = null;
  let source: AudioBufferSourceNode | null = null;

  const start = () => {
    try {
      ctx = new AudioContext();
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      source = ctx.createBufferSource();
      source.buffer = buf;
      source.loop = true;
      source.connect(ctx.destination);
      source.start(0);
    } catch {}
  };

  // iOS suspends AudioContexts created outside a user-gesture; resume on
  // any user interaction AND whenever the page returns to the foreground.
  const resume = () => { ctx?.state === 'suspended' && ctx.resume().catch(() => {}); };
  document.addEventListener('visibilitychange', resume, { passive: true });
  document.addEventListener('touchstart', resume, { passive: true, once: false });

  start();

  // Return a cleanup function
  return () => {
    document.removeEventListener('visibilitychange', resume);
    document.removeEventListener('touchstart', resume);
    try { source?.stop(); } catch {}
    ctx?.close().catch(() => {});
  };
}

export function useDmCallAudio() {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  // Using a video element (cast to HTMLAudioElement for compat) so iOS can
  // route audio via playsInline. Always attached to the DOM.
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSetRef = useRef(false);
  const peerIdRef = useRef<string | null>(null);
  const stopKeepaliveRef = useRef<(() => void) | null>(null);

  // Persisted state refs — applied immediately when audio element exists,
  // and re-applied when the element is created if toggled early.
  const deafenedRef = useRef(false);
  const earpieceRef = useRef(false);

  // ── Ensure a video element exists ──────────────────────────────────────────
  const getOrCreateVideo = useCallback((): HTMLVideoElement => {
    if (!remoteVideoRef.current || !document.body.contains(remoteVideoRef.current)) {
      remoteVideoRef.current = createHiddenVideoElement();
    }
    return remoteVideoRef.current;
  }, []);

  const cleanupAudio = useCallback(() => {
    // Stop the silent keepalive AudioContext
    stopKeepaliveRef.current?.();
    stopKeepaliveRef.current = null;

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
    if (remoteVideoRef.current) {
      remoteVideoRef.current.pause();
      remoteVideoRef.current.srcObject = null;
      remoteVideoRef.current.remove(); // detach from DOM
      remoteVideoRef.current = null;
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

    // Start the silent keepalive so iOS doesn't kill the audio session
    // when the app backgrounds. Stop any previous instance first.
    stopKeepaliveRef.current?.();
    stopKeepaliveRef.current = startSilentKeepalive();

    const iceServers = await fetchIceServers();
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;

    // Ensure the DOM video element exists (pre-create in user gesture context)
    const video = getOrCreateVideo();
    // Re-apply persisted state to the freshly created element
    video.muted = deafenedRef.current;
    video.playsInline = !earpieceRef.current; // see setEarpiece for the iOS logic

    // Get local audio
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      const isMuted = useAppStore.getState().micMuted;
      stream.getAudioTracks().forEach(t => {
        t.enabled = !isMuted; // honour the stored mute state before adding to PC
        pc.addTrack(t, stream);
      });
    } catch (err) {
      console.error('[DM call] Microphone error:', err);
      toast({ title: 'Microphone unavailable', description: 'Could not access your microphone.', variant: 'destructive' });
    }

    // Play remote audio via the video element
    pc.ontrack = (e) => {
      const vid = remoteVideoRef.current ?? getOrCreateVideo();
      const incomingStream = e.streams[0] ?? new MediaStream([e.track]);
      vid.srcObject = incomingStream;
      // Re-apply deafen state in case it was toggled before track arrived
      vid.muted = deafenedRef.current;
      vid.play().catch((err) => {
        console.warn('[DM call] Remote audio play() blocked:', err);
        setTimeout(() => vid.play().catch(console.warn), 500);
      });
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[DM call] ICE state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        toast({ title: 'Connection issue', description: 'Could not establish audio link. Check your network.', variant: 'destructive' });
      }
    };
    pc.onconnectionstatechange = () => {
      console.log('[DM call] Connection state:', pc.connectionState);
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && peerIdRef.current) {
        sendDmCallSignal({ type: 'call_ice', targetId: peerIdRef.current, candidate: e.candidate });
      }
    };

    return pc;
  }, [getOrCreateVideo]);

  // ── Flush pending ICE candidates once remote description is set ───────────
  const flushIce = useCallback(async (pc: RTCPeerConnection) => {
    for (const c of pendingIceRef.current) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
    pendingIceRef.current = [];
  }, []);

  const startCallerAudio = useCallback(async (peerId: string) => {
    const pc = await createPeer(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendDmCallSignal({ type: 'call_offer', targetId: peerId, sdp: offer });
  }, [createPeer]);

  const startCalleeAudio = useCallback((peerId: string) => {
    peerIdRef.current = peerId;
  }, []);

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

  // ── Mic toggle ───────────────────────────────────────────────────────────
  const toggleMic = useCallback(() => {
    const store = useAppStore.getState();
    const nextMuted = !store.micMuted;
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !nextMuted; });
    }
    store.toggleMicMuted();
  }, []);

  // ── Deafen: mute/unmute incoming audio ────────────────────────────────────
  // deafenedRef persists the state so if the track hasn't arrived yet (or the
  // element is recreated on reconnect) we still apply it correctly.
  const setDeafened = useCallback((deafened: boolean) => {
    deafenedRef.current = deafened;
    const vid = remoteVideoRef.current;
    if (vid) vid.muted = deafened;
  }, []);

  // ── Earpiece routing ──────────────────────────────────────────────────────
  // Strategy (in priority order):
  //
  // 1. Chrome/Edge Desktop — setSinkId with device enumeration
  //    'communications' is a valid alias on Windows; on Android Chrome it
  //    doesn't correspond to the physical earpiece, so we enumerate devices.
  //
  // 2. iOS Safari — <video playsInline> trick.
  //    playsInline=false → full-screen audio mode → loudspeaker
  //    playsInline=true  → inline playback          → earpiece / receiver
  //    Changing playsInline requires re-attaching srcObject to take effect.
  //
  // 3. Android Chrome — setSinkId doesn't expose earpiece as a device.
  //    We inform the user that earpiece routing isn't available in the browser.
  const setEarpiece = useCallback(async (useEarpiece: boolean) => {
    earpieceRef.current = useEarpiece;
    const vid = remoteVideoRef.current;
    if (!vid) return;

    // ── Path A: setSinkId (Chrome/Edge desktop + headphone/BT devices) ──────
    if (typeof (vid as any).setSinkId === 'function') {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outputs = devices.filter(d => d.kind === 'audiooutput');

        if (useEarpiece) {
          // Prefer a device labeled earpiece/receiver/built-in
          const earpiece = outputs.find(d =>
            /earpiece|receiver|built.?in ear/i.test(d.label)
          );
          await (vid as any).setSinkId(earpiece?.deviceId ?? 'communications');
        } else {
          // Default output device (system speaker)
          await (vid as any).setSinkId('');
        }
        return;
      } catch (err: any) {
        // NotFoundError or NotAllowedError — setSinkId exists but earpiece
        // device isn't available (common on Android Chrome).
        console.warn('[DM call] setSinkId failed:', err?.message ?? err);

        // Fall through to iOS path if applicable; otherwise inform user.
        const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
        if (!isIOS) {
          toast({
            title: 'Earpiece not available',
            description: 'Your browser or device doesn\'t support switching to earpiece. Use headphones instead.',
            variant: 'destructive',
          });
          // Revert UI state
          earpieceRef.current = false;
          return;
        }
      }
    }

    // ── Path B: iOS Safari — flip playsInline and re-attach srcObject ────────
    // playsInline=false → loudspeaker (fills the room)
    // playsInline=true  → receiver/earpiece (quiet, holds to ear)
    vid.playsInline = useEarpiece;
    (vid as any)['webkit-playsinline'] = useEarpiece;

    if (vid.srcObject) {
      const src = vid.srcObject;
      vid.srcObject = null;
      await new Promise(r => setTimeout(r, 50)); // brief pause for iOS session flush
      vid.srcObject = src;
      vid.play().catch(() => {});
    }
  }, []);

  return { startCallerAudio, startCalleeAudio, toggleMic, setDeafened, setEarpiece, earpieceRef, cleanupAudio };
}
