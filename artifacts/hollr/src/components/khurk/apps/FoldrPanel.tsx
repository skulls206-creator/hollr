/**
 * FoldrPanel — cloud file manager (Lighthouse IPFS + AES-256-GCM encryption)
 * Themes: Midnight, Slate, Forest, Ocean, Sunset, Snow
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Upload, Trash2, Download, Search, X, LayoutGrid, List,
  FileText, FileCode, FileImage, FileVideo, FileAudio,
  File as FileIcon, Loader2, RefreshCw, Info, Copy, CheckCheck,
  FolderOpen, Folder as FolderIcon, Plus, ChevronRight, ChevronDown,
  Star, Lock, MoreHorizontal, Palette, HardDrive, ArrowLeft,
  Edit2, Check, RotateCcw, FolderPlus, ExternalLink,
} from 'lucide-react';
import type { NativePanelProps } from '@/lib/khurk-apps';
import { useAuth } from '@workspace/replit-auth-web';

const API = import.meta.env.BASE_URL;

/* ── Types ── */
interface FoldrFile {
  id: string;
  folderId: string | null;
  name: string;
  size: number;
  mimeType: string;
  cid: string;
  isEncrypted: boolean;
  isStarred: boolean;
  sortOrder: number;
  url: string;
  gatewayUrl: string;
  uploadedAt: string;
  deletedAt: string | null;
}
interface FoldrFolder {
  id: string;
  userId: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  createdAt: string;
}

/* ── Themes ── */
interface Theme {
  label: string;
  dot: string;
  bg: string;
  surface: string;
  surface2: string;
  sidebar: string;
  accent: string;
  accentText: string;
  text: string;
  muted: string;
  border: string;
  folderColor: string;
  rowHover: string;
  rowSelected: string;
}

const THEMES: Record<string, Theme> = {
  midnight: {
    label: 'Midnight', dot: '#2d7dd2',
    bg: '#0d1117', surface: '#161b22', surface2: '#1c2128', sidebar: '#0d1117',
    accent: '#2d7dd2', accentText: '#fff',
    text: '#e6edf3', muted: '#7d8590', border: '#30363d',
    folderColor: '#e3b341', rowHover: '#1c2128', rowSelected: '#1a2d4e',
  },
  slate: {
    label: 'Slate', dot: '#6366f1',
    bg: '#0f172a', surface: '#1e293b', surface2: '#273446', sidebar: '#0f172a',
    accent: '#6366f1', accentText: '#fff',
    text: '#f1f5f9', muted: '#64748b', border: '#1e293b',
    folderColor: '#facc15', rowHover: '#1e293b', rowSelected: '#2a2f5a',
  },
  forest: {
    label: 'Forest', dot: '#22c55e',
    bg: '#0a1a0f', surface: '#122018', surface2: '#1a3025', sidebar: '#0a1a0f',
    accent: '#22c55e', accentText: '#fff',
    text: '#f0fdf4', muted: '#4d7c5f', border: '#1a3025',
    folderColor: '#fbbf24', rowHover: '#1a3025', rowSelected: '#153d20',
  },
  ocean: {
    label: 'Ocean', dot: '#06b6d4',
    bg: '#030d1a', surface: '#0a1929', surface2: '#0d2035', sidebar: '#030d1a',
    accent: '#06b6d4', accentText: '#000',
    text: '#f0f9ff', muted: '#4a7c9a', border: '#0d2035',
    folderColor: '#fb923c', rowHover: '#0d2035', rowSelected: '#073d52',
  },
  sunset: {
    label: 'Sunset', dot: '#f97316',
    bg: '#1a0e05', surface: '#271a0c', surface2: '#3d2515', sidebar: '#1a0e05',
    accent: '#f97316', accentText: '#fff',
    text: '#fff7ed', muted: '#a16207', border: '#3d2515',
    folderColor: '#e879f9', rowHover: '#3d2515', rowSelected: '#4a2010',
  },
  snow: {
    label: 'Snow', dot: '#e2e8f0',
    bg: '#f8fafc', surface: '#ffffff', surface2: '#f1f5f9', sidebar: '#f1f5f9',
    accent: '#3b82f6', accentText: '#fff',
    text: '#0f172a', muted: '#64748b', border: '#e2e8f0',
    folderColor: '#f59e0b', rowHover: '#f1f5f9', rowSelected: '#dbeafe',
  },
};

type SectionId = 'browse' | 'starred' | 'trash';

/* ── Helpers ── */
function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(1)} GB`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}
function fileCategory(mime: string): 'image' | 'video' | 'audio' | 'code' | 'text' | 'other' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.includes('json') || mime.includes('javascript') || mime.includes('html') || mime.includes('css') || mime.includes('typescript')) return 'code';
  if (mime.startsWith('text/') || mime.includes('pdf')) return 'text';
  return 'other';
}
function FileTypeIcon({ mime, size = 18, folder = false, color }: { mime?: string; size?: number; folder?: boolean; color?: string }) {
  if (folder) return <FolderIcon size={size} style={{ color: color ?? '#e3b341' }} />;
  const cat = mime ? fileCategory(mime) : 'other';
  const colors: Record<string, string> = { image: '#60a5fa', video: '#c084fc', audio: '#f472b6', code: '#4ade80', text: '#fb923c', other: '#94a3b8' };
  const C = { image: FileImage, video: FileVideo, audio: FileAudio, code: FileCode, text: FileText, other: FileIcon }[cat];
  return <C size={size} style={{ color: colors[cat] }} />;
}

/* ══════════════════════════════════════════════════════════════════════════ */
export function FoldrPanel({ storagePrefix }: NativePanelProps) {
  const { user } = useAuth();
  const [themeId, setThemeId] = useState<string>(() =>
    localStorage.getItem(`${storagePrefix}:theme`) ?? 'midnight'
  );
  const t = THEMES[themeId] ?? THEMES.midnight;

  // Data
  const [files, setFiles] = useState<FoldrFile[]>([]);
  const [folders, setFolders] = useState<FoldrFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState('');

  // Navigation
  const [section, setSection] = useState<SectionId>('browse');
  const [folderStack, setFolderStack] = useState<(FoldrFolder | null)[]>([null]); // null = root
  const currentFolder = folderStack[folderStack.length - 1] ?? null;

  // UI state
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() =>
    (localStorage.getItem(`${storagePrefix}:view`) as 'list' | 'grid') ?? 'list'
  );
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<FoldrFile | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Rename
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Drag/drop sort
  const dragItem = useRef<{ type: 'file' | 'folder'; id: string } | null>(null);
  const dragOver = useRef<string | null>(null);

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; item: FoldrFile | FoldrFolder; isFolder: boolean } | null>(null);

  // New folder inline
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const setView = (v: 'list' | 'grid') => { setViewMode(v); localStorage.setItem(`${storagePrefix}:view`, v); };
  const setTheme = (id: string) => { setThemeId(id); localStorage.setItem(`${storagePrefix}:theme`, id); };

  /* ── Fetch ── */
  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const foldQ = `${API}api/foldr/folders`;
      let fileQ = `${API}api/foldr/files`;
      if (section === 'starred') fileQ += '?starred=1';
      else if (section === 'trash') fileQ += '?trash=1';
      else {
        const fid = currentFolder?.id ?? '';
        fileQ += `?folderId=${fid ? fid : 'root'}`;
      }

      const [foldRes, fileRes] = await Promise.all([
        fetch(foldQ, { credentials: 'include' }),
        fetch(fileQ, { credentials: 'include' }),
      ]);
      if (foldRes.ok) setFolders(await foldRes.json());
      if (fileRes.ok) setFiles(await fileRes.json());
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, [user, section, currentFolder]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ── Upload ── */
  const handleUpload = useCallback(async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList);
    for (const file of arr) {
      setUploading(true);
      setUploadName(file.name);
      try {
        const form = new FormData();
        form.append('file', file);
        if (currentFolder?.id) form.append('folderId', currentFolder.id);
        const res = await fetch(`${API}api/foldr/upload`, { method: 'POST', credentials: 'include', body: form });
        if (res.ok) {
          const f: FoldrFile = await res.json();
          setFiles(prev => [f, ...prev]);
        }
      } catch { /* non-fatal */ }
    }
    setUploading(false);
    setUploadName('');
  }, [currentFolder]);

  /* ── New folder ── */
  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) { setCreatingFolder(false); return; }
    const res = await fetch(`${API}api/foldr/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, parentId: currentFolder?.id ?? null }),
    });
    if (res.ok) {
      const folder: FoldrFolder = await res.json();
      setFolders(prev => [...prev, folder]);
    }
    setCreatingFolder(false);
    setNewFolderName('');
  };

  /* ── Rename ── */
  const submitRename = async (id: string, isFolder: boolean) => {
    const name = renameValue.trim();
    if (!name) { setRenamingId(null); return; }
    const url = isFolder ? `${API}api/foldr/folders/${id}` : `${API}api/foldr/files/${id}`;
    const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ name }) });
    if (res.ok) {
      if (isFolder) { const f = await res.json(); setFolders(prev => prev.map(x => x.id === id ? f : x)); }
      else { const f = await res.json(); setFiles(prev => prev.map(x => x.id === id ? f : x)); }
    }
    setRenamingId(null);
  };

  /* ── Delete / Restore ── */
  const trashFile = async (f: FoldrFile) => {
    const res = await fetch(`${API}api/foldr/files/${f.id}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) { setFiles(prev => prev.filter(x => x.id !== f.id)); if (selected?.id === f.id) { setSelected(null); setDrawerOpen(false); } }
  };
  const hardDeleteFile = async (f: FoldrFile) => {
    const res = await fetch(`${API}api/foldr/files/${f.id}?hard=1`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) { setFiles(prev => prev.filter(x => x.id !== f.id)); if (selected?.id === f.id) { setSelected(null); setDrawerOpen(false); } }
  };
  const restoreFile = async (f: FoldrFile) => {
    const res = await fetch(`${API}api/foldr/files/${f.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ restore: true }) });
    if (res.ok) { const upd: FoldrFile = await res.json(); setFiles(prev => prev.map(x => x.id === f.id ? upd : x)); }
  };
  const toggleStar = async (f: FoldrFile) => {
    const res = await fetch(`${API}api/foldr/files/${f.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ isStarred: !f.isStarred }) });
    if (res.ok) { const upd: FoldrFile = await res.json(); setFiles(prev => prev.map(x => x.id === f.id ? upd : x)); setSelected(upd); }
  };
  const deleteFolder = async (folder: FoldrFolder) => {
    const res = await fetch(`${API}api/foldr/folders/${folder.id}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) { setFolders(prev => prev.filter(x => x.id !== folder.id)); fetchAll(); }
  };

  /* ── Drag/drop sort ── */
  const onDragStart = (type: 'file' | 'folder', id: string) => { dragItem.current = { type, id }; };
  const onDragOver = (e: React.DragEvent, id: string) => { e.preventDefault(); dragOver.current = id; };
  const onDrop = async (e: React.DragEvent, targetId: string, targetType: 'file' | 'folder') => {
    e.preventDefault();
    if (!dragItem.current || dragItem.current.id === targetId) return;
    const src = dragItem.current;

    // Reorder: compute new sortOrder midpoint
    const isFile = src.type === 'file';
    if (isFile && targetType === 'file') {
      const targetFile = files.find(f => f.id === targetId);
      if (targetFile) {
        await fetch(`${API}api/foldr/files/${src.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ sortOrder: targetFile.sortOrder - 1 }) });
        fetchAll();
      }
    } else if (!isFile && targetType === 'folder') {
      const targetFolder = folders.find(f => f.id === targetId);
      if (targetFolder) {
        await fetch(`${API}api/foldr/folders/${src.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ sortOrder: targetFolder.sortOrder - 1 }) });
        fetchAll();
      }
    }
    dragItem.current = null;
    dragOver.current = null;
  };

  /* ── Copy helper ── */
  const copyText = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  /* ── Filtered lists ── */
  const currentFolders = useMemo(() => {
    if (section !== 'browse') return [];
    const kids = folders.filter(f => f.parentId === (currentFolder?.id ?? null));
    if (!search) return kids;
    return kids.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));
  }, [folders, currentFolder, section, search]);

  const displayFiles = useMemo(() => {
    if (!search) return files;
    return files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));
  }, [files, search]);

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);

  /* ── Theme picker close on outside click ── */
  const themePickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showThemePicker) return;
    const close = (e: MouseEvent) => { if (!themePickerRef.current?.contains(e.target as Node)) setShowThemePicker(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showThemePicker]);

  /* ── Context menu close on outside click ── */
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [ctxMenu]);

  if (!user) {
    return (
      <div className="h-full flex items-center justify-center text-sm" style={{ color: t.muted, background: t.bg }}>
        Sign in to use Foldr
      </div>
    );
  }

  /* ── Breadcrumb path ── */
  const breadcrumbs = folderStack.map((f, i) => ({
    label: f?.name ?? 'My Files',
    index: i,
  }));

  const s = { /* shorthand inline styles */
    panel: { background: t.bg, color: t.text, height: '100%', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', fontSize: '13px' },
    header: { background: t.surface, borderBottom: `1px solid ${t.border}`, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 },
    sidebar: { background: t.sidebar, borderRight: `1px solid ${t.border}`, width: '168px', flexShrink: 0, display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' },
    main: { flex: 1, display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' },
    toolbar: { background: t.surface, borderBottom: `1px solid ${t.border}`, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 },
    row: (isSelected: boolean, isHovered: boolean) => ({
      background: isSelected ? t.rowSelected : isHovered ? t.rowHover : 'transparent',
      display: 'flex', alignItems: 'center', cursor: 'pointer',
      borderBottom: `1px solid ${t.border}`, padding: '5px 8px', gap: '8px',
      transition: 'background 0.1s',
    }),
    sectionBtn: (active: boolean) => ({
      display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 10px', cursor: 'pointer',
      borderRadius: '6px', color: active ? t.text : t.muted,
      background: active ? t.surface2 : 'transparent', fontWeight: active ? '600' : '400',
      fontSize: '12px', border: 'none', width: '100%', textAlign: 'left' as const,
    }),
    btn: (primary = false) => ({
      display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px',
      borderRadius: '6px', border: primary ? 'none' : `1px solid ${t.border}`,
      background: primary ? t.accent : t.surface2, color: primary ? t.accentText : t.text,
      cursor: 'pointer', fontSize: '12px', fontWeight: primary ? '600' : '400',
    }),
    input: {
      background: t.surface2, border: `1px solid ${t.border}`, color: t.text,
      borderRadius: '6px', padding: '4px 8px', fontSize: '12px', outline: 'none', width: '100%',
    },
  };

  /* ── Row hover state ── */
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div style={s.panel}>

      {/* ── Header ── */}
      <div style={s.header}>
        <Lock size={14} style={{ color: t.accent }} />
        <span style={{ fontWeight: 700, fontSize: '13px' }}>Foldr</span>
        <span style={{ fontSize: '11px', color: t.muted, background: t.surface2, borderRadius: '4px', padding: '2px 6px', border: `1px solid ${t.border}` }}>
          Encrypted · IPFS
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '11px', color: t.muted }}>{formatBytes(totalSize)}</span>
        <button onClick={fetchAll} style={{ ...s.btn(), padding: '3px 6px' }} title="Refresh"><RefreshCw size={12} /></button>

        {/* Theme picker */}
        <div style={{ position: 'relative' }} ref={themePickerRef}>
          <button onClick={() => setShowThemePicker(v => !v)} style={{ ...s.btn(), padding: '3px 6px' }} title="Theme">
            <Palette size={12} />
          </button>
          {showThemePicker && (
            <div style={{ position: 'absolute', right: 0, top: '110%', background: t.surface, border: `1px solid ${t.border}`, borderRadius: '10px', padding: '10px 12px', zIndex: 100, minWidth: '160px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
              <div style={{ fontSize: '11px', color: t.muted, marginBottom: '8px', fontWeight: 600 }}>THEME</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {Object.entries(THEMES).map(([id, th]) => (
                  <button
                    key={id}
                    onClick={() => { setTheme(id); setShowThemePicker(false); }}
                    title={th.label}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '6px', outline: themeId === id ? `2px solid ${t.accent}` : 'none' }}
                  >
                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: th.bg, border: `2px solid ${th.dot}` }} />
                    <span style={{ fontSize: '9px', color: t.muted }}>{th.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Body: sidebar + main ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Sidebar */}
        <div style={s.sidebar}>
          <div style={{ padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {([
              ['browse', FolderOpen, 'My Files'],
              ['starred', Star, 'Starred'],
              ['trash', Trash2, 'Trash'],
            ] as const).map(([id, Icon, label]) => (
              <button key={id} onClick={() => { setSection(id as SectionId); setFolderStack([null]); }} style={s.sectionBtn(section === id)}>
                <Icon size={13} style={{ color: section === id ? t.accent : t.muted }} />
                {label}
              </button>
            ))}
          </div>

          {/* Folder tree (browse only) */}
          {section === 'browse' && (
            <div style={{ flex: 1, overflow: 'auto', padding: '0 8px 8px' }}>
              <div style={{ fontSize: '10px', color: t.muted, padding: '8px 4px 4px', fontWeight: 600, letterSpacing: '0.04em' }}>FOLDERS</div>
              <FolderTree
                folders={folders}
                parentId={null}
                currentId={currentFolder?.id ?? null}
                depth={0}
                t={t}
                onSelect={(folder) => { setFolderStack([null, folder]); setSection('browse'); }}
              />
            </div>
          )}

          {/* Storage summary */}
          <div style={{ padding: '8px 10px', borderTop: `1px solid ${t.border}`, fontSize: '10px', color: t.muted, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <HardDrive size={11} />
            <span>{files.length} file{files.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Main area */}
        <div style={s.main}>

          {/* Toolbar */}
          <div style={s.toolbar}>
            {/* Back button */}
            {folderStack.length > 1 && (
              <button onClick={() => setFolderStack(s => s.slice(0, -1))} style={{ ...s.btn(), padding: '3px 6px' }}>
                <ArrowLeft size={13} />
              </button>
            )}

            {/* Breadcrumbs */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden' }}>
              {breadcrumbs.map((b, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {i > 0 && <ChevronRight size={12} style={{ color: t.muted }} />}
                  <button
                    onClick={() => setFolderStack(s => s.slice(0, b.index + 1))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: i === breadcrumbs.length - 1 ? t.text : t.muted, fontWeight: i === breadcrumbs.length - 1 ? 600 : 400, fontSize: '12px', padding: '2px 4px', borderRadius: '4px' }}
                  >
                    {b.label}
                  </button>
                </span>
              ))}
            </div>

            {/* Search */}
            <div style={{ position: 'relative' }}>
              <Search size={11} style={{ position: 'absolute', left: '7px', top: '50%', transform: 'translateY(-50%)', color: t.muted }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                style={{ ...s.input, paddingLeft: '24px', width: '150px' }}
              />
            </div>

            {section === 'browse' && (
              <>
                <button onClick={() => fileInputRef.current?.click()} style={s.btn(true)} disabled={uploading}>
                  {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                  Upload
                </button>
                <button onClick={() => { setCreatingFolder(true); setNewFolderName(''); }} style={s.btn()}>
                  <FolderPlus size={12} /> New Folder
                </button>
              </>
            )}
            <input ref={fileInputRef} type="file" multiple hidden onChange={e => e.target.files && handleUpload(e.target.files)} />

            {/* View toggle */}
            <button onClick={() => setView('list')} style={{ ...s.btn(), padding: '4px 6px', outline: viewMode === 'list' ? `2px solid ${t.accent}` : 'none' }}><List size={13} /></button>
            <button onClick={() => setView('grid')} style={{ ...s.btn(), padding: '4px 6px', outline: viewMode === 'grid' ? `2px solid ${t.accent}` : 'none' }}><LayoutGrid size={13} /></button>
          </div>

          {/* Upload progress */}
          {uploading && (
            <div style={{ background: t.accent + '20', color: t.accent, padding: '5px 12px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: `1px solid ${t.border}` }}>
              <Loader2 size={11} className="animate-spin" />
              Encrypting &amp; uploading {uploadName}…
            </div>
          )}

          {/* Content + drawer */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

            {/* File/folder list */}
            <div
              style={{ flex: 1, overflowY: 'auto', padding: viewMode === 'grid' ? '10px' : '0' }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                if (e.dataTransfer.files.length && section === 'browse') handleUpload(e.dataTransfer.files);
              }}
            >
              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '120px', color: t.muted }}>
                  <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                </div>
              ) : currentFolders.length === 0 && displayFiles.length === 0 && !creatingFolder ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '160px', color: t.muted, gap: '10px' }}>
                  <FolderIcon size={36} style={{ opacity: 0.3, color: t.folderColor }} />
                  <div style={{ fontSize: '12px' }}>
                    {section === 'trash' ? 'Trash is empty' : 'Drop files here or click Upload'}
                  </div>
                </div>
              ) : viewMode === 'list' ? (
                <div>
                  {/* Column header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 110px 24px 24px', gap: '6px', padding: '4px 8px', borderBottom: `1px solid ${t.border}`, fontSize: '10px', color: t.muted, fontWeight: 600, letterSpacing: '0.03em', position: 'sticky', top: 0, background: t.surface }}>
                    <span>NAME</span><span>SIZE</span><span>UPLOADED</span><span></span><span></span>
                  </div>

                  {/* New folder row */}
                  {creatingFolder && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 110px 24px 24px', gap: '6px', padding: '5px 8px', alignItems: 'center', borderBottom: `1px solid ${t.border}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FolderIcon size={16} style={{ color: t.folderColor }} />
                        <input
                          autoFocus
                          value={newFolderName}
                          onChange={e => setNewFolderName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setCreatingFolder(false); }}
                          onBlur={createFolder}
                          placeholder="Folder name"
                          style={{ ...s.input, width: '140px' }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Folders */}
                  {currentFolders.map(folder => (
                    <div
                      key={folder.id}
                      draggable
                      onDragStart={() => onDragStart('folder', folder.id)}
                      onDragOver={e => onDragOver(e, folder.id)}
                      onDrop={e => onDrop(e, folder.id, 'folder')}
                      onMouseEnter={() => setHoveredId(folder.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onDoubleClick={() => setFolderStack(s => [...s, folder])}
                      onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, item: folder, isFolder: true }); }}
                      style={{ ...s.row(false, hoveredId === folder.id), display: 'grid', gridTemplateColumns: '1fr 80px 110px 24px 24px' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        <FolderIcon size={15} style={{ color: t.folderColor, flexShrink: 0 }} />
                        {renamingId === folder.id ? (
                          <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submitRename(folder.id, true); if (e.key === 'Escape') setRenamingId(null); }} onBlur={() => submitRename(folder.id, true)} style={{ ...s.input, width: '120px' }} />
                        ) : (
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
                        )}
                      </div>
                      <span style={{ color: t.muted, fontSize: '11px' }}>—</span>
                      <span style={{ color: t.muted, fontSize: '11px' }}>{formatDate(folder.createdAt)}</span>
                      <span />
                      <ChevronRight size={13} style={{ color: t.muted }} />
                    </div>
                  ))}

                  {/* Files */}
                  {displayFiles.map(file => (
                    <div
                      key={file.id}
                      draggable
                      onDragStart={() => onDragStart('file', file.id)}
                      onDragOver={e => onDragOver(e, file.id)}
                      onDrop={e => onDrop(e, file.id, 'file')}
                      onMouseEnter={() => setHoveredId(file.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onClick={() => { setSelected(file); setDrawerOpen(true); }}
                      onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, item: file, isFolder: false }); }}
                      style={{ ...s.row(selected?.id === file.id, hoveredId === file.id), display: 'grid', gridTemplateColumns: '1fr 80px 110px 24px 24px', cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        <FileTypeIcon mime={file.mimeType} size={15} />
                        {renamingId === file.id ? (
                          <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submitRename(file.id, false); if (e.key === 'Escape') setRenamingId(null); }} onBlur={() => submitRename(file.id, false)} style={{ ...s.input, width: '120px' }} />
                        ) : (
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                        )}
                        {file.isEncrypted && <Lock size={10} style={{ color: t.accent, flexShrink: 0 }} />}
                        {file.isStarred && <Star size={10} style={{ color: '#f59e0b', flexShrink: 0 }} />}
                      </div>
                      <span style={{ color: t.muted, fontSize: '11px' }}>{formatBytes(file.size)}</span>
                      <span style={{ color: t.muted, fontSize: '11px' }}>{formatDate(file.uploadedAt)}</span>
                      <button onClick={e => { e.stopPropagation(); toggleStar(file); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: file.isStarred ? '#f59e0b' : t.muted }}>
                        <Star size={12} />
                      </button>
                      <button onClick={e => { e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, item: file, isFolder: false }); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: t.muted }}>
                        <MoreHorizontal size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                /* Grid view */
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '8px' }}>
                  {creatingFolder && (
                    <div style={{ background: t.surface, border: `2px solid ${t.accent}`, borderRadius: '10px', padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      <FolderIcon size={32} style={{ color: t.folderColor }} />
                      <input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setCreatingFolder(false); }} onBlur={createFolder} placeholder="Name" style={{ ...s.input, width: '80px', textAlign: 'center', fontSize: '11px' }} />
                    </div>
                  )}
                  {currentFolders.map(folder => (
                    <div
                      key={folder.id}
                      draggable
                      onDragStart={() => onDragStart('folder', folder.id)}
                      onDoubleClick={() => setFolderStack(s => [...s, folder])}
                      onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, item: folder, isFolder: true }); }}
                      onMouseEnter={() => setHoveredId(folder.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      style={{ background: hoveredId === folder.id ? t.surface2 : t.surface, border: `1px solid ${t.border}`, borderRadius: '10px', padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', cursor: 'pointer', transition: 'background 0.1s' }}
                    >
                      <FolderIcon size={32} style={{ color: t.folderColor }} />
                      <span style={{ fontSize: '11px', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{folder.name}</span>
                    </div>
                  ))}
                  {displayFiles.map(file => (
                    <div
                      key={file.id}
                      draggable
                      onDragStart={() => onDragStart('file', file.id)}
                      onClick={() => { setSelected(file); setDrawerOpen(true); }}
                      onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, item: file, isFolder: false }); }}
                      onMouseEnter={() => setHoveredId(file.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      style={{ background: selected?.id === file.id ? t.rowSelected : hoveredId === file.id ? t.surface2 : t.surface, border: `1px solid ${selected?.id === file.id ? t.accent : t.border}`, borderRadius: '10px', padding: '10px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', cursor: 'pointer', transition: 'background 0.1s', position: 'relative' }}
                    >
                      {fileCategory(file.mimeType) === 'image' ? (
                        <img src={file.url} alt={file.name} style={{ width: '60px', height: '48px', objectFit: 'cover', borderRadius: '6px' }} loading="lazy" />
                      ) : (
                        <div style={{ width: '60px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.surface2, borderRadius: '6px' }}>
                          <FileTypeIcon mime={file.mimeType} size={24} />
                        </div>
                      )}
                      <span style={{ fontSize: '10px', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{file.name}</span>
                      {file.isEncrypted && <Lock size={9} style={{ position: 'absolute', top: '6px', right: '6px', color: t.accent }} />}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Details drawer */}
            {drawerOpen && selected && (
              <DetailsDrawer file={selected} t={t} onClose={() => { setDrawerOpen(false); setSelected(null); }} onStar={() => toggleStar(selected)} onDelete={() => { section === 'trash' ? hardDeleteFile(selected) : trashFile(selected); }} onRestore={() => restoreFile(selected)} onRename={() => { setRenamingId(selected.id); setRenameValue(selected.name); setDrawerOpen(false); }} inTrash={section === 'trash'} copied={copied} onCopy={copyText} />
            )}
          </div>

          {/* Status bar */}
          <div style={{ background: t.surface, borderTop: `1px solid ${t.border}`, padding: '3px 12px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '10px', color: t.muted, flexShrink: 0 }}>
            <span>{currentFolders.length} folder{currentFolders.length !== 1 ? 's' : ''}, {displayFiles.length} file{displayFiles.length !== 1 ? 's' : ''}</span>
            <span>{formatBytes(displayFiles.reduce((a, f) => a + f.size, 0))}</span>
            <span style={{ marginLeft: 'auto' }}>🔒 AES-256-GCM · IPFS via Lighthouse</span>
          </div>
        </div>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y} t={t}
          isFolder={ctxMenu.isFolder}
          inTrash={section === 'trash'}
          onRename={() => { setRenamingId((ctxMenu.item as { id: string }).id); setRenameValue(ctxMenu.item.name); setCtxMenu(null); }}
          onDelete={() => { if (ctxMenu.isFolder) deleteFolder(ctxMenu.item as FoldrFolder); else (section === 'trash' ? hardDeleteFile : trashFile)(ctxMenu.item as FoldrFile); setCtxMenu(null); }}
          onStar={ctxMenu.isFolder ? undefined : () => { toggleStar(ctxMenu.item as FoldrFile); setCtxMenu(null); }}
          onRestore={ctxMenu.isFolder ? undefined : () => { restoreFile(ctxMenu.item as FoldrFile); setCtxMenu(null); }}
          isStarred={(ctxMenu.item as FoldrFile).isStarred}
        />
      )}
    </div>
  );
}

/* ── Sub-components ── */

function FolderTree({ folders, parentId, currentId, depth, t, onSelect }: {
  folders: FoldrFolder[];
  parentId: string | null;
  currentId: string | null;
  depth: number;
  t: Theme;
  onSelect: (f: FoldrFolder) => void;
}) {
  const children = folders.filter(f => f.parentId === parentId);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <div>
      {children.map(f => {
        const hasKids = folders.some(x => x.parentId === f.id);
        const isActive = f.id === currentId;
        return (
          <div key={f.id}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: `3px 4px 3px ${depth * 12 + 4}px`, cursor: 'pointer', borderRadius: '5px', background: isActive ? t.rowSelected : 'transparent', color: isActive ? t.text : t.muted, fontSize: '11px' }}
              onClick={() => onSelect(f)}
            >
              {hasKids ? (
                <button onClick={e => { e.stopPropagation(); setExpanded(x => ({ ...x, [f.id]: !x[f.id] })); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.muted, padding: '0', display: 'flex' }}>
                  {expanded[f.id] ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                </button>
              ) : <span style={{ width: '10px' }} />}
              <FolderIcon size={11} style={{ color: t.folderColor }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
            </div>
            {expanded[f.id] && <FolderTree folders={folders} parentId={f.id} currentId={currentId} depth={depth + 1} t={t} onSelect={onSelect} />}
          </div>
        );
      })}
    </div>
  );
}

function DetailsDrawer({ file, t, onClose, onStar, onDelete, onRestore, onRename, inTrash, copied, onCopy }: {
  file: FoldrFile; t: Theme; onClose: () => void; onStar: () => void; onDelete: () => void; onRestore: () => void; onRename: () => void; inTrash: boolean; copied: string | null; onCopy: (text: string, key: string) => void;
}) {
  const isImg = file.mimeType.startsWith('image/');
  const isVideo = file.mimeType.startsWith('video/');
  const isAudio = file.mimeType.startsWith('audio/');

  const s = {
    drawer: { width: '220px', flexShrink: 0, borderLeft: `1px solid ${t.border}`, background: t.surface, display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' },
    label: { fontSize: '9px', color: t.muted, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: '3px' },
    code: { background: t.surface2, border: `1px solid ${t.border}`, borderRadius: '5px', padding: '4px 6px', fontSize: '9px', fontFamily: 'monospace', wordBreak: 'break-all' as const, color: t.text },
  };

  return (
    <div style={s.drawer}>
      {/* Preview */}
      <div style={{ height: '130px', background: t.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative', borderBottom: `1px solid ${t.border}` }}>
        {isImg && <img src={file.url} alt={file.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />}
        {isVideo && <video src={file.url} controls style={{ maxWidth: '100%', maxHeight: '100%' }} />}
        {isAudio && <audio src={file.url} controls style={{ width: '90%' }} />}
        {!isImg && !isVideo && !isAudio && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <FileTypeIcon mime={file.mimeType} size={36} />
            <span style={{ fontSize: '10px', color: t.muted }}>{file.mimeType}</span>
          </div>
        )}
        <button onClick={onClose} style={{ position: 'absolute', top: '6px', right: '6px', background: t.surface + 'cc', border: 'none', borderRadius: '50%', padding: '4px', cursor: 'pointer', color: t.text, display: 'flex' }}>
          <X size={12} />
        </button>
      </div>

      {/* Info */}
      <div style={{ flex: 1, overflow: 'auto', padding: '10px' }}>
        <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '2px', wordBreak: 'break-word' }}>{file.name}</div>
        <div style={{ fontSize: '10px', color: t.muted, marginBottom: '10px' }}>{formatBytes(file.size)}</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>
            <div style={s.label}>Uploaded</div>
            <div style={{ fontSize: '11px' }}>{new Date(file.uploadedAt).toLocaleString()}</div>
          </div>
          <div>
            <div style={s.label}>Encryption</div>
            <div style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {file.isEncrypted ? (
                <><Lock size={11} style={{ color: t.accent }} /> AES-256-GCM</>
              ) : 'Not encrypted'}
            </div>
          </div>
          <div>
            <div style={s.label}>IPFS CID</div>
            <div style={{ ...s.code, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.cid}</span>
              <button onClick={() => onCopy(file.cid, 'cid')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.muted, flexShrink: 0 }}>
                {copied === 'cid' ? <CheckCheck size={11} style={{ color: '#22c55e' }} /> : <Copy size={11} />}
              </button>
            </div>
          </div>
          <div>
            <div style={s.label}>Gateway URL</div>
            <div style={{ ...s.code, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <a href={file.gatewayUrl} target="_blank" rel="noopener noreferrer" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: t.accent }}>
                Open <ExternalLink size={9} style={{ display: 'inline', verticalAlign: 'middle' }} />
              </a>
              <button onClick={() => onCopy(file.gatewayUrl, 'url')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.muted, flexShrink: 0 }}>
                {copied === 'url' ? <CheckCheck size={11} style={{ color: '#22c55e' }} /> : <Copy size={11} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ padding: '8px 10px', borderTop: `1px solid ${t.border}`, display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
        {inTrash ? (
          <>
            <a href={file.url} download={file.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '5px', borderRadius: '6px', border: `1px solid ${t.border}`, color: t.text, fontSize: '11px', textDecoration: 'none', cursor: 'pointer' }}>
              <Download size={12} /> Download
            </a>
            <button onClick={onRestore} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '5px', borderRadius: '6px', border: `1px solid ${t.border}`, background: 'none', color: t.text, fontSize: '11px', cursor: 'pointer' }}>
              <RotateCcw size={12} /> Restore
            </button>
            <button onClick={onDelete} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '5px', borderRadius: '6px', border: 'none', background: '#ef444420', color: '#ef4444', fontSize: '11px', cursor: 'pointer' }}>
              <Trash2 size={12} /> Delete Forever
            </button>
          </>
        ) : (
          <>
            <a href={file.url + '?download=1'} download={file.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '5px', borderRadius: '6px', background: t.accent, color: t.accentText, fontSize: '11px', textDecoration: 'none', fontWeight: 600 }}>
              <Download size={12} /> Download
            </a>
            <button onClick={onStar} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '5px', borderRadius: '6px', border: `1px solid ${t.border}`, background: 'none', color: file.isStarred ? '#f59e0b' : t.text, fontSize: '11px', cursor: 'pointer' }}>
              <Star size={12} /> {file.isStarred ? 'Unstar' : 'Star'}
            </button>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button onClick={onRename} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '5px', borderRadius: '6px', border: `1px solid ${t.border}`, background: 'none', color: t.text, fontSize: '11px', cursor: 'pointer' }}>
                <Edit2 size={11} /> Rename
              </button>
              <button onClick={onDelete} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '5px', borderRadius: '6px', border: 'none', background: '#ef444415', color: '#ef4444', fontSize: '11px', cursor: 'pointer' }}>
                <Trash2 size={11} /> Trash
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ContextMenu({ x, y, t, isFolder, inTrash, onRename, onDelete, onStar, onRestore, isStarred }: {
  x: number; y: number; t: Theme; isFolder: boolean; inTrash: boolean; onRename: () => void; onDelete: () => void; onStar?: () => void; onRestore?: () => void; isStarred?: boolean;
}) {
  return (
    <div style={{ position: 'fixed', left: x, top: y, zIndex: 9999, background: t.surface, border: `1px solid ${t.border}`, borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', overflow: 'hidden', minWidth: '160px', fontSize: '12px' }}>
      {inTrash ? (
        <>
          {onRestore && <CtxItem onClick={onRestore} icon={<RotateCcw size={12} />} t={t}>Restore</CtxItem>}
          <CtxItem onClick={onDelete} icon={<Trash2 size={12} />} t={t} danger>Delete Forever</CtxItem>
        </>
      ) : (
        <>
          <CtxItem onClick={onRename} icon={<Edit2 size={12} />} t={t}>Rename</CtxItem>
          {onStar && <CtxItem onClick={onStar} icon={<Star size={12} />} t={t}>{isStarred ? 'Unstar' : 'Star'}</CtxItem>}
          <div style={{ height: '1px', background: t.border, margin: '2px 0' }} />
          <CtxItem onClick={onDelete} icon={isFolder ? <FolderIcon size={12} /> : <Trash2 size={12} />} t={t} danger>
            {isFolder ? 'Delete Folder' : 'Move to Trash'}
          </CtxItem>
        </>
      )}
    </div>
  );
}

function CtxItem({ children, onClick, icon, t, danger }: { children: React.ReactNode; onClick: () => void; icon: React.ReactNode; t: Theme; danger?: boolean }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 12px', background: hov ? t.rowHover : 'none', border: 'none', cursor: 'pointer', color: danger ? '#ef4444' : t.text, textAlign: 'left', fontSize: '12px' }}
    >
      {icon}{children}
    </button>
  );
}
