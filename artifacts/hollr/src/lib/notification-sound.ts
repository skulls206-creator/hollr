let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

/**
 * Plays a soft two-tone notification ping similar to a Discord message sound.
 * Uses the Web Audio API — no external file needed.
 */
export function playNotificationSound(volume = 0.18) {
  try {
    const ac = getCtx();
    if (ac.state === 'suspended') ac.resume();

    const now = ac.currentTime;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    gain.connect(ac.destination);

    // First tone
    const osc1 = ac.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(660, now + 0.12);
    osc1.connect(gain);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Harmonics for a slightly richer "ding"
    const osc2 = ac.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1320, now);
    osc2.frequency.exponentialRampToValueAtTime(990, now + 0.12);
    const gain2 = ac.createGain();
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.linearRampToValueAtTime(volume * 0.35, now + 0.01);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    gain2.connect(ac.destination);
    osc2.connect(gain2);
    osc2.start(now);
    osc2.stop(now + 0.25);
  } catch {
    // Silently fail — some browsers block AudioContext before a user gesture
  }
}
