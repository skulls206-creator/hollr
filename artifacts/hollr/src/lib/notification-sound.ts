let ctx: AudioContext | null = null;
let _ringInterval: ReturnType<typeof setInterval> | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function playTone(
  ac: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

// ── Ringtone synthesizers ─────────────────────────────────────────────────

function ringClassic(vol = 0.28) {
  try {
    const ac = getCtx();
    if (ac.state === 'suspended') ac.resume();
    const now = ac.currentTime;
    for (const offset of [0, 0.22]) {
      playTone(ac, 800, now + offset, 0.18, vol);
      playTone(ac, 1000, now + offset, 0.18, vol * 0.4);
    }
  } catch { /* ignore */ }
}

function ringMarimba(vol = 0.30) {
  try {
    const ac = getCtx();
    if (ac.state === 'suspended') ac.resume();
    const now = ac.currentTime;
    const notes = [784, 659, 523, 392];
    notes.forEach((freq, i) => {
      const t = now + i * 0.12;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.55);
      // Harmonic overtone for warmth
      const osc2 = ac.createOscillator();
      const gain2 = ac.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * 2, t);
      gain2.gain.setValueAtTime(0, t);
      gain2.gain.linearRampToValueAtTime(vol * 0.3, t + 0.005);
      gain2.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      osc2.connect(gain2);
      gain2.connect(ac.destination);
      osc2.start(t);
      osc2.stop(t + 0.25);
    });
  } catch { /* ignore */ }
}

function ringDigital(vol = 0.22) {
  try {
    const ac = getCtx();
    if (ac.state === 'suspended') ac.resume();
    const now = ac.currentTime;
    const notes = [440, 554, 659, 880];
    for (const [i, freq] of notes.entries()) {
      playTone(ac, freq, now + i * 0.08, 0.07, vol, 'square');
    }
    for (const [i, freq] of notes.entries()) {
      playTone(ac, freq, now + 0.5 + i * 0.08, 0.07, vol, 'square');
    }
  } catch { /* ignore */ }
}

function ringChime(vol = 0.24) {
  try {
    const ac = getCtx();
    if (ac.state === 'suspended') ac.resume();
    const now = ac.currentTime;
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const t = now + i * 0.18;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(t);
      osc.stop(t + 1.2);
      // Metallic overtone
      const osc2 = ac.createOscillator();
      const gain2 = ac.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq * 3.5, t);
      gain2.gain.setValueAtTime(0, t);
      gain2.gain.linearRampToValueAtTime(vol * 0.2, t + 0.003);
      gain2.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc2.connect(gain2);
      gain2.connect(ac.destination);
      osc2.start(t);
      osc2.stop(t + 0.35);
    });
  } catch { /* ignore */ }
}

function ringNeon(vol = 0.18) {
  try {
    const ac = getCtx();
    if (ac.state === 'suspended') ac.resume();
    const now = ac.currentTime;
    const burst = (offset: number) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, now + offset);
      osc.frequency.linearRampToValueAtTime(520, now + offset + 0.28);
      gain.gain.setValueAtTime(0, now + offset);
      gain.gain.linearRampToValueAtTime(vol, now + offset + 0.02);
      gain.gain.setValueAtTime(vol, now + offset + 0.22);
      gain.gain.linearRampToValueAtTime(0, now + offset + 0.32);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.35);
      const lfo = ac.createOscillator();
      const lfoGain = ac.createGain();
      lfo.frequency.setValueAtTime(6, now + offset);
      lfoGain.gain.setValueAtTime(12, now + offset);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(now + offset);
      lfo.stop(now + offset + 0.35);
    };
    burst(0);
    burst(0.45);
  } catch { /* ignore */ }
}

function ringRetro(vol = 0.18) {
  try {
    const ac = getCtx();
    if (ac.state === 'suspended') ac.resume();
    const now = ac.currentTime;
    // ascending scale flourish
    const seq: [number, number][] = [
      [659, 0], [659, 0.15], [659, 0.30], [523, 0.39], [659, 0.48], [784, 0.60],
    ];
    for (const [freq, offset] of seq) {
      playTone(ac, freq, now + offset, 0.12, vol, 'square');
    }
  } catch { /* ignore */ }
}

// ── Ringtone registry ─────────────────────────────────────────────────────

export type RingtoneId = 'classic' | 'marimba' | 'digital' | 'chime' | 'neon' | 'retro';

export const RINGTONES: { id: RingtoneId; label: string; description: string }[] = [
  { id: 'classic',  label: 'Classic',  description: 'Traditional telephone ring' },
  { id: 'marimba',  label: 'Marimba',  description: 'Warm descending arpeggio' },
  { id: 'digital',  label: 'Digital',  description: 'Ascending electronic beeps' },
  { id: 'chime',    label: 'Chime',    description: 'Gentle bell harmonics' },
  { id: 'neon',     label: 'Neon',     description: 'Synth glide with vibrato' },
  { id: 'retro',    label: 'Retro',    description: '8-bit chiptune melody' },
];

const RING_FN: Record<RingtoneId, () => void> = {
  classic: ringClassic,
  marimba: ringMarimba,
  digital: ringDigital,
  chime:   ringChime,
  neon:    ringNeon,
  retro:   ringRetro,
};

/** Play a single preview burst of a ringtone — used in settings. */
export function previewRingtone(id: RingtoneId) {
  RING_FN[id]?.();
}

// ── Voice join / leave / notification sounds ──────────────────────────────

export function playVoiceJoinSound(volume = 0.2) {
  try {
    const ac = getCtx();
    if (ac.state === 'suspended') ac.resume();
    const now = ac.currentTime;
    playTone(ac, 523, now,       0.12, volume * 0.8);
    playTone(ac, 784, now + 0.1, 0.18, volume);
  } catch { /* ignore */ }
}

export function playVoiceLeaveSound(volume = 0.15) {
  try {
    const ac = getCtx();
    if (ac.state === 'suspended') ac.resume();
    const now = ac.currentTime;
    playTone(ac, 784, now,       0.12, volume);
    playTone(ac, 392, now + 0.1, 0.18, volume * 0.7);
  } catch { /* ignore */ }
}

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
    const osc1 = ac.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(660, now + 0.12);
    osc1.connect(gain);
    osc1.start(now);
    osc1.stop(now + 0.35);
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
  } catch { /* ignore */ }
}

// ── Call ringing ──────────────────────────────────────────────────────────

export function startCallRinging(ringtoneId: RingtoneId = 'classic') {
  stopCallRinging();
  const fn = RING_FN[ringtoneId] ?? ringClassic;
  fn();
  const repeatMs = ringtoneId === 'marimba' ? 2500 : ringtoneId === 'chime' ? 3500 : 2000;
  _ringInterval = setInterval(fn, repeatMs);
}

export function stopCallRinging() {
  if (_ringInterval !== null) {
    clearInterval(_ringInterval);
    _ringInterval = null;
  }
}
