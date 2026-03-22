import { AnimatePresence, motion } from 'framer-motion';
import { Sliders, Zap, TrendingUp, SlidersHorizontal } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/use-app-store';
import { useAuth } from '@workspace/replit-auth-web';

interface MixerPanelProps {
  open: boolean;
  musicVolume: number;
  setMusicVolume: (v: number) => void;
  onSetEffects: (effects: { bassBoost: boolean; nightcore: boolean; normalize: boolean }) => void;
  panelClass?: string;
}

export function MixerPanel({
  open,
  musicVolume,
  setMusicVolume,
  onSetEffects,
  panelClass = 'absolute top-full left-0 right-0 rounded-b-xl',
}: MixerPanelProps) {
  const { user } = useAuth();
  const {
    micGain, setMicGain,
    musicEffects, setMusicEffect,
    voiceVolumes, setVoiceVolume,
    voiceConnection, voiceChannelUsers,
  } = useAppStore();

  const vcId = voiceConnection?.channelId ?? null;
  const remoteUsers = vcId
    ? (voiceChannelUsers[vcId] ?? []).filter(u => u.userId !== user?.id)
    : [];

  const toggleEffect = (effect: 'bassBoost' | 'nightcore' | 'normalize') => {
    const next = { ...musicEffects, [effect]: !musicEffects[effect] };
    setMusicEffect(effect, !musicEffects[effect]);
    onSetEffects(next);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="mixer"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className={cn(
            'z-50 bg-background/95 backdrop-blur-xl border-x border-b border-border/30 shadow-2xl',
            panelClass,
          )}
        >
          {/* Accent bar */}
          <div className="h-[2px] w-full bg-gradient-to-r from-primary/60 via-primary to-primary/60" />

          <div className="px-4 py-3 grid grid-cols-[1fr_auto_1fr] gap-0 divide-x divide-border/20">

            {/* ─── MUSIC column ─────────────────────────────────────── */}
            <div className="pr-4 space-y-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-1">
                <SlidersHorizontal size={9} />
                Music
              </p>

              {/* Volume */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Volume</span>
                  <span className="text-[10px] font-bold tabular-nums text-foreground">{musicVolume}%</span>
                </div>
                <Slider
                  value={[musicVolume]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={([v]) => setMusicVolume(v)}
                />
              </div>

              {/* EQ Effects */}
              <div className="space-y-1.5">
                <p className="text-[9px] uppercase tracking-widest text-muted-foreground/60">EQ Effects</p>
                {([
                  { key: 'bassBoost', label: 'Bass Boost', icon: <Zap size={10} />, color: 'text-orange-400' },
                  { key: 'nightcore', label: 'Nightcore', icon: <TrendingUp size={10} />, color: 'text-violet-400' },
                  { key: 'normalize', label: 'Normalize', icon: <Sliders size={10} />, color: 'text-blue-400' },
                ] as const).map(({ key, label, icon, color }) => (
                  <button
                    key={key}
                    onClick={() => toggleEffect(key)}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] transition-all',
                      musicEffects[key]
                        ? `bg-primary/15 ${color} font-semibold`
                        : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
                    )}
                  >
                    <span className={musicEffects[key] ? color : 'text-muted-foreground/60'}>
                      {icon}
                    </span>
                    {label}
                    {musicEffects[key] && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* ─── MIC column ───────────────────────────────────────── */}
            <div className="px-4 space-y-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-1">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
                Mic In
              </p>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Gain</span>
                  <span className={cn(
                    'text-[10px] font-bold tabular-nums',
                    micGain > 130 ? 'text-orange-400' : 'text-foreground',
                  )}>
                    {micGain}%
                  </span>
                </div>
                <Slider
                  value={[micGain]}
                  min={0}
                  max={200}
                  step={5}
                  onValueChange={([v]) => setMicGain(v)}
                />
                <div className="flex justify-between text-[9px] text-muted-foreground/50 mt-0.5">
                  <span>Mute</span>
                  <span>Unity</span>
                  <span>+6dB</span>
                </div>
              </div>

              {micGain === 0 && (
                <p className="text-[10px] text-destructive/80 bg-destructive/10 rounded px-2 py-1">
                  Mic is muted via gain
                </p>
              )}
              {micGain > 150 && (
                <p className="text-[10px] text-orange-400/80 bg-orange-400/10 rounded px-2 py-1">
                  High gain — may clip
                </p>
              )}
            </div>

            {/* ─── VOICE column ─────────────────────────────────────── */}
            <div className="pl-4 space-y-3 min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-1">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                Voice Mix
              </p>

              {remoteUsers.length === 0 ? (
                <p className="text-[10px] text-muted-foreground/50 italic">
                  No other users in voice
                </p>
              ) : (
                <div className="space-y-2 max-h-28 overflow-y-auto pr-1">
                  {remoteUsers.map(u => {
                    const vol = voiceVolumes[u.userId] ?? 1;
                    return (
                      <div key={u.userId} className="space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {u.avatarUrl ? (
                              <img src={u.avatarUrl} alt="" className="w-4 h-4 rounded-full shrink-0 object-cover" />
                            ) : (
                              <div className="w-4 h-4 rounded-full bg-primary/30 shrink-0 flex items-center justify-center text-[7px] font-bold text-primary">
                                {(u.displayName ?? 'U')[0].toUpperCase()}
                              </div>
                            )}
                            <span className="text-[10px] truncate text-foreground">{u.displayName}</span>
                          </div>
                          <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                            {Math.round(vol * 100)}%
                          </span>
                        </div>
                        <Slider
                          value={[vol]}
                          min={0}
                          max={1}
                          step={0.05}
                          onValueChange={([v]) => setVoiceVolume(u.userId, v)}
                          className="h-1"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
