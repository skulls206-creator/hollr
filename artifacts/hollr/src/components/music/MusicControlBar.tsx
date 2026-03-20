import {
  Play, Pause, SkipForward, Volume2, VolumeX, Music2, List, X, Loader2, AlertCircle, Repeat,
} from 'lucide-react';
import { useMusicState } from '@/hooks/use-music-state';
import type { Track } from '@workspace/api-zod';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';

function fmtMs(ms: number): string {
  if (!ms || ms < 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function MusicControlBar({ voiceChannelId }: { voiceChannelId: string }) {
  const {
    musicState,
    audioPositionMs,
    musicVolume, setMusicVolume,
    error, loading,
    loopEnabled, setLoopEnabled,
    pause, resume, skip, stop,
  } = useMusicState(voiceChannelId);

  const [showQueue, setShowQueue] = useState(false);

  if (!musicState.botConnected && !loading) return null;

  const { currentTrack, isPlaying, queue, durationMs } = musicState;
  const progress = durationMs > 0 ? Math.min((audioPositionMs / durationMs) * 100, 100) : 0;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="music-bar"
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.2 }}
        className="relative overflow-visible bg-[#1E1F22] border-t border-white/5"
      >
        {/* Queue popup */}
        {showQueue && queue.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 bg-[#2B2D31] border border-border/20 rounded-t-xl shadow-2xl overflow-hidden max-h-52 overflow-y-auto z-50">
            <div className="px-3 py-1.5 border-b border-border/10 flex items-center justify-between">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Up Next — {queue.length} track{queue.length !== 1 ? 's' : ''}
              </p>
            </div>
            {queue.map((t: Track, i: number) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 hover:bg-white/5">
                <span className="text-[10px] text-muted-foreground w-4 text-right shrink-0">{i + 1}.</span>
                <Music2 size={11} className="text-muted-foreground shrink-0" />
                <p className="text-sm truncate flex-1">{t.title}</p>
                <p className="text-xs text-muted-foreground shrink-0">{fmtMs(t.durationMs)}</p>
              </div>
            ))}
          </div>
        )}

        <div className="px-4 py-2 flex items-center gap-3">
          {/* Track thumbnail / icon */}
          <div className="w-8 h-8 rounded-md bg-primary/20 flex items-center justify-center shrink-0">
            {loading ? (
              <Loader2 size={14} className="animate-spin text-primary" />
            ) : currentTrack?.thumbnail ? (
              <img src={currentTrack.thumbnail} alt="" className="w-full h-full object-cover rounded-md" />
            ) : (
              <Music2 size={14} className={cn('text-primary', isPlaying && 'animate-pulse')} />
            )}
          </div>

          {/* Track info */}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-tight truncate">
              {loading ? 'Loading…' : currentTrack?.title ?? (error ? 'Error' : 'Idle')}
            </p>
            {error ? (
              <div className="flex items-center gap-1">
                <AlertCircle size={10} className="text-destructive shrink-0" />
                <p className="text-[11px] text-destructive truncate">{error}</p>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {fmtMs(audioPositionMs)}
                {durationMs > 0 && ` / ${fmtMs(durationMs)}`}
                {!currentTrack && !loading && ' · Music Bot connected'}
                {loopEnabled && currentTrack && (
                  <span className="ml-1 text-primary">· loop</span>
                )}
              </p>
            )}
          </div>

          {/* Progress bar */}
          {durationMs > 0 && !error && (
            <div className="flex-1 max-w-[200px] hidden sm:block">
              <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-[width] duration-200 ease-linear"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center gap-0.5 shrink-0">
            {/* Play / Pause */}
            <button
              onClick={isPlaying ? pause : resume}
              disabled={(!currentTrack && !isPlaying) || loading}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-foreground disabled:opacity-40 transition-colors"
              title={isPlaying ? 'Pause' : 'Resume'}
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>

            {/* Skip */}
            <button
              onClick={() => skip()}
              disabled={!currentTrack || loading}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-foreground disabled:opacity-40 transition-colors"
              title="Skip"
            >
              <SkipForward size={16} />
            </button>

            {/* Loop */}
            <button
              onClick={() => setLoopEnabled(!loopEnabled)}
              className={cn(
                'w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
                loopEnabled
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:bg-white/10 hover:text-foreground',
              )}
              title={loopEnabled ? 'Loop on — click to turn off' : 'Loop off — click to repeat track'}
            >
              <Repeat size={14} />
            </button>

            {/* Queue toggle */}
            {queue.length > 0 && (
              <button
                onClick={() => setShowQueue(v => !v)}
                className={cn(
                  'w-8 h-8 flex items-center justify-center rounded-lg transition-colors relative',
                  showQueue ? 'bg-primary/20 text-primary' : 'hover:bg-white/10 text-muted-foreground',
                )}
                title="Show queue"
              >
                <List size={15} />
                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-primary rounded-full text-[8px] font-bold text-white flex items-center justify-center leading-none">
                  {queue.length}
                </span>
              </button>
            )}

            {/* Volume */}
            <div className="flex items-center gap-1 ml-1">
              <button
                onClick={() => setMusicVolume(musicVolume === 0 ? 80 : 0)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title={musicVolume === 0 ? 'Unmute' : 'Mute'}
              >
                {musicVolume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
              </button>
              <div className="w-16 hidden sm:block">
                <Slider
                  value={[musicVolume]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={([v]) => setMusicVolume(v)}
                />
              </div>
              <span className="text-[11px] text-muted-foreground w-7 hidden sm:inline tabular-nums">
                {musicVolume}%
              </span>
            </div>

            {/* Stop */}
            <button
              onClick={() => stop()}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors ml-1"
              title="Stop music and disconnect bot"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
