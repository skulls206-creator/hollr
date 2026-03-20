import { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, Volume2, VolumeX, Music2, List, X, Loader2 } from 'lucide-react';
import { useMusicState } from '@/hooks/use-music-state';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

function fmtMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function MusicControlBar({ voiceChannelId }: { voiceChannelId: string }) {
  const {
    musicState, musicVolume, setMusicVolume,
    error, loading, pause, resume, skip, stop,
  } = useMusicState(voiceChannelId);

  const [localPositionMs, setLocalPositionMs] = useState(0);
  const [showQueue, setShowQueue] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setLocalPositionMs(musicState.positionMs);
  }, [musicState.positionMs]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (musicState.isPlaying) {
      timerRef.current = setInterval(() => {
        setLocalPositionMs(prev => {
          const next = prev + 250;
          if (musicState.durationMs > 0 && next >= musicState.durationMs) {
            clearInterval(timerRef.current!);
            return musicState.durationMs;
          }
          return next;
        });
      }, 250);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [musicState.isPlaying, musicState.durationMs]);

  if (!musicState.botConnected) return null;

  const { currentTrack, isPlaying, queue, durationMs } = musicState;
  const progress = durationMs > 0 ? (localPositionMs / durationMs) * 100 : 0;

  return (
    <AnimatePresence>
      <motion.div
        key="music-bar"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        className="relative px-4 pt-2 pb-1 bg-[#232428] border-t border-border/20 select-none"
      >
        {/* Queue popup */}
        {showQueue && queue.length > 0 && (
          <div className="absolute bottom-full left-4 right-4 mb-2 bg-[#2B2D31] border border-border/20 rounded-xl shadow-2xl overflow-hidden max-h-48 overflow-y-auto z-50">
            <div className="px-3 py-1.5 border-b border-border/10">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Up Next ({queue.length})</p>
            </div>
            {queue.map((t, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 hover:bg-white/5">
                <Music2 size={12} className="text-muted-foreground shrink-0" />
                <p className="text-sm truncate flex-1">{t.title}</p>
                <p className="text-xs text-muted-foreground">{fmtMs(t.durationMs)}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          {/* Track info */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center shrink-0">
              {loading ? (
                <Loader2 size={14} className="animate-spin text-primary" />
              ) : (
                <Music2 size={14} className="text-primary" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate leading-tight">
                {currentTrack?.title ?? (loading ? 'Loading…' : 'No track')}
              </p>
              {error && <p className="text-[11px] text-destructive truncate">{error}</p>}
              {!error && (
                <p className="text-[11px] text-muted-foreground">
                  {fmtMs(localPositionMs)}
                  {durationMs > 0 && ` / ${fmtMs(durationMs)}`}
                </p>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {durationMs > 0 && (
            <div className="flex-1 max-w-xs hidden sm:block">
              <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-[width] duration-250 ease-linear"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={isPlaying ? pause : resume}
              disabled={!currentTrack && !isPlaying}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-foreground disabled:opacity-40 transition-colors"
              title={isPlaying ? 'Pause' : 'Resume'}
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>

            <button
              onClick={() => skip()}
              disabled={!currentTrack}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-foreground disabled:opacity-40 transition-colors"
              title="Skip"
            >
              <SkipForward size={16} />
            </button>

            {queue.length > 0 && (
              <button
                onClick={() => setShowQueue(v => !v)}
                className={cn(
                  'w-8 h-8 flex items-center justify-center rounded-lg transition-colors relative',
                  showQueue ? 'bg-primary/20 text-primary' : 'hover:bg-white/10 text-muted-foreground'
                )}
                title="Show queue"
              >
                <List size={16} />
                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-primary rounded-full text-[8px] font-bold text-white flex items-center justify-center">
                  {queue.length}
                </span>
              </button>
            )}

            {/* Volume */}
            <div className="flex items-center gap-1.5 ml-1">
              <button
                onClick={() => setMusicVolume(musicVolume === 0 ? 100 : 0)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title={musicVolume === 0 ? 'Unmute' : 'Mute'}
              >
                {musicVolume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              <div className="w-20 hidden sm:block">
                <Slider
                  value={[musicVolume]}
                  min={0}
                  max={200}
                  step={1}
                  onValueChange={([v]) => setMusicVolume(v)}
                />
              </div>
              <span className="text-[11px] text-muted-foreground w-8 hidden sm:inline">
                {musicVolume}%
              </span>
            </div>

            {/* Stop / disconnect */}
            <button
              onClick={() => stop()}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors ml-1"
              title="Stop music and disconnect bot"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
