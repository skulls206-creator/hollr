/**
 * RippdPanel — rip MP3s from YouTube & SoundCloud links
 */
import { useState, useRef, useCallback } from 'react';
import { Download, Music2, X, Clock, ExternalLink, Clipboard, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import type { NativePanelProps } from '@/lib/khurk-apps';
import { cn } from '@/lib/utils';

const BASE = import.meta.env.BASE_URL;

const ACCENT_FROM = '#c026d3';
const ACCENT_TO   = '#06b6d4';

interface TrackInfo {
  title: string;
  artist: string;
  duration: number;
  thumbnail: string | null;
  source: 'youtube' | 'soundcloud' | 'unknown';
}

interface RipHistory {
  id: string;
  title: string;
  artist: string;
  source: string;
  url: string;
  rippedAt: number;
}

const HISTORY_KEY = 'rippd:history';

function getHistory(): RipHistory[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); } catch { return []; }
}
function saveHistory(h: RipHistory[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 30))); } catch {}
}
function pushHistory(entry: RipHistory) {
  const h = getHistory().filter(x => x.url !== entry.url);
  saveHistory([entry, ...h]);
}

function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function SourceBadge({ source }: { source: string }) {
  const isYt = source === 'youtube';
  return (
    <span className={cn(
      'text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full',
      isYt ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'
    )}>
      {isYt ? 'YouTube' : 'SoundCloud'}
    </span>
  );
}

export function RippdPanel(_props: NativePanelProps) {
  const [url, setUrl]             = useState('');
  const [track, setTrack]         = useState<TrackInfo | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [done, setDone]           = useState(false);
  const [history, setHistory]     = useState<RipHistory[]>(getHistory);
  const abortRef = useRef<AbortController | null>(null);

  const resolveUrl = useCallback(async (rawUrl: string) => {
    const trimmed = rawUrl.trim();
    if (!trimmed) return;
    setError(null);
    setTrack(null);
    setDone(false);
    setLoading(true);
    try {
      const res = await fetch(`${BASE}api/rippd/info?url=${encodeURIComponent(trimmed)}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to resolve');
      setTrack(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      resolveUrl(text);
    } catch {}
  }, [resolveUrl]);

  const handleRip = useCallback(async () => {
    if (!track || !url.trim()) return;
    setDownloading(true);
    setDone(false);
    setError(null);
    abortRef.current = new AbortController();

    try {
      const res = await fetch(
        `${BASE}api/rippd/download?url=${encodeURIComponent(url.trim())}`,
        { credentials: 'include', signal: abortRef.current.signal }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Download failed');
      }
      const blob = await res.blob();
      const filename = (res.headers.get('Content-Disposition') ?? '')
        .match(/filename="?([^"]+)"?/)?.[1]
        ?? `${track.title}.mp3`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);

      const entry: RipHistory = {
        id: crypto.randomUUID(),
        title: track.title,
        artist: track.artist,
        source: track.source,
        url: url.trim(),
        rippedAt: Date.now(),
      };
      pushHistory(entry);
      setHistory(getHistory());
      setDone(true);
    } catch (e: any) {
      if (e.name !== 'AbortError') setError(e.message);
    } finally {
      setDownloading(false);
      abortRef.current = null;
    }
  }, [track, url]);

  const clearTrack = () => { setTrack(null); setUrl(''); setError(null); setDone(false); };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#0f0f11] text-white select-none">

      {/* Header strip */}
      <div
        className="shrink-0 px-5 pt-5 pb-4"
        style={{ background: `linear-gradient(135deg, ${ACCENT_FROM}22, ${ACCENT_TO}22)` }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
            style={{ background: `linear-gradient(135deg, ${ACCENT_FROM}, ${ACCENT_TO})` }}
          >
            <Download size={20} />
          </div>
          <div>
            <p className="text-xs font-bold tracking-widest uppercase"
               style={{ background: `linear-gradient(90deg,${ACCENT_FROM},${ACCENT_TO})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              RIPPD
            </p>
            <p className="text-[11px] text-white/40 leading-tight">Paste a YouTube or SoundCloud link to rip MP3</p>
          </div>
        </div>

        {/* URL input row */}
        <div className="flex gap-2">
          <div className="flex-1 flex items-center bg-white/5 border border-white/10 rounded-xl px-3 gap-2 focus-within:border-fuchsia-500/50 transition-colors">
            <Music2 size={14} className="text-white/30 shrink-0" />
            <input
              value={url}
              onChange={e => { setUrl(e.target.value); setTrack(null); setDone(false); setError(null); }}
              onKeyDown={e => e.key === 'Enter' && resolveUrl(url)}
              placeholder="https://youtube.com/watch?v=... or soundcloud.com/..."
              className="flex-1 bg-transparent text-sm text-white placeholder-white/25 outline-none py-2.5 min-w-0"
            />
            {url && (
              <button onClick={clearTrack} className="text-white/30 hover:text-white/60 transition-colors">
                <X size={14} />
              </button>
            )}
          </div>
          <button
            onClick={handlePaste}
            className="shrink-0 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10 transition-colors text-xs font-medium flex items-center gap-1.5"
          >
            <Clipboard size={13} /> Paste
          </button>
          <button
            onClick={() => resolveUrl(url)}
            disabled={!url.trim() || loading}
            className="shrink-0 px-4 py-2 rounded-xl font-semibold text-sm disabled:opacity-40 transition-all flex items-center gap-1.5"
            style={{ background: `linear-gradient(135deg, ${ACCENT_FROM}, ${ACCENT_TO})` }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : 'Resolve'}
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 no-scrollbar">

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4 flex gap-4 animate-pulse">
            <div className="w-20 h-20 rounded-xl bg-white/10 shrink-0" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-4 bg-white/10 rounded w-3/4" />
              <div className="h-3 bg-white/10 rounded w-1/2" />
              <div className="h-3 bg-white/10 rounded w-1/4" />
            </div>
          </div>
        )}

        {/* Track card */}
        {track && !loading && (
          <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
            <div className="flex gap-4 p-4">
              {/* Thumbnail */}
              <div className="shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-white/10">
                {track.thumbnail
                  ? <img src={track.thumbnail} alt={track.title} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"><Music2 size={28} className="text-white/20" /></div>
                }
              </div>

              {/* Meta */}
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <SourceBadge source={track.source} />
                <p className="font-semibold text-sm leading-tight truncate">{track.title}</p>
                <p className="text-xs text-white/50 truncate">{track.artist}</p>
                {track.duration > 0 && (
                  <p className="text-[11px] text-white/30">{fmtDuration(track.duration)}</p>
                )}
              </div>
            </div>

            {/* Rip button */}
            <div className="px-4 pb-4">
              {done ? (
                <div className="flex items-center gap-2 justify-center py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold">
                  <CheckCircle2 size={15} /> Download started!
                </div>
              ) : (
                <button
                  onClick={handleRip}
                  disabled={downloading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm disabled:opacity-60 transition-all active:scale-95"
                  style={{ background: `linear-gradient(135deg, ${ACCENT_FROM}, ${ACCENT_TO})` }}
                >
                  {downloading
                    ? <><Loader2 size={14} className="animate-spin" /> Ripping…</>
                    : <><Download size={14} /> Rip It</>
                  }
                </button>
              )}
            </div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div>
            <p className="text-[11px] font-bold tracking-widest uppercase text-white/25 mb-2">Recent Rips</p>
            <div className="space-y-1.5">
              {history.map(h => (
                <div
                  key={h.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/4 border border-white/8 hover:bg-white/8 transition-colors cursor-pointer group"
                  onClick={() => { setUrl(h.url); resolveUrl(h.url); }}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `linear-gradient(135deg, ${ACCENT_FROM}55, ${ACCENT_TO}55)` }}
                  >
                    <Music2 size={12} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{h.title}</p>
                    <p className="text-[11px] text-white/35 truncate">{h.artist}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <SourceBadge source={h.source} />
                    <button
                      onClick={e => { e.stopPropagation(); window.open(h.url, '_blank'); }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-white/30 hover:text-white transition-all"
                    >
                      <ExternalLink size={11} />
                    </button>
                    <div className="flex items-center gap-1 text-[10px] text-white/20">
                      <Clock size={10} />
                      {new Date(h.rippedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => { saveHistory([]); setHistory([]); }}
              className="mt-2 text-[11px] text-white/20 hover:text-white/40 transition-colors"
            >
              Clear history
            </button>
          </div>
        )}

        {/* Empty state */}
        {!track && !loading && !error && history.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-2xl"
              style={{ background: `linear-gradient(135deg, ${ACCENT_FROM}, ${ACCENT_TO})` }}
            >
              <Download size={36} />
            </div>
            <div>
              <p className="font-bold text-lg">Rip any track</p>
              <p className="text-sm text-white/40 mt-1">Paste a YouTube or SoundCloud URL above<br />and download it as MP3 instantly.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
