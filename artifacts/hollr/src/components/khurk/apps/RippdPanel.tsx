/**
 * RippdPanel — rip MP3s from YouTube & SoundCloud links via yt-dlp
 * Six built-in themes, persisted to localStorage.
 */
import { useState, useRef, useCallback } from 'react';
import {
  Download, Music2, X, Clock, ExternalLink, Clipboard,
  Loader2, CheckCircle2, AlertCircle, Palette,
} from 'lucide-react';
import type { NativePanelProps } from '@/lib/khurk-apps';
import { cn } from '@/lib/utils';

const BASE = import.meta.env.BASE_URL;

// ── Themes ────────────────────────────────────────────────────────────────────

interface RippdTheme {
  id: string;
  label: string;
  bg: string;
  surface: string;
  border: string;
  fg: string;
  muted: string;
  accentFrom: string;
  accentTo: string;
  inputBg: string;
  errorBg: string;
  errorBorder: string;
  errorFg: string;
  badgeYtBg: string;
  badgeYtFg: string;
  badgeScBg: string;
  badgeScFg: string;
  historyBg: string;
  historyHover: string;
  emptyFg: string;
}

const THEMES: RippdTheme[] = [
  {
    id: 'dark',
    label: 'Dark',
    bg: '#0f0f11',
    surface: 'rgba(255,255,255,0.05)',
    border: 'rgba(255,255,255,0.10)',
    fg: '#ffffff',
    muted: 'rgba(255,255,255,0.40)',
    accentFrom: '#c026d3',
    accentTo: '#06b6d4',
    inputBg: 'rgba(255,255,255,0.05)',
    errorBg: 'rgba(239,68,68,0.10)',
    errorBorder: 'rgba(239,68,68,0.20)',
    errorFg: '#fca5a5',
    badgeYtBg: 'rgba(239,68,68,0.20)',
    badgeYtFg: '#f87171',
    badgeScBg: 'rgba(249,115,22,0.20)',
    badgeScFg: '#fb923c',
    historyBg: 'rgba(255,255,255,0.04)',
    historyHover: 'rgba(255,255,255,0.08)',
    emptyFg: 'rgba(255,255,255,0.40)',
  },
  {
    id: 'light',
    label: 'Light',
    bg: '#f4f4f8',
    surface: '#ffffff',
    border: 'rgba(0,0,0,0.08)',
    fg: '#18181b',
    muted: 'rgba(0,0,0,0.45)',
    accentFrom: '#7c3aed',
    accentTo: '#0ea5e9',
    inputBg: '#ffffff',
    errorBg: 'rgba(239,68,68,0.08)',
    errorBorder: 'rgba(239,68,68,0.22)',
    errorFg: '#dc2626',
    badgeYtBg: 'rgba(239,68,68,0.12)',
    badgeYtFg: '#dc2626',
    badgeScBg: 'rgba(249,115,22,0.12)',
    badgeScFg: '#ea580c',
    historyBg: 'rgba(0,0,0,0.03)',
    historyHover: 'rgba(0,0,0,0.07)',
    emptyFg: 'rgba(0,0,0,0.40)',
  },
  {
    id: 'midnight',
    label: 'Midnight',
    bg: '#080c1a',
    surface: 'rgba(99,120,255,0.07)',
    border: 'rgba(99,120,255,0.15)',
    fg: '#e0e8ff',
    muted: 'rgba(160,180,255,0.45)',
    accentFrom: '#4f46e5',
    accentTo: '#818cf8',
    inputBg: 'rgba(99,120,255,0.08)',
    errorBg: 'rgba(239,68,68,0.10)',
    errorBorder: 'rgba(239,68,68,0.20)',
    errorFg: '#fca5a5',
    badgeYtBg: 'rgba(239,68,68,0.18)',
    badgeYtFg: '#fca5a5',
    badgeScBg: 'rgba(249,115,22,0.18)',
    badgeScFg: '#fdba74',
    historyBg: 'rgba(99,120,255,0.05)',
    historyHover: 'rgba(99,120,255,0.10)',
    emptyFg: 'rgba(160,180,255,0.40)',
  },
  {
    id: 'sunset',
    label: 'Sunset',
    bg: '#12060a',
    surface: 'rgba(255,100,50,0.07)',
    border: 'rgba(255,100,50,0.15)',
    fg: '#ffe8d6',
    muted: 'rgba(255,180,120,0.50)',
    accentFrom: '#f97316',
    accentTo: '#ec4899',
    inputBg: 'rgba(255,100,50,0.08)',
    errorBg: 'rgba(239,68,68,0.10)',
    errorBorder: 'rgba(239,68,68,0.20)',
    errorFg: '#fca5a5',
    badgeYtBg: 'rgba(239,68,68,0.20)',
    badgeYtFg: '#fca5a5',
    badgeScBg: 'rgba(249,115,22,0.20)',
    badgeScFg: '#fdba74',
    historyBg: 'rgba(255,100,50,0.05)',
    historyHover: 'rgba(255,100,50,0.10)',
    emptyFg: 'rgba(255,180,120,0.45)',
  },
  {
    id: 'forest',
    label: 'Forest',
    bg: '#060f09',
    surface: 'rgba(34,197,94,0.07)',
    border: 'rgba(34,197,94,0.14)',
    fg: '#d1fae5',
    muted: 'rgba(110,231,183,0.50)',
    accentFrom: '#16a34a',
    accentTo: '#4ade80',
    inputBg: 'rgba(34,197,94,0.07)',
    errorBg: 'rgba(239,68,68,0.10)',
    errorBorder: 'rgba(239,68,68,0.20)',
    errorFg: '#fca5a5',
    badgeYtBg: 'rgba(239,68,68,0.18)',
    badgeYtFg: '#fca5a5',
    badgeScBg: 'rgba(249,115,22,0.18)',
    badgeScFg: '#fdba74',
    historyBg: 'rgba(34,197,94,0.05)',
    historyHover: 'rgba(34,197,94,0.10)',
    emptyFg: 'rgba(110,231,183,0.45)',
  },
  {
    id: 'neon',
    label: 'Neon',
    bg: '#000000',
    surface: 'rgba(163,230,53,0.06)',
    border: 'rgba(163,230,53,0.15)',
    fg: '#f0ffd4',
    muted: 'rgba(163,230,53,0.55)',
    accentFrom: '#84cc16',
    accentTo: '#facc15',
    inputBg: 'rgba(163,230,53,0.06)',
    errorBg: 'rgba(239,68,68,0.10)',
    errorBorder: 'rgba(239,68,68,0.22)',
    errorFg: '#fca5a5',
    badgeYtBg: 'rgba(239,68,68,0.18)',
    badgeYtFg: '#fca5a5',
    badgeScBg: 'rgba(249,115,22,0.18)',
    badgeScFg: '#fdba74',
    historyBg: 'rgba(163,230,53,0.04)',
    historyHover: 'rgba(163,230,53,0.09)',
    emptyFg: 'rgba(163,230,53,0.45)',
  },
];

const THEME_KEY = 'rippd:theme';

function getStoredTheme(): RippdTheme {
  try {
    const id = localStorage.getItem(THEME_KEY);
    return THEMES.find(t => t.id === id) ?? THEMES[0];
  } catch { return THEMES[0]; }
}

// ── Types ─────────────────────────────────────────────────────────────────────

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
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type RipStage = 'idle' | 'processing' | 'downloading' | 'ready';

// ── Component ─────────────────────────────────────────────────────────────────

export function RippdPanel(_props: NativePanelProps) {
  const [theme, setTheme]       = useState<RippdTheme>(getStoredTheme);
  const [showThemes, setShowThemes] = useState(false);
  const [url, setUrl]           = useState('');
  const [track, setTrack]       = useState<TrackInfo | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [ripStage, setRipStage] = useState<RipStage>('idle');
  const [history, setHistory]   = useState<RipHistory[]>(getHistory);
  const abortRef = useRef<AbortController | null>(null);

  const T = theme;
  const accentStyle = { background: `linear-gradient(135deg, ${T.accentFrom}, ${T.accentTo})` };
  const accentText  = { background: `linear-gradient(90deg,${T.accentFrom},${T.accentTo})`, WebkitBackgroundClip: 'text' as const, WebkitTextFillColor: 'transparent' as const };

  const applyTheme = (t: RippdTheme) => {
    setTheme(t);
    setShowThemes(false);
    try { localStorage.setItem(THEME_KEY, t.id); } catch {}
  };

  const reset = () => { setTrack(null); setUrl(''); setError(null); setRipStage('idle'); };

  const resolveUrl = useCallback(async (rawUrl: string) => {
    const trimmed = rawUrl.trim();
    if (!trimmed) return;
    setError(null);
    setTrack(null);
    setRipStage('idle');
    setResolving(true);
    try {
      const res = await fetch(`${BASE}api/rippd/info?url=${encodeURIComponent(trimmed)}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to resolve');
      setTrack(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setResolving(false);
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
    setError(null);
    setRipStage('processing');
    abortRef.current = new AbortController();
    try {
      const audioRes = await fetch(`${BASE}api/rippd/audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url: url.trim() }),
        signal: abortRef.current.signal,
      });
      const audioData = await audioRes.json();
      if (!audioRes.ok) throw new Error(audioData.error ?? 'Processing failed');

      const { token, filename } = audioData as { token: string; filename: string };
      setRipStage('downloading');

      const fileRes = await fetch(`${BASE}api/rippd/file/${token}`, {
        credentials: 'include',
        signal: abortRef.current.signal,
      });
      if (!fileRes.ok) {
        const d = await fileRes.json().catch(() => ({}));
        throw new Error((d as any).error ?? 'Download failed');
      }

      const blob = await fileRes.blob();
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
      setRipStage('ready');
    } catch (e: any) {
      if (e.name !== 'AbortError') { setError(e.message); setRipStage('idle'); }
    } finally {
      abortRef.current = null;
    }
  }, [track, url]);

  const busy = ripStage === 'processing' || ripStage === 'downloading';

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: T.bg, color: T.fg }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-5 pt-5 pb-4"
           style={{ background: `linear-gradient(135deg, ${T.accentFrom}18, ${T.accentTo}18)` }}>

        {/* Top row: logo + theme picker */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg" style={accentStyle}>
            <Download size={20} className="text-white" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold tracking-widest uppercase" style={accentText}>RIPPD</p>
            <p className="text-[11px] leading-tight" style={{ color: T.muted }}>Paste a YouTube or SoundCloud link to rip MP3</p>
          </div>

          {/* Theme toggle */}
          <div className="relative">
            <button
              onClick={() => setShowThemes(v => !v)}
              className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
              style={{ background: T.surface, border: `1px solid ${T.border}` }}
              title="Choose theme"
            >
              <Palette size={14} style={{ color: T.muted }} />
            </button>

            {showThemes && (
              <div
                className="absolute right-0 top-10 z-50 rounded-2xl shadow-2xl p-2 flex flex-col gap-1 min-w-[130px]"
                style={{ background: T.bg === '#f4f4f8' ? '#fff' : '#1a1a1a', border: `1px solid ${T.border}` }}
              >
                {THEMES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => applyTheme(t)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-semibold transition-all"
                    style={{
                      color: t.id === theme.id ? t.accentFrom : T.fg,
                      background: t.id === theme.id ? `${T.accentFrom}18` : 'transparent',
                    }}
                  >
                    {/* Color swatch */}
                    <span
                      className="w-4 h-4 rounded-full shrink-0"
                      style={{ background: `linear-gradient(135deg, ${t.accentFrom}, ${t.accentTo})` }}
                    />
                    {t.label}
                    {t.id === theme.id && <span className="ml-auto text-[9px] opacity-60">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* URL input */}
        <div className="flex gap-2">
          <div className="flex-1 flex items-center rounded-xl px-3 gap-2 transition-colors"
               style={{ background: T.inputBg, border: `1px solid ${T.border}` }}>
            <Music2 size={14} style={{ color: T.muted }} className="shrink-0" />
            <input
              value={url}
              onChange={e => { setUrl(e.target.value); setTrack(null); setRipStage('idle'); setError(null); }}
              onKeyDown={e => e.key === 'Enter' && resolveUrl(url)}
              placeholder="https://youtube.com/watch?v=... or soundcloud.com/..."
              className="flex-1 bg-transparent text-sm outline-none py-2.5 min-w-0"
              style={{ color: T.fg }}
            />
            {url && (
              <button onClick={reset} style={{ color: T.muted }} className="hover:opacity-80 transition-opacity">
                <X size={14} />
              </button>
            )}
          </div>
          <button
            onClick={handlePaste}
            className="shrink-0 px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all hover:opacity-80"
            style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.muted }}
          >
            <Clipboard size={13} /> Paste
          </button>
          <button
            onClick={() => resolveUrl(url)}
            disabled={!url.trim() || resolving || busy}
            className="shrink-0 px-4 py-2 rounded-xl font-semibold text-sm disabled:opacity-40 transition-all flex items-center gap-1.5 text-white"
            style={accentStyle}
          >
            {resolving ? <Loader2 size={14} className="animate-spin" /> : 'Resolve'}
          </button>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 no-scrollbar" onClick={() => showThemes && setShowThemes(false)}>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 rounded-xl p-4"
               style={{ background: T.errorBg, border: `1px solid ${T.errorBorder}` }}>
            <AlertCircle size={16} style={{ color: T.errorFg }} className="mt-0.5 shrink-0" />
            <p className="text-sm break-words" style={{ color: T.errorFg }}>{error}</p>
          </div>
        )}

        {/* Skeleton */}
        {resolving && (
          <div className="rounded-2xl p-4 flex gap-4 animate-pulse"
               style={{ background: T.surface, border: `1px solid ${T.border}` }}>
            <div className="w-20 h-20 rounded-xl shrink-0" style={{ background: T.border }} />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-4 rounded w-3/4" style={{ background: T.border }} />
              <div className="h-3 rounded w-1/2" style={{ background: T.border }} />
              <div className="h-3 rounded w-1/4" style={{ background: T.border }} />
            </div>
          </div>
        )}

        {/* Track card */}
        {track && !resolving && (
          <div className="rounded-2xl overflow-hidden"
               style={{ background: T.surface, border: `1px solid ${T.border}` }}>
            <div className="flex gap-4 p-4">
              <div className="shrink-0 w-20 h-20 rounded-xl overflow-hidden" style={{ background: T.border }}>
                {track.thumbnail
                  ? <img src={track.thumbnail} alt={track.title} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"><Music2 size={28} style={{ color: T.muted }} /></div>
                }
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                {/* Source badge */}
                <span className="self-start text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                      style={track.source === 'youtube'
                        ? { background: T.badgeYtBg, color: T.badgeYtFg }
                        : { background: T.badgeScBg, color: T.badgeScFg }}>
                  {track.source === 'youtube' ? 'YouTube' : 'SoundCloud'}
                </span>
                <p className="font-semibold text-sm leading-tight truncate" style={{ color: T.fg }}>{track.title}</p>
                <p className="text-xs truncate" style={{ color: T.muted }}>{track.artist}</p>
                {track.duration > 0 && <p className="text-[11px]" style={{ color: T.muted }}>{fmtDuration(track.duration)}</p>}
              </div>
            </div>

            <div className="px-4 pb-4">
              {ripStage === 'ready' ? (
                <div className="flex items-center gap-2 justify-center py-2.5 rounded-xl text-sm font-semibold"
                     style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.22)', color: '#4ade80' }}>
                  <CheckCircle2 size={15} /> Download saved!
                </div>
              ) : ripStage === 'processing' ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white"
                       style={{ background: `linear-gradient(135deg, ${T.accentFrom}33, ${T.accentTo}33)` }}>
                    <Loader2 size={14} className="animate-spin" /> Converting audio…
                  </div>
                  <p className="text-center text-[11px]" style={{ color: T.muted }}>This usually takes 5–15 seconds</p>
                </div>
              ) : ripStage === 'downloading' ? (
                <div className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white"
                     style={{ background: `linear-gradient(135deg, ${T.accentFrom}33, ${T.accentTo}33)` }}>
                  <Loader2 size={14} className="animate-spin" /> Downloading…
                </div>
              ) : (
                <button
                  onClick={handleRip}
                  disabled={busy}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm disabled:opacity-60 transition-all active:scale-95 text-white"
                  style={accentStyle}
                >
                  <Download size={14} /> Rip It
                </button>
              )}
            </div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div>
            <p className="text-[11px] font-bold tracking-widest uppercase mb-2" style={{ color: T.muted }}>Recent Rips</p>
            <div className="space-y-1.5">
              {history.map(h => (
                <div key={h.id}
                     className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-pointer group"
                     style={{ background: T.historyBg, border: `1px solid ${T.border}` }}
                     onMouseEnter={e => (e.currentTarget.style.background = T.historyHover)}
                     onMouseLeave={e => (e.currentTarget.style.background = T.historyBg)}
                     onClick={() => { setUrl(h.url); resolveUrl(h.url); }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                       style={{ background: `linear-gradient(135deg, ${T.accentFrom}55, ${T.accentTo}55)` }}>
                    <Music2 size={12} style={{ color: T.fg }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: T.fg }}>{h.title}</p>
                    <p className="text-[11px] truncate" style={{ color: T.muted }}>{h.artist}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                          style={h.source === 'youtube'
                            ? { background: T.badgeYtBg, color: T.badgeYtFg }
                            : { background: T.badgeScBg, color: T.badgeScFg }}>
                      {h.source === 'youtube' ? 'YT' : 'SC'}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); window.open(h.url, '_blank'); }}
                      className="opacity-0 group-hover:opacity-100 p-1 transition-opacity"
                      style={{ color: T.muted }}
                    >
                      <ExternalLink size={11} />
                    </button>
                    <div className="flex items-center gap-1 text-[10px]" style={{ color: T.muted }}>
                      <Clock size={10} />
                      {new Date(h.rippedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => { saveHistory([]); setHistory([]); }}
              className="mt-2 text-[11px] transition-opacity hover:opacity-70"
              style={{ color: T.muted }}
            >
              Clear history
            </button>
          </div>
        )}

        {/* Empty state */}
        {!track && !resolving && !error && history.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-2xl" style={accentStyle}>
              <Download size={36} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-lg" style={{ color: T.fg }}>Rip any track</p>
              <p className="text-sm mt-1" style={{ color: T.emptyFg }}>
                Paste a YouTube or SoundCloud URL above<br />and download it as MP3 instantly.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
