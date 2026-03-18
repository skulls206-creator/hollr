import { useEffect, useRef, useState } from 'react';
import { useRealtime } from './use-realtime';
import { useAuth } from '@workspace/replit-auth-web';

// Simplified WebRTC Mesh networking hook for Voice/Video/Screen sharing
export function useWebRTC(channelId: string | null) {
  const { user } = useAuth();
  const { sendSignal } = useRealtime(user?.id);
  
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  
  // participantId -> MediaStream
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  // participantId -> gain value (0 to 2.0)
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  
  const peersRef = useRef<Record<string, RTCPeerConnection>>({});
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodesRef = useRef<Record<string, GainNode>>({});

  useEffect(() => {
    if (!channelId) {
      // Disconnected, clean up
      Object.values(peersRef.current).forEach(p => p.close());
      peersRef.current = {};
      localStream?.getTracks().forEach(t => t.stop());
      screenStream?.getTracks().forEach(t => t.stop());
      setLocalStream(null);
      setScreenStream(null);
      setRemoteStreams({});
      audioContextRef.current?.close();
      audioContextRef.current = null;
      return;
    }

    // Initialize AudioContext for volume control
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    const initLocalMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
          video: false // Start with voice only
        });
        setLocalStream(stream);
        // Announce join via WS (handled by server in real app, mocked logic here)
        sendSignal({ action: 'join', channelId, userId: user?.id });
      } catch (err) {
        console.error("Failed to access microphone", err);
      }
    };

    initLocalMedia();
    
    return () => {
      // Cleanup on unmount or channel change
      localStream?.getTracks().forEach(t => t.stop());
      screenStream?.getTracks().forEach(t => t.stop());
    };
  }, [channelId]);

  // Handle incoming streams and volume
  useEffect(() => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;

    Object.entries(remoteStreams).forEach(([peerId, stream]) => {
      if (!gainNodesRef.current[peerId] && stream.getAudioTracks().length > 0) {
        const source = ctx.createMediaStreamSource(stream);
        const gainNode = ctx.createGain();
        // Set initial volume
        gainNode.gain.value = volumes[peerId] !== undefined ? volumes[peerId] : 1.0;
        
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        gainNodesRef.current[peerId] = gainNode;
        
        // Mute the actual HTMLAudioElement that renders this stream so we don't double play
        // (UI must render <audio muted srcObject={stream} />)
      }
    });
  }, [remoteStreams]);

  const setParticipantVolume = (participantId: string, volume: number) => {
    // volume is 0.0 to 2.0
    setVolumes(prev => ({ ...prev, [participantId]: volume }));
    if (gainNodesRef.current[participantId]) {
      gainNodesRef.current[participantId].gain.value = volume;
    }
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
    }
  };

  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      setScreenStream(stream);
      
      // Add tracks to all existing peers and listen for end
      stream.getTracks().forEach(track => {
        Object.values(peersRef.current).forEach(peer => {
          peer.addTrack(track, stream);
        });
        track.onended = () => stopScreenShare();
      });
    } catch (err) {
      console.error("Failed to share screen", err);
    }
  };

  const stopScreenShare = () => {
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
      setScreenStream(null);
      // Remove tracks from peers (requires renegotiation)
      // Implementation omitted for brevity
    }
  };

  return {
    localStream,
    screenStream,
    remoteStreams,
    volumes,
    setParticipantVolume,
    toggleMute,
    startScreenShare,
    stopScreenShare
  };
}
