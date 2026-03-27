/**
 * PlaydPanel — foobar2000-style local music player
 * File System Access API · Web Audio API EQ · Media Session API · Spectrum visualizer
 * Uses jsmediatags for ID3/FLAC/Vorbis metadata parsing
 */
import { useState, useEffect, useCallback, useRef, useMemo, useReducer } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Repeat, Repeat1, Shuffle, Music, Library, Disc, User,
  ListMusic, Search, FolderOpen, Sliders, ChevronRight,
  ChevronDown, ChevronUp, Loader2, Music2, X, MoreHorizontal,
  GalleryHorizontalEnd, Tag,
} from 'lucide-react';
import * as jsmediatags from 'jsmediatags';
import type { NativePanelProps } from '@/lib/khurk-apps';
import { cn } from '@/lib/utils';

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface Track {
  id: string;
  path: string;
  filename: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  duration: number;
  fileHandle: FileSystemFileHandle;
  addedAt: number;
  artDataUrl?: string;
}

type LibraryView =
  | 'all' | 'artists' | 'albums' | 'recently-added' | 'genres'
  | { type: 'artist'; name: string }
  | { type: 'album'; name: string }
  | { type: 'genre'; name: string };

type RepeatMode = 'none' | 'all' | 'one';
type SortField = 'title' | 'artist' | 'album' | 'duration';
type SortDir = 'asc' | 'desc';

/* ─── Constants ───────────────────────────────────────────────────────────── */
const EQ_FREQS = [60, 120, 250, 500, 1000, 2000, 4000, 8000, 12000, 16000];
const EQ_LABELS = ['60', '120', '250', '500', '1k', '2k', '4k', '8k', '12k', '16k'];
const ACCENT = '#f07020';
const AUDIO_EXTS = /\.(mp3|flac|wav|ogg|aac|m4a|opus|wma|aiff)$/i;

/* ─── jsmediatags wrapper (ID3v1/v2, FLAC, OGG Vorbis) ──────────────────── */
type TagMeta = Partial<Pick<Track, 'title' | 'artist' | 'album' | 'genre' | 'artDataUrl'>>;

function readAudioMetadata(file: File): Promise<TagMeta> {
  return new Promise((resolve) => {
    try {
      jsmediatags.read(file, {
        onSuccess: (tag) => {
          const t = tag.tags;
          let artDataUrl: string | undefined;
          if (t.picture) {
            try {
              const bytes = new Uint8Array(t.picture.data);
              const blob = new Blob([bytes], { type: t.picture.format || 'image/jpeg' });
              artDataUrl = URL.createObjectURL(blob);
            } catch { /* ignore */ }
          }
          resolve({
            title: t.title || undefined,
            artist: t.artist || undefined,
            album: t.album || undefined,
            genre: t.genre
              ? (t.genre.replace(/^\((\d+)\)$/, (_, n) => ID3_GENRES[parseInt(n, 10)] ?? '').trim() || t.genre)
              : undefined,
            artDataUrl,
          });
        },
        onError: () => resolve({}),
      });
    } catch { resolve({}); }
  });
}

/* ID3v1 numeric genre lookup table (subset) */
const ID3_GENRES: Record<number, string> = {
  0:'Blues',1:'Classic Rock',2:'Country',3:'Dance',4:'Disco',5:'Funk',6:'Grunge',7:'Hip-Hop',
  8:'Jazz',9:'Metal',10:'New Age',11:'Oldies',12:'Other',13:'Pop',14:'R&B',15:'Rap',16:'Reggae',
  17:'Rock',18:'Techno',19:'Industrial',20:'Alternative',21:'Ska',22:'Death Metal',23:'Pranks',
  24:'Soundtrack',25:'Euro-Techno',26:'Ambient',27:'Trip-Hop',28:'Vocal',29:'Jazz+Funk',
  30:'Fusion',31:'Trance',32:'Classical',33:'Instrumental',34:'Acid',35:'House',36:'Game',
  37:'Sound Clip',38:'Gospel',39:'Noise',40:'AlternRock',41:'Bass',42:'Soul',43:'Punk',
  44:'Space',45:'Meditative',46:'Instrumental Pop',47:'Instrumental Rock',48:'Ethnic',
  49:'Gothic',50:'Darkwave',51:'Techno-Industrial',52:'Electronic',53:'Pop-Folk',
  54:'Eurodance',55:'Dream',56:'Southern Rock',57:'Comedy',58:'Cult',59:'Gangsta',
  60:'Top 40',61:'Christian Rap',62:'Pop/Funk',63:'Jungle',64:'Native American',65:'Cabaret',
  66:'New Wave',67:'Psychedelic',68:'Rave',69:'Showtunes',70:'Trailer',71:'Lo-Fi',
  72:'Tribal',73:'Acid Punk',74:'Acid Jazz',75:'Polka',76:'Retro',77:'Musical',
  78:'Rock & Roll',79:'Hard Rock',
};

/* ─── Filename / path metadata parser ────────────────────────────────────── */
function parseFilename(filename: string, pathParts: string[]): { title: string; artist: string; album: string } {
  const base = filename.replace(/\.[^.]+$/, '').replace(/^\d+[\s._-]+/, '');
  const match = base.match(/^(.+?)\s*[-–]\s*(.+)$/);
  const title = match ? match[2].trim() : base.trim();
  const artist = match ? match[1].trim()
    : pathParts.length >= 2 ? pathParts[pathParts.length - 2]
    : 'Unknown Artist';
  const album = pathParts.length >= 2 ? pathParts[pathParts.length - 2]
    : pathParts.length === 1 ? pathParts[0]
    : 'Unknown Album';
  return { title: title || filename, artist, album };
}

function formatDuration(sec: number) {
  if (!isFinite(sec) || sec < 0) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/* ─── Recursive audio file scanner ───────────────────────────────────────── */
async function scanAudioFiles(
  dir: FileSystemDirectoryHandle,
  pathParts: string[],
  out: Array<{ handle: FileSystemFileHandle; pathParts: string[] }>,
): Promise<void> {
  for await (const entry of dir.values()) {
    if (entry.name.startsWith('.')) continue;
    if (entry.kind === 'file' && AUDIO_EXTS.test(entry.name)) {
      out.push({ handle: entry as FileSystemFileHandle, pathParts: [...pathParts] });
    } else if (entry.kind === 'directory') {
      await scanAudioFiles(entry as FileSystemDirectoryHandle, [...pathParts, entry.name], out);
    }
  }
}

/* ─── Player state ─────────────────────────────────────────────────────────── */
interface PlayerState {
  tracks: Track[];
  queue: Track[];
  currentIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  eqGains: number[];
  eqOpen: boolean;
  scanning: boolean;
  scanDone: number;
  scanTotal: number;
  libraryView: LibraryView;
  sortField: SortField;
  sortDir: SortDir;
  search: string;
  selectedTrackId: string | null;
  sidebarOpen: boolean;
}

type PlayerAction =
  | { type: 'SET_TRACKS'; tracks: Track[] }
  | { type: 'SET_QUEUE'; queue: Track[]; index: number }
  | { type: 'SET_PLAYING'; playing: boolean }
  | { type: 'SET_TIME'; currentTime: number; duration: number }
  | { type: 'SET_VOLUME'; volume: number }
  | { type: 'SET_MUTED'; muted: boolean }
  | { type: 'TOGGLE_SHUFFLE' }
  | { type: 'CYCLE_REPEAT' }
  | { type: 'SET_EQ_GAIN'; band: number; gain: number }
  | { type: 'RESET_EQ' }
  | { type: 'TOGGLE_EQ' }
  | { type: 'SET_SCANNING'; scanning: boolean; total?: number }
  | { type: 'SCAN_PROGRESS'; done: number }
  | { type: 'SET_LIBRARY_VIEW'; view: LibraryView }
  | { type: 'SET_SORT'; field: SortField; dir: SortDir }
  | { type: 'SET_SEARCH'; search: string }
  | { type: 'SELECT_TRACK'; id: string | null }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'NEXT_TRACK' }
  | { type: 'PREV_TRACK' };

function buildInitialState(storagePrefix: string): PlayerState {
  const stored = {
    volume: parseFloat(localStorage.getItem(`${storagePrefix}:vol`) ?? '0.8'),
    eqGains: (() => {
      try { return JSON.parse(localStorage.getItem(`${storagePrefix}:eq`) ?? 'null') ?? new Array(10).fill(0); }
      catch { return new Array(10).fill(0); }
    })(),
    sidebar: localStorage.getItem(`${storagePrefix}:sidebar`) !== '0',
  };
  return {
    tracks: [], queue: [], currentIndex: -1,
    isPlaying: false, currentTime: 0, duration: 0,
    volume: stored.volume, isMuted: false,
    shuffle: false, repeat: 'none',
    eqGains: stored.eqGains, eqOpen: false,
    scanning: false, scanDone: 0, scanTotal: 0,
    libraryView: 'all',
    sortField: 'title', sortDir: 'asc',
    search: '', selectedTrackId: null,
    sidebarOpen: stored.sidebar,
  };
}

function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'SET_TRACKS': return { ...state, tracks: action.tracks };
    case 'SET_QUEUE': return { ...state, queue: action.queue, currentIndex: action.index };
    case 'SET_PLAYING': return { ...state, isPlaying: action.playing };
    case 'SET_TIME': return { ...state, currentTime: action.currentTime, duration: action.duration };
    case 'SET_VOLUME': return { ...state, volume: action.volume };
    case 'SET_MUTED': return { ...state, isMuted: action.muted };
    case 'TOGGLE_SHUFFLE': return { ...state, shuffle: !state.shuffle };
    case 'CYCLE_REPEAT': {
      const next: RepeatMode = state.repeat === 'none' ? 'all' : state.repeat === 'all' ? 'one' : 'none';
      return { ...state, repeat: next };
    }
    case 'SET_EQ_GAIN': {
      const gains = [...state.eqGains];
      gains[action.band] = action.gain;
      return { ...state, eqGains: gains };
    }
    case 'RESET_EQ': return { ...state, eqGains: new Array(10).fill(0) };
    case 'TOGGLE_EQ': return { ...state, eqOpen: !state.eqOpen };
    case 'SET_SCANNING': return {
      ...state, scanning: action.scanning,
      scanDone: 0, scanTotal: action.total ?? 0,
    };
    case 'SCAN_PROGRESS': return { ...state, scanDone: action.done };
    case 'SET_LIBRARY_VIEW': return { ...state, libraryView: action.view };
    case 'SET_SORT': return { ...state, sortField: action.field, sortDir: action.dir };
    case 'SET_SEARCH': return { ...state, search: action.search };
    case 'SELECT_TRACK': return { ...state, selectedTrackId: action.id };
    case 'TOGGLE_SIDEBAR': return { ...state, sidebarOpen: !state.sidebarOpen };
    case 'NEXT_TRACK': {
      if (state.queue.length === 0) return state;
      let next = state.currentIndex + 1;
      if (next >= state.queue.length) next = state.repeat === 'all' ? 0 : state.currentIndex;
      return { ...state, currentIndex: next };
    }
    case 'PREV_TRACK': {
      if (state.queue.length === 0) return state;
      let prev = state.currentIndex - 1;
      if (prev < 0) prev = state.repeat === 'all' ? state.queue.length - 1 : 0;
      return { ...state, currentIndex: prev };
    }
    default: return state;
  }
}

/* ─── Album art gradient fallback ────────────────────────────────────────── */
function artistColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return `hsl(${Math.abs(h) % 360}, 60%, 35%)`;
}

/* ─── Fisher-Yates shuffle ───────────────────────────────────────────────── */
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ─── SortableHeader ─────────────────────────────────────────────────────── */
function SortHeader({
  field, label, currentField, currentDir, onSort,
}: {
  field: SortField; label: string; currentField: SortField; currentDir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const active = field === currentField;
  return (
    <button
      onClick={() => onSort(field)}
      className="flex items-center gap-0.5 hover:text-white transition-colors"
      style={{ color: active ? '#f07020' : undefined }}
    >
      {label}
      {active && (currentDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export function PlaydPanel({ storagePrefix, dirHandle, onPickFolder }: NativePanelProps) {
  /* ── State ── */
  const [state, dispatch] = useReducer(playerReducer, storagePrefix, buildInitialState);
  const { tracks, queue, currentIndex, isPlaying, currentTime, duration,
    volume, isMuted, shuffle, repeat, eqGains, eqOpen, scanning,
    scanDone, scanTotal, libraryView, sortField, sortDir, search,
    selectedTrackId, sidebarOpen } = state;

  const currentTrack = queue[currentIndex] ?? null;

  /* ── Audio refs ── */
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const eqNodesRef = useRef<BiquadFilterNode[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const objectUrlsRef = useRef<Map<string, string>>(new Map());
  const artUrlsRef = useRef<string[]>([]);
  const didSetupAudio = useRef(false);
  const prevDirRef = useRef<FileSystemDirectoryHandle | null>(null);
  const playerBarRef = useRef<HTMLDivElement>(null);
  /* live-value refs to avoid stale closures in audio callbacks */
  const volumeRef = useRef(volume);
  const isMutedRef = useRef(isMuted);
  const eqGainsRef = useRef(eqGains);
  const repeatRef = useRef(repeat);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { eqGainsRef.current = eqGains; }, [eqGains]);
  useEffect(() => { repeatRef.current = repeat; }, [repeat]);

  /* ── Init HTMLAudioElement ── */
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audioRef.current = audio;

    audio.addEventListener('timeupdate', () => {
      dispatch({ type: 'SET_TIME', currentTime: audio.currentTime, duration: audio.duration || 0 });
    });
    audio.addEventListener('loadedmetadata', () => {
      dispatch({ type: 'SET_TIME', currentTime: 0, duration: audio.duration || 0 });
    });
    audio.addEventListener('ended', () => {
      if (repeatRef.current === 'one') {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        dispatch({ type: 'NEXT_TRACK' });
      }
    });
    audio.addEventListener('play', () => dispatch({ type: 'SET_PLAYING', playing: true }));
    audio.addEventListener('pause', () => dispatch({ type: 'SET_PLAYING', playing: false }));

    return () => {
      audio.pause();
      audio.src = '';
      cancelAnimationFrame(animFrameRef.current);
      audioCtxRef.current?.close();
    };
  }, []);

  /* ── Web Audio chain ── */
  const setupAudioChain = useCallback(() => {
    if (didSetupAudio.current || !audioRef.current) return;
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaElementSource(audioRef.current);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const gainNode = ctx.createGain();
      gainNode.gain.value = isMutedRef.current ? 0 : volumeRef.current;

      const eqNodes = EQ_FREQS.map((freq, i) => {
        const node = ctx.createBiquadFilter();
        node.type = 'peaking';
        node.frequency.value = freq;
        node.Q.value = 1.4;
        node.gain.value = eqGainsRef.current[i];
        return node;
      });

      let chain: AudioNode = source;
      for (const eq of eqNodes) { chain.connect(eq); chain = eq; }
      chain.connect(analyser);
      analyser.connect(gainNode);
      gainNode.connect(ctx.destination);

      audioCtxRef.current = ctx;
      sourceNodeRef.current = source;
      eqNodesRef.current = eqNodes;
      analyserRef.current = analyser;
      gainNodeRef.current = gainNode;
      didSetupAudio.current = true;
    } catch (e) { console.warn('[Playd] Audio chain setup failed:', e); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Volume / mute sync ── */
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = isMuted ? 0 : volume;
    } else if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
    localStorage.setItem(`${storagePrefix}:vol`, String(volume));
  }, [volume, isMuted, storagePrefix]);

  /* ── EQ sync ── */
  useEffect(() => {
    eqNodesRef.current.forEach((node, i) => {
      node.gain.value = eqGains[i];
    });
    localStorage.setItem(`${storagePrefix}:eq`, JSON.stringify(eqGains));
  }, [eqGains, storagePrefix]);

  /* ── Spectrum visualizer ── */
  useEffect(() => {
    let running = true;
    const draw = () => {
      if (!running) return;
      animFrameRef.current = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const analyser = analyserRef.current;
      if (!canvas || !analyser) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const bufLen = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufLen);
      analyser.getByteFrequencyData(dataArray);

      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const barW = (W / bufLen) * 2;
      let x = 0;
      for (let i = 0; i < bufLen; i++) {
        const barH = (dataArray[i] / 255) * H;
        const alpha = 0.6 + (dataArray[i] / 255) * 0.4;
        ctx.fillStyle = `rgba(240, 112, 32, ${alpha})`;
        ctx.fillRect(x, H - barH, barW - 1, barH);
        x += barW;
      }
    };
    draw();
    return () => { running = false; cancelAnimationFrame(animFrameRef.current); };
  }, []);

  /* ── Scan directory when dirHandle changes ── */
  useEffect(() => {
    if (!dirHandle || dirHandle === prevDirRef.current) return;
    prevDirRef.current = dirHandle;

    let cancelled = false;
    const artUrls: string[] = [];

    async function scan() {
      dispatch({ type: 'SET_SCANNING', scanning: true });
      const found: Array<{ handle: FileSystemFileHandle; pathParts: string[] }> = [];
      try {
        await scanAudioFiles(dirHandle!, [], found);
      } catch (e) {
        console.warn('[Playd] scan failed:', e);
        dispatch({ type: 'SET_SCANNING', scanning: false });
        return;
      }

      if (cancelled) return;
      dispatch({ type: 'SET_SCANNING', scanning: true, total: found.length });

      const newTracks: Track[] = [];
      for (let i = 0; i < found.length; i++) {
        if (cancelled) break;
        const { handle, pathParts } = found[i];
        const filename = handle.name;

        let meta: Partial<Pick<Track, 'title' | 'artist' | 'album' | 'genre' | 'artDataUrl'>> = {};
        let fileDuration = 0;
        try {
          const file = await handle.getFile();
          meta = await readAudioMetadata(file);
          if (meta.artDataUrl) artUrls.push(meta.artDataUrl);

          const url = URL.createObjectURL(file);
          objectUrlsRef.current.set(filename + i, url);
          await new Promise<void>((res) => {
            const tmp = new Audio(url);
            tmp.preload = 'metadata';
            tmp.onloadedmetadata = () => { fileDuration = tmp.duration || 0; res(); };
            tmp.onerror = () => res();
            setTimeout(res, 2000);
          });
          URL.revokeObjectURL(url);
        } catch { /* non-fatal */ }

        const fallback = parseFilename(filename, pathParts);
        const track: Track = {
          id: `${pathParts.join('/')}/${filename}-${i}`,
          path: [...pathParts, filename].join('/'),
          filename,
          title: meta.title || fallback.title,
          artist: meta.artist || fallback.artist,
          album: meta.album || fallback.album,
          genre: meta.genre || '',
          duration: fileDuration,
          fileHandle: handle,
          addedAt: Date.now() + i,
          artDataUrl: meta.artDataUrl,
        };
        newTracks.push(track);
        dispatch({ type: 'SCAN_PROGRESS', done: i + 1 });
      }

      if (!cancelled) {
        artUrlsRef.current.forEach(u => { try { URL.revokeObjectURL(u); } catch {} });
        artUrlsRef.current = artUrls;
        dispatch({ type: 'SET_TRACKS', tracks: newTracks });
        dispatch({ type: 'SET_SCANNING', scanning: false });
      }
    }

    scan();
    return () => { cancelled = true; };
  }, [dirHandle]);

  /* ── Track playback when currentIndex changes ── */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    let url: string | null = null;
    (async () => {
      try {
        const file = await currentTrack.fileHandle.getFile();
        url = URL.createObjectURL(file);
        audio.src = url;
        audio.load();
        setupAudioChain();
        if (audioCtxRef.current?.state === 'suspended') {
          await audioCtxRef.current.resume();
        }
        await audio.play();
        dispatch({ type: 'SET_PLAYING', playing: true });
      } catch (e) {
        console.warn('[Playd] playback error:', e);
      }
    })();

    return () => {
      if (url) setTimeout(() => { try { URL.revokeObjectURL(url!); } catch {} }, 5000);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, currentTrack?.id]);

  /* ── Media Session API ── */
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album,
      artwork: currentTrack.artDataUrl
        ? [{ src: currentTrack.artDataUrl }]
        : [],
    });
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    navigator.mediaSession.setActionHandler('play', () => audioRef.current?.play());
    navigator.mediaSession.setActionHandler('pause', () => audioRef.current?.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => dispatch({ type: 'PREV_TRACK' }));
    navigator.mediaSession.setActionHandler('nexttrack', () => dispatch({ type: 'NEXT_TRACK' }));
  }, [currentTrack, isPlaying]);

  /* ── Sidebar persistence ── */
  useEffect(() => {
    localStorage.setItem(`${storagePrefix}:sidebar`, sidebarOpen ? '1' : '0');
  }, [sidebarOpen, storagePrefix]);

  /* ── Computed: filtered + sorted track list for current view ── */
  const filteredTracks = useMemo(() => {
    let list = [...tracks];

    if (typeof libraryView === 'object') {
      if (libraryView.type === 'artist') list = list.filter(t => t.artist === libraryView.name);
      else if (libraryView.type === 'album') list = list.filter(t => t.album === libraryView.name);
      else if (libraryView.type === 'genre') list = list.filter(t => t.genre === libraryView.name);
    } else if (libraryView === 'recently-added') {
      list = list.sort((a, b) => b.addedAt - a.addedAt).slice(0, 50);
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q)
      );
    }

    if (libraryView !== 'recently-added') {
      list.sort((a, b) => {
        const av = a[sortField as keyof Track] as string | number;
        const bv = b[sortField as keyof Track] as string | number;
        if (typeof av === 'number' && typeof bv === 'number') {
          return sortDir === 'asc' ? av - bv : bv - av;
        }
        const as = String(av ?? '').toLowerCase();
        const bs = String(bv ?? '').toLowerCase();
        return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
      });
    }

    return list;
  }, [tracks, libraryView, search, sortField, sortDir]);

  const artists = useMemo(() => [...new Set(tracks.map(t => t.artist))].sort(), [tracks]);
  const albums = useMemo(() => [...new Set(tracks.map(t => t.album))].sort(), [tracks]);
  const genres = useMemo(() => [...new Set(tracks.map(t => t.genre).filter(Boolean))].sort(), [tracks]);

  /* ── Play a track ── */
  const playTrack = useCallback((track: Track, fromList?: Track[]) => {
    const list = fromList ?? filteredTracks;
    let orderedList = [...list];
    let idx = orderedList.findIndex(t => t.id === track.id);
    if (shuffle) {
      orderedList = shuffleArray(orderedList);
      idx = orderedList.findIndex(t => t.id === track.id);
    }
    dispatch({ type: 'SET_QUEUE', queue: orderedList, index: idx });
    dispatch({ type: 'SELECT_TRACK', id: track.id });
  }, [filteredTracks, shuffle]);

  /* ── Transport controls ── */
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      setupAudioChain();
      audioCtxRef.current?.resume().then(() => audio.play()).catch(() => audio.play());
    } else {
      audio.pause();
    }
  }, [setupAudioChain]);

  const seekTo = useCallback((pct: number) => {
    const audio = audioRef.current;
    if (!audio || !isFinite(audio.duration)) return;
    audio.currentTime = pct * audio.duration;
  }, []);

  const handleSort = useCallback((field: SortField) => {
    dispatch({
      type: 'SET_SORT',
      field,
      dir: sortField === field && sortDir === 'asc' ? 'desc' : 'asc',
    });
  }, [sortField, sortDir]);

  /* ── Nav label ── */
  function viewLabel(v: LibraryView) {
    if (typeof v === 'string') {
      if (v === 'all') return 'All Tracks';
      if (v === 'artists') return 'Artists';
      if (v === 'albums') return 'Albums';
      if (v === 'genres') return 'Genres';
      return 'Recently Added';
    }
    return v.name;
  }

  const seekPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const scanPct = scanTotal > 0 ? Math.round((scanDone / scanTotal) * 100) : 0;

  /* ── Artists / Albums / Genres group view ── */
  const isGroupView = libraryView === 'artists' || libraryView === 'albums' || libraryView === 'genres';
  const groupItems = libraryView === 'artists' ? artists : libraryView === 'genres' ? genres : albums;

  /* ─────────────────────────────── Main UI ────────────────────────────── */
  return (
    <div
      className="h-full flex flex-col overflow-hidden select-none text-sm"
      style={{ background: 'var(--background)', color: 'var(--foreground)', fontFamily: 'inherit' }}
    >
      {/* ── Top toolbar ── */}
      <div
        className="flex items-center gap-2 px-2 h-9 shrink-0 border-b"
        style={{ background: 'var(--surface-1, #1a1a1a)', borderColor: 'var(--border)' }}
      >
        <button
          onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
          className="p-1 rounded transition-colors hover:bg-white/10"
          style={{ color: sidebarOpen ? ACCENT : 'var(--muted-foreground)' }}
          title="Toggle sidebar"
        >
          <GalleryHorizontalEnd size={14} />
        </button>
        <div className="flex-1 flex items-center gap-1.5 bg-black/20 rounded-md px-2 h-6 border" style={{ borderColor: 'var(--border)' }}>
          <Search size={11} style={{ color: 'var(--muted-foreground)' }} />
          <input
            type="text"
            placeholder="Search tracks, artists, albums…"
            value={search}
            onChange={e => dispatch({ type: 'SET_SEARCH', search: e.target.value })}
            className="flex-1 bg-transparent outline-none text-xs placeholder:opacity-40"
            style={{ color: 'var(--foreground)' }}
          />
          {search && (
            <button onClick={() => dispatch({ type: 'SET_SEARCH', search: '' })} className="opacity-50 hover:opacity-100">
              <X size={10} />
            </button>
          )}
        </div>
        <span className="text-xs shrink-0" style={{ color: 'var(--muted-foreground)' }}>
          {tracks.length} tracks
        </span>
      </div>

      {/* ── Body: sidebar + content ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Sidebar ── */}
        {sidebarOpen && (
          <div
            className="w-48 shrink-0 flex flex-col overflow-hidden border-r"
            style={{ background: 'var(--surface-1, #161616)', borderColor: 'var(--border)' }}
          >
            {/* Library nav */}
            <div className="p-1.5 flex flex-col gap-0.5 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              {(
                [
                  { id: 'all', icon: <Library size={13} />, label: 'All Tracks' },
                  { id: 'artists', icon: <User size={13} />, label: 'Artists' },
                  { id: 'albums', icon: <Disc size={13} />, label: 'Albums' },
                  { id: 'genres', icon: <Tag size={13} />, label: 'Genres' },
                ] as Array<{ id: LibraryView; icon: React.ReactNode; label: string }>
              ).map(item => {
                const active = libraryView === item.id;
                return (
                  <button
                    key={String(item.id)}
                    onClick={() => dispatch({ type: 'SET_LIBRARY_VIEW', view: item.id })}
                    className="flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors text-left"
                    style={{
                      background: active ? 'rgba(240,112,32,0.15)' : 'transparent',
                      color: active ? ACCENT : 'var(--muted-foreground)',
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                );
              })}
            </div>

            {/* Playlists section */}
            <div className="p-1.5 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              <p className="text-[9px] font-semibold uppercase tracking-widest mb-1 px-1" style={{ color: 'var(--muted-foreground)' }}>
                Playlists
              </p>
              <button
                onClick={() => dispatch({ type: 'SET_LIBRARY_VIEW', view: 'recently-added' })}
                className="flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors w-full text-left"
                style={{
                  background: libraryView === 'recently-added' ? 'rgba(240,112,32,0.15)' : 'transparent',
                  color: libraryView === 'recently-added' ? ACCENT : 'var(--muted-foreground)',
                  fontWeight: libraryView === 'recently-added' ? 600 : 400,
                }}
              >
                <ListMusic size={12} />
                Recently Added
              </button>
            </div>

            {/* Quick list: Artists or Genres depending on nav selection */}
            <div className="flex-1 overflow-y-auto">
              {libraryView !== 'genres' && typeof libraryView !== 'object' || (typeof libraryView === 'object' && libraryView.type !== 'genre') ? (
                <>
                  <p className="text-[9px] font-semibold uppercase tracking-widest px-3 py-1.5 sticky top-0" style={{ color: 'var(--muted-foreground)', background: 'var(--surface-1, #161616)' }}>
                    {artists.length} Artists
                  </p>
                  {artists.slice(0, 100).map(artist => {
                    const active = typeof libraryView === 'object' && libraryView.type === 'artist' && libraryView.name === artist;
                    return (
                      <button
                        key={artist}
                        onClick={() => dispatch({ type: 'SET_LIBRARY_VIEW', view: { type: 'artist', name: artist } })}
                        className="w-full text-left px-3 py-0.5 text-xs truncate transition-colors hover:bg-white/5"
                        style={{ color: active ? ACCENT : 'var(--muted-foreground)', fontWeight: active ? 600 : 400 }}
                      >
                        {artist || 'Unknown'}
                      </button>
                    );
                  })}
                </>
              ) : (
                <>
                  <p className="text-[9px] font-semibold uppercase tracking-widest px-3 py-1.5 sticky top-0" style={{ color: 'var(--muted-foreground)', background: 'var(--surface-1, #161616)' }}>
                    {genres.length} Genres
                  </p>
                  {genres.slice(0, 100).map(genre => {
                    const active = typeof libraryView === 'object' && libraryView.type === 'genre' && libraryView.name === genre;
                    return (
                      <button
                        key={genre}
                        onClick={() => dispatch({ type: 'SET_LIBRARY_VIEW', view: { type: 'genre', name: genre } })}
                        className="w-full text-left px-3 py-0.5 text-xs truncate transition-colors hover:bg-white/5"
                        style={{ color: active ? ACCENT : 'var(--muted-foreground)', fontWeight: active ? 600 : 400 }}
                      >
                        {genre || 'Unknown'}
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Main content ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* ── No folder connected ── */}
          {!dirHandle && !scanning && (
            <div className="flex-1 flex flex-col items-center justify-center gap-5">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-xl"
                style={{ background: `linear-gradient(135deg, #c0340a, #f07020)` }}
              >
                <Music2 size={32} color="white" />
              </div>
              <div className="text-center">
                <p className="font-bold mb-1">Connect your music folder</p>
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  Grant access to a folder of audio files to start listening
                </p>
              </div>
              <button
                onClick={onPickFolder}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all hover:brightness-110 active:scale-95"
                style={{ background: ACCENT, color: 'white' }}
              >
                <FolderOpen size={16} />
                Connect Folder
              </button>
              <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>Works best in Chrome / Edge on desktop</p>
            </div>
          )}

          {/* ── Scanning state ── */}
          {scanning && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <Loader2 size={28} className="animate-spin" style={{ color: ACCENT }} />
              <div className="text-center">
                <p className="text-sm font-semibold mb-1">Scanning music library…</p>
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  {scanTotal > 0 ? `${scanDone} / ${scanTotal} files` : 'Collecting files…'}
                </p>
              </div>
              {scanTotal > 0 && (
                <div className="w-48 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${scanPct}%`, background: ACCENT }} />
                </div>
              )}
            </div>
          )}

          {/* Breadcrumb — only when library is loaded */}
          {dirHandle && !scanning && (typeof libraryView === 'object' || libraryView === 'recently-added') && (
            <div className="px-3 py-1.5 flex items-center gap-1.5 text-xs shrink-0 border-b" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
              <button
                onClick={() => dispatch({ type: 'SET_LIBRARY_VIEW', view: 'all' })}
                className="hover:underline"
              >Library</button>
              <ChevronRight size={11} />
              <span style={{ color: 'var(--foreground)' }}>{viewLabel(libraryView)}</span>
            </div>
          )}

          {/* Group view (Artists / Albums / Genres) */}
          {dirHandle && !scanning && isGroupView && (
            <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-2">
              {groupItems.map(name => {
                const groupType = libraryView === 'artists' ? 'artist' : libraryView === 'genres' ? 'genre' : 'album';
                const countField = libraryView === 'artists' ? 'artist' : libraryView === 'genres' ? 'genre' : 'album';
                const count = tracks.filter(t => t[countField as keyof Track] === name).length;
                const sample = tracks.find(t => t[countField as keyof Track] === name);
                const bg = artistColor(name);
                const icon = libraryView === 'artists' ? <User size={15} color="white" />
                  : libraryView === 'genres' ? <Tag size={15} color="white" />
                  : <Disc size={15} color="white" />;
                return (
                  <button
                    key={name}
                    onClick={() => dispatch({ type: 'SET_LIBRARY_VIEW', view: { type: groupType, name } })}
                    className="flex items-center gap-2.5 p-2 rounded-lg text-left transition-colors hover:bg-white/5 border"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    {sample?.artDataUrl ? (
                      <img src={sample.artDataUrl} alt="" className="w-9 h-9 rounded object-cover shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded shrink-0 flex items-center justify-center" style={{ background: bg }}>
                        {icon}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: 'var(--foreground)' }}>{name || 'Unknown'}</p>
                      <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{count} {count === 1 ? 'track' : 'tracks'}</p>
                    </div>
                  </button>
                );
              })}
              {groupItems.length === 0 && (
                <div className="col-span-2 text-center py-12" style={{ color: 'var(--muted-foreground)' }}>
                  No {libraryView} found
                </div>
              )}
            </div>
          )}

          {/* Track list */}
          {dirHandle && !scanning && !isGroupView && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Column headers */}
              <div
                className="grid items-center px-2 h-7 text-[10px] font-semibold uppercase tracking-wide shrink-0 border-b"
                style={{
                  gridTemplateColumns: '24px 1fr 160px 160px 50px',
                  borderColor: 'var(--border)',
                  color: 'var(--muted-foreground)',
                  background: 'var(--surface-1, #1a1a1a)',
                }}
              >
                <span className="text-center">#</span>
                <SortHeader field="title" label="Title" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                <SortHeader field="artist" label="Artist" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                <SortHeader field="album" label="Album" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                <SortHeader field="duration" label="Time" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
              </div>

              {/* Rows */}
              <div className="flex-1 overflow-y-auto">
                {filteredTracks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: 'var(--muted-foreground)' }}>
                    <Music size={32} className="opacity-30" />
                    <p className="text-xs">{search ? 'No results' : 'No tracks in this view'}</p>
                  </div>
                ) : (
                  filteredTracks.map((track, idx) => {
                    const isActive = currentTrack?.id === track.id;
                    const isSelected = selectedTrackId === track.id;
                    return (
                      <div
                        key={track.id}
                        onDoubleClick={() => playTrack(track)}
                        onClick={() => dispatch({ type: 'SELECT_TRACK', id: track.id })}
                        className="grid items-center px-2 h-8 cursor-pointer transition-colors"
                        style={{
                          gridTemplateColumns: '24px 1fr 160px 160px 50px',
                          background: isSelected ? 'rgba(240,112,32,0.12)' : isActive ? 'rgba(240,112,32,0.06)' : 'transparent',
                          borderLeft: isActive ? `2px solid ${ACCENT}` : '2px solid transparent',
                        }}
                        onMouseEnter={e => { if (!isSelected && !isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
                        onMouseLeave={e => { if (!isSelected && !isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                      >
                        <span className="text-center text-[10px]" style={{ color: isActive ? ACCENT : 'var(--muted-foreground)' }}>
                          {isActive && isPlaying ? '▶' : idx + 1}
                        </span>
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          {track.artDataUrl ? (
                            <img src={track.artDataUrl} alt="" className="w-5 h-5 rounded shrink-0 object-cover" />
                          ) : (
                            <div
                              className="w-5 h-5 rounded shrink-0 flex items-center justify-center"
                              style={{ background: artistColor(track.artist) }}
                            >
                              <Music2 size={10} color="white" />
                            </div>
                          )}
                          <span
                            className="truncate text-xs"
                            style={{ color: isActive ? ACCENT : 'var(--foreground)', fontWeight: isActive ? 600 : 400 }}
                          >
                            {track.title}
                          </span>
                        </div>
                        <span className="text-xs truncate pr-2" style={{ color: 'var(--muted-foreground)' }}>{track.artist}</span>
                        <span className="text-xs truncate pr-2" style={{ color: 'var(--muted-foreground)' }}>{track.album}</span>
                        <span className="text-xs text-right" style={{ color: 'var(--muted-foreground)' }}>{formatDuration(track.duration)}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── EQ Drawer ── */}
      {eqOpen && (
        <div
          className="shrink-0 border-t px-4 py-3"
          style={{ background: 'var(--surface-1, #111)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: ACCENT }}>Equalizer</span>
            <button
              onClick={() => dispatch({ type: 'RESET_EQ' })}
              className="text-[10px] hover:underline"
              style={{ color: 'var(--muted-foreground)' }}
            >
              Reset
            </button>
          </div>
          <div className="flex items-end gap-2">
            {EQ_FREQS.map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1 flex-1">
                <span className="text-[9px]" style={{ color: 'var(--muted-foreground)' }}>
                  {eqGains[i] > 0 ? '+' : ''}{eqGains[i].toFixed(0)}
                </span>
                <div className="relative h-16 flex items-center justify-center">
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={0.5}
                    value={eqGains[i]}
                    onChange={e => dispatch({ type: 'SET_EQ_GAIN', band: i, gain: parseFloat(e.target.value) })}
                    className="absolute"
                    style={{
                      writingMode: 'vertical-lr',
                      direction: 'rtl',
                      WebkitAppearance: 'slider-vertical',
                      width: '100%',
                      height: '64px',
                      cursor: 'pointer',
                      accentColor: ACCENT,
                    } as React.CSSProperties}
                  />
                </div>
                <span className="text-[9px]" style={{ color: 'var(--muted-foreground)' }}>{EQ_LABELS[i]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Player bar ── */}
      <div
        ref={playerBarRef}
        className="shrink-0 border-t"
        style={{ background: 'var(--surface-1, #111)', borderColor: 'var(--border)' }}
      >
        {/* Seek bar */}
        <div className="relative group h-1 cursor-pointer" onClick={e => {
          const rect = e.currentTarget.getBoundingClientRect();
          seekTo((e.clientX - rect.left) / rect.width);
        }}>
          <div className="absolute inset-0" style={{ background: 'var(--border)' }} />
          <div
            className="absolute left-0 top-0 h-full transition-all"
            style={{ width: `${seekPct}%`, background: ACCENT }}
          />
        </div>

        <div className="flex items-center gap-2 px-3 h-[68px]">
          {/* Album art + track info */}
          <div className="flex items-center gap-2.5 w-56 shrink-0 min-w-0">
            {currentTrack?.artDataUrl ? (
              <img src={currentTrack.artDataUrl} alt="" className="w-11 h-11 rounded object-cover shrink-0 shadow-md" />
            ) : currentTrack ? (
              <div
                className="w-11 h-11 rounded shrink-0 flex items-center justify-center shadow-md"
                style={{ background: artistColor(currentTrack.artist) }}
              >
                <Music2 size={20} color="white" />
              </div>
            ) : (
              <div className="w-11 h-11 rounded shrink-0" style={{ background: 'var(--border)' }} />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate" style={{ color: currentTrack ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
                {currentTrack?.title ?? 'No track selected'}
              </p>
              <p className="text-[10px] truncate" style={{ color: 'var(--muted-foreground)' }}>
                {currentTrack ? `${currentTrack.artist} — ${currentTrack.album}` : 'Double-click a track to play'}
              </p>
              <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                {formatDuration(currentTime)} / {formatDuration(duration)}
              </p>
            </div>
          </div>

          {/* Spectrum visualizer */}
          <canvas
            ref={canvasRef}
            width={96}
            height={36}
            className="shrink-0 rounded opacity-80"
            style={{ background: 'transparent' }}
          />

          {/* Transport controls */}
          <div className="flex items-center gap-1 mx-auto shrink-0">
            <button
              onClick={() => dispatch({ type: 'TOGGLE_SHUFFLE' })}
              className="p-1.5 rounded transition-colors"
              style={{ color: shuffle ? ACCENT : 'var(--muted-foreground)' }}
              title="Shuffle"
            >
              <Shuffle size={14} />
            </button>
            <button
              onClick={() => dispatch({ type: 'PREV_TRACK' })}
              className="p-1.5 rounded transition-colors hover:text-white"
              style={{ color: 'var(--muted-foreground)' }}
              title="Previous"
            >
              <SkipBack size={18} />
            </button>
            <button
              onClick={togglePlay}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:brightness-110 active:scale-95 shadow-md"
              style={{ background: ACCENT, color: 'white' }}
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button
              onClick={() => dispatch({ type: 'NEXT_TRACK' })}
              className="p-1.5 rounded transition-colors hover:text-white"
              style={{ color: 'var(--muted-foreground)' }}
              title="Next"
            >
              <SkipForward size={18} />
            </button>
            <button
              onClick={() => dispatch({ type: 'CYCLE_REPEAT' })}
              className="p-1.5 rounded transition-colors"
              style={{ color: repeat !== 'none' ? ACCENT : 'var(--muted-foreground)' }}
              title={repeat === 'none' ? 'Repeat off' : repeat === 'all' ? 'Repeat all' : 'Repeat one'}
            >
              {repeat === 'one' ? <Repeat1 size={14} /> : <Repeat size={14} />}
            </button>
          </div>

          {/* Right controls: EQ toggle + volume */}
          <div className="flex items-center gap-2 ml-auto shrink-0 w-48 justify-end">
            <button
              onClick={() => dispatch({ type: 'TOGGLE_EQ' })}
              className="p-1.5 rounded transition-colors flex items-center gap-1 text-[10px] font-semibold"
              style={{ color: eqOpen ? ACCENT : 'var(--muted-foreground)' }}
              title="Equalizer"
            >
              <Sliders size={13} />
              EQ
            </button>
            <button
              onClick={() => dispatch({ type: 'SET_MUTED', muted: !isMuted })}
              className="p-1 rounded transition-colors"
              style={{ color: 'var(--muted-foreground)' }}
            >
              {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={e => dispatch({ type: 'SET_VOLUME', volume: parseFloat(e.target.value) })}
              className="w-20"
              style={{ accentColor: ACCENT, cursor: 'pointer' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
