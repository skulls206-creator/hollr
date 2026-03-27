/**
 * FoldrPanel — cloud file manager (AES-256-GCM · Cloudflare R2)
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
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

/* ── Types ── */
interface FoldrFile {
  id: string;
  folderId: string | null;
  name: string;
  size: number;
  mimeType: string;
  cid: string;
  isEncrypted: boolean;
  isClientEncrypted: boolean;
  iv: string | null;
  isStarred: boolean;
  sortOrder: number;
  url: string;
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
type UploadStatus = 'idle' | 'encrypting' | 'uploading';

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

/* ── Client-side E2E Crypto ── */

/** Import a raw 32-byte key (base64) as a CryptoKey */
async function importAesKey(rawBase64: string): Promise<CryptoKey> {
  const rawBytes = Uint8Array.from(atob(rawBase64), c => c.charCodeAt(0));
  return window.crypto.subtle.importKey('raw', rawBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** Generate a new 256-bit AES-GCM CryptoKey */
async function generateAesKey(): Promise<CryptoKey> {
  return window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

/** Export a CryptoKey to base64 raw bytes */
async function exportAesKey(key: CryptoKey): Promise<string> {
  const raw = await window.crypto.subtle.exportKey('raw', key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

/** Encrypt a file's ArrayBuffer. Returns { ciphertext: Uint8Array, ivBase64: string } */
async function encryptBuffer(key: CryptoKey, data: ArrayBuffer): Promise<{ ciphertext: Uint8Array; ivBase64: string }> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ct = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  const ivBase64 = btoa(String.fromCharCode(...iv));
  return { ciphertext: new Uint8Array(ct), ivBase64 };
}

/** Decrypt a Uint8Array. IV is base64-encoded. */
async function decryptBuffer(key: CryptoKey, ciphertext: Uint8Array, ivBase64: string): Promise<ArrayBuffer> {
  const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));
  return window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
}

/* ══════════════════════════════════════════════════════════════════════════ */
export function FoldrPanel({ storagePrefix }: NativePanelProps) {
  const { user } = useAuth();
  const [themeId, setThemeId] = useState<string>(() =>
    localStorage.getItem(`${storagePrefix}:theme`) ?? 'midnight'
  );
  const t = THEMES[themeId] ?? THEMES.midnight;

  // Per-user AES key (held in memory only)
  const cryptoKeyRef = useRef<CryptoKey | null>(null);
  const [keyReady, setKeyReady] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  // Data
  const [files, setFiles] = useState<FoldrFile[]>([]);
  const [folders, setFolders] = useState<FoldrFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadName, setUploadName] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Navigation
  const [section, setSection] = useState<SectionId>('browse');
  const [folderStack, setFolderStack] = useState<(FoldrFolder | null)[]>([null]);
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

  // Row hover state
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const setView = (v: 'list' | 'grid') => { setViewMode(v); localStorage.setItem(`${storagePrefix}:view`, v); };
  const setTheme = (id: string) => { setThemeId(id); localStorage.setItem(`${storagePrefix}:theme`, id); };

  /* ── Key management ── */
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function initKey() {
      try {
        // Try to fetch existing key from server
        const res = await fetch(`${API}api/foldr/key`, { credentials: 'include' });
        if (cancelled) return;

        if (res.ok) {
          const { key } = await res.json();
          const cryptoKey = await importAesKey(key);
          if (cancelled) return;
          cryptoKeyRef.current = cryptoKey;
          setKeyReady(true);
        } else if (res.status === 404) {
          // First time: generate a new key, upload wrapped to server
          const newKey = await generateAesKey();
          const rawBase64 = await exportAesKey(newKey);
          const postRes = await fetch(`${API}api/foldr/key`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: rawBase64 }),
          });
          if (cancelled) return;
          if (!postRes.ok) throw new Error('Failed to store encryption key');
          cryptoKeyRef.current = newKey;
          setKeyReady(true);
        } else {
          throw new Error(`Key fetch failed: ${res.status}`);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[Foldr] key init error:', err);
          setKeyError('Encryption key unavailable. Files cannot be uploaded or decrypted.');
        }
      }
    }

    initKey();
    return () => { cancelled = true; };
  }, [user]);

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

  /* ── Upload (client-side E2E encrypt) ── */
  const handleUpload = useCallback(async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList);
    setUploadError(null);

    for (const file of arr) {
      // 100 MB client-side check
      if (file.size > MAX_FILE_SIZE) {
        setUploadError(`"${file.name}" is too large. Maximum file size is 100 MB.`);
        continue;
      }

      if (!cryptoKeyRef.current) {
        setUploadError('Encryption key not ready. Please wait and try again.');
        continue;
      }

      setUploadName(file.name);

      try {
        // Step 1: Encrypt in browser
        setUploadStatus('encrypting');
        const arrayBuf = await file.arrayBuffer();
        const { ciphertext, ivBase64 } = await encryptBuffer(cryptoKeyRef.current, arrayBuf);

        // Step 2: Request presigned upload URL
        // Send plaintext size (what users see) to the server; server enforces 100MB on plaintext
        const urlRes = await fetch(`${API}api/foldr/upload-url`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: file.name,
            size: file.size,
            mimeType: file.type || 'application/octet-stream',
            folderId: currentFolder?.id ?? null,
            iv: ivBase64,
          }),
        });

        if (!urlRes.ok) {
          const err = await urlRes.json().catch(() => ({ error: 'Upload failed' }));
          setUploadError(err.error ?? 'Upload failed');
          continue;
        }

        const { uploadUrl, file: newFile } = await urlRes.json();

        // Step 3: PUT ciphertext directly to R2
        setUploadStatus('uploading');
        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          body: ciphertext,
          headers: { 'Content-Type': 'application/octet-stream' },
        });

        if (!putRes.ok) {
          setUploadError('Upload to storage failed. Please try again.');
          continue;
        }

        setFiles(prev => [newFile, ...prev]);
      } catch (err) {
        console.error('[Foldr] upload error:', err);
        setUploadError('Upload failed. Please try again.');
      }
    }

    setUploadStatus('idle');
    setUploadName('');
  }, [currentFolder]);

  /* ── Download / Preview (client-side decrypt) ── */
  const downloadOrPreview = useCallback(async (file: FoldrFile, forceDownload = false): Promise<string | null> => {
    if (!file.isClientEncrypted) {
      // Legacy file: use server-side content endpoint
      return file.url + (forceDownload ? '?download=1' : '');
    }

    if (!cryptoKeyRef.current || !file.iv) {
      setUploadError('Cannot decrypt file: encryption key not available.');
      return null;
    }

    try {
      // Get presigned download URL
      const res = await fetch(`${API}api/foldr/files/${file.id}/download-url`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to get download URL');
      const { downloadUrl, iv } = await res.json();

      // Fetch ciphertext from R2 directly
      const fetchRes = await fetch(downloadUrl);
      if (!fetchRes.ok) throw new Error('Failed to fetch encrypted file');
      const ciphertext = new Uint8Array(await fetchRes.arrayBuffer());

      // Decrypt in browser
      const plaintext = await decryptBuffer(cryptoKeyRef.current, ciphertext, iv);

      // Create blob URL
      const blob = new Blob([plaintext], { type: file.mimeType });
      return URL.createObjectURL(blob);
    } catch (err) {
      console.error('[Foldr] decrypt error:', err);
      setUploadError('Failed to decrypt file.');
      return null;
    }
  }, []);

  const triggerDownload = useCallback(async (file: FoldrFile) => {
    const url = await downloadOrPreview(file, true);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    if (file.isClientEncrypted) setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, [downloadOrPreview]);

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

  const duplicateFile = useCallback(async (file: FoldrFile) => {
    const url = await downloadOrPreview(file, false);
    if (!url) return;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const ext = file.name.includes('.') ? '' : '';
      const dotIdx = file.name.lastIndexOf('.');
      const base = dotIdx > 0 ? file.name.slice(0, dotIdx) : file.name;
      const extPart = dotIdx > 0 ? file.name.slice(dotIdx) : '';
      const newFile = new File([blob], `${base} (copy)${extPart}`, { type: file.mimeType });
      await handleUpload([newFile]);
      if (file.isClientEncrypted) setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      setUploadError('Failed to duplicate file.');
    }
  }, [downloadOrPreview, handleUpload]);

  const createSubfolderIn = useCallback(async (parentFolder: FoldrFolder, name: string) => {
    const res = await fetch(`${API}api/foldr/folders`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parentId: parentFolder.id }),
    });
    if (res.ok) { const f: FoldrFolder = await res.json(); setFolders(prev => [...prev, f]); }
  }, []);

  /* ── Drag/drop sort ── */
  const onDragStart = (type: 'file' | 'folder', id: string) => { dragItem.current = { type, id }; };
  const onDragOver = (e: React.DragEvent, id: string) => { e.preventDefault(); dragOver.current = id; };
  const onDrop = async (e: React.DragEvent, targetId: string, targetType: 'file' | 'folder') => {
    e.preventDefault();
    if (!dragItem.current || dragItem.current.id === targetId) return;
    const src = dragItem.current;

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

  const uploading = uploadStatus !== 'idle';

  const s = {
    panel: { background: t.bg, color: t.text, height: '100%', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', fontSize: '13px', position: 'relative' as const },
    input: { background: t.surface2, border: `1px solid ${t.border}`, color: t.text, borderRadius: '10px', padding: '8px 12px', fontSize: '13px', outline: 'none', width: '100%' },
    iconBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.surface2, border: `1px solid ${t.border}`, borderRadius: '10px', padding: '8px', cursor: 'pointer', color: t.text },
    accentBtn: { display: 'flex', alignItems: 'center', gap: '6px', background: t.accent, color: t.accentText, border: 'none', borderRadius: '12px', padding: '9px 16px', fontSize: '13px', fontWeight: 600 as const, cursor: 'pointer' },
    fileCard: (isSelected: boolean) => ({
      background: isSelected ? t.rowSelected : t.surface,
      border: `1px solid ${isSelected ? t.accent : t.border}`,
      borderRadius: '14px', padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: '12px',
      cursor: 'pointer', transition: 'background 0.12s',
      marginBottom: '8px',
    }),
    folderCard: (isHovered: boolean) => ({
      background: isHovered ? t.surface2 : t.surface,
      border: `1px solid ${t.border}`,
      borderRadius: '14px', padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: '12px',
      cursor: 'pointer', transition: 'background 0.12s',
      marginBottom: '8px',
    }),
  };

  return (
    <div style={s.panel}>

      {/* ── Header ── */}
      <div style={{ background: t.surface, borderBottom: `1px solid ${t.border}`, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
          <Lock size={15} style={{ color: t.accent, flexShrink: 0 }} />
          <span style={{ fontWeight: 700, fontSize: '14px' }}>Foldr</span>
          <span style={{ fontSize: '10px', color: t.muted, background: t.surface2, borderRadius: '6px', padding: '2px 7px', border: `1px solid ${t.border}`, flexShrink: 0 }}>AES-256-GCM</span>
        </div>
        <span style={{ fontSize: '11px', color: t.muted, flexShrink: 0 }}>{formatBytes(totalSize)}</span>
        <button onClick={fetchAll} style={{ ...s.iconBtn, padding: '6px' }} title="Refresh"><RefreshCw size={14} /></button>
        {/* Theme picker */}
        <div style={{ position: 'relative' }} ref={themePickerRef}>
          <button onClick={() => setShowThemePicker(v => !v)} style={{ ...s.iconBtn, padding: '6px' }} title="Theme">
            <Palette size={14} />
          </button>
          {showThemePicker && (
            <div style={{ position: 'absolute', right: 0, top: '110%', background: t.surface, border: `1px solid ${t.border}`, borderRadius: '14px', padding: '12px 14px', zIndex: 200, minWidth: '168px', boxShadow: '0 12px 40px rgba(0,0,0,0.4)' }}>
              <div style={{ fontSize: '10px', color: t.muted, marginBottom: '10px', fontWeight: 700, letterSpacing: '0.05em' }}>THEME</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {Object.entries(THEMES).map(([id, th]) => (
                  <button key={id} onClick={() => { setTheme(id); setShowThemePicker(false); }} title={th.label}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', background: 'none', border: 'none', cursor: 'pointer', padding: '5px', borderRadius: '8px', outline: themeId === id ? `2px solid ${t.accent}` : 'none' }}>
                    <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: th.bg, border: `2px solid ${th.dot}` }} />
                    <span style={{ fontSize: '9px', color: t.muted }}>{th.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Toolbar: breadcrumbs + search + actions ── */}
      <div style={{ background: t.surface, borderBottom: `1px solid ${t.border}`, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {folderStack.length > 1 && (
          <button onClick={() => setFolderStack(st => st.slice(0, -1))} style={{ ...s.iconBtn, padding: '6px', flexShrink: 0 }}>
            <ArrowLeft size={16} />
          </button>
        )}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden', minWidth: 0 }}>
          {breadcrumbs.map((b, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: i < breadcrumbs.length - 1 ? 0 : 1, minWidth: 0 }}>
              {i > 0 && <ChevronRight size={12} style={{ color: t.muted, flexShrink: 0 }} />}
              <button onClick={() => setFolderStack(st => st.slice(0, b.index + 1))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: i === breadcrumbs.length - 1 ? t.text : t.muted, fontWeight: i === breadcrumbs.length - 1 ? 700 : 400, fontSize: '13px', padding: '2px 4px', borderRadius: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                {b.label}
              </button>
            </span>
          ))}
        </div>
        {/* Search */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Search size={13} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: t.muted }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
            style={{ ...s.input, paddingLeft: '30px', width: '130px', fontSize: '12px', padding: '6px 10px 6px 30px' }} />
        </div>
        {section === 'browse' && (
          <button onClick={() => fileInputRef.current?.click()} style={{ ...s.iconBtn, padding: '6px', flexShrink: 0, background: t.accent, border: 'none', color: t.accentText }} disabled={uploading || !keyReady}>
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          </button>
        )}
        <button onClick={() => setView(viewMode === 'list' ? 'grid' : 'list')} style={{ ...s.iconBtn, padding: '6px', flexShrink: 0 }}>
          {viewMode === 'list' ? <LayoutGrid size={15} /> : <List size={15} />}
        </button>
      </div>
      <input ref={fileInputRef} type="file" multiple hidden onChange={e => e.target.files && handleUpload(e.target.files)} />

      {/* Banners */}
      {keyError && (
        <div style={{ background: '#ef444420', color: '#ef4444', padding: '8px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
          <Lock size={12} />{keyError}
        </div>
      )}
      {uploadError && (
        <div style={{ background: '#ef444420', color: '#ef4444', padding: '8px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
          <X size={12} style={{ cursor: 'pointer' }} onClick={() => setUploadError(null)} />{uploadError}
        </div>
      )}
      {uploading && (
        <div style={{ background: t.accent + '20', color: t.accent, padding: '8px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
          <Loader2 size={12} className="animate-spin" />
          {uploadStatus === 'encrypting' ? `Encrypting ${uploadName}…` : `Uploading ${uploadName}…`}
        </div>
      )}

      {/* ── Content area (full width) ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length && section === 'browse') handleUpload(e.dataTransfer.files); }}
      >
        {/* New folder row */}
        {creatingFolder && (
          <div style={{ ...s.folderCard(false), background: t.surface2 }}>
            <div style={{ width: 40, height: 40, borderRadius: '10px', background: t.accent + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <FolderIcon size={22} style={{ color: t.folderColor }} />
            </div>
            <input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setCreatingFolder(false); }}
              onBlur={createFolder} placeholder="Folder name" style={{ ...s.input, fontSize: '13px', flex: 1 }} />
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '140px', color: t.muted }}>
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : currentFolders.length === 0 && displayFiles.length === 0 && !creatingFolder ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '180px', color: t.muted, gap: '14px' }}>
            <div style={{ width: 64, height: 64, borderRadius: '18px', background: t.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FolderIcon size={32} style={{ color: t.folderColor, opacity: 0.5 }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>{section === 'trash' ? 'Trash is empty' : 'No files yet'}</div>
              <div style={{ fontSize: '12px' }}>{section === 'browse' ? 'Tap the upload button to add files' : ''}</div>
            </div>
            {section === 'browse' && (
              <button onClick={() => fileInputRef.current?.click()} style={s.accentBtn} disabled={uploading || !keyReady}>
                <Upload size={14} /> Upload Files
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '10px' }}>
            {currentFolders.map(folder => (
              <div key={folder.id}
                onDoubleClick={() => setFolderStack(st => [...st, folder])}
                onClick={() => setFolderStack(st => [...st, folder])}
                onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, item: folder, isFolder: true }); }}
                onMouseEnter={() => setHoveredId(folder.id)} onMouseLeave={() => setHoveredId(null)}
                style={{ background: hoveredId === folder.id ? t.surface2 : t.surface, border: `1px solid ${t.border}`, borderRadius: '14px', padding: '14px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer', transition: 'background 0.1s' }}>
                <FolderIcon size={34} style={{ color: t.folderColor }} />
                <span style={{ fontSize: '11px', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', color: t.text }}>{folder.name}</span>
              </div>
            ))}
            {displayFiles.map(file => (
              <div key={file.id}
                onClick={() => { setSelected(file); setDrawerOpen(true); }}
                onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, item: file, isFolder: false }); }}
                onMouseEnter={() => setHoveredId(file.id)} onMouseLeave={() => setHoveredId(null)}
                style={{ background: selected?.id === file.id ? t.rowSelected : hoveredId === file.id ? t.surface2 : t.surface, border: `1px solid ${selected?.id === file.id ? t.accent : t.border}`, borderRadius: '14px', padding: '10px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer', transition: 'background 0.1s', position: 'relative' }}>
                <div style={{ width: '56px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.surface2, borderRadius: '10px' }}>
                  <FileTypeIcon mime={file.mimeType} size={26} />
                </div>
                <span style={{ fontSize: '10px', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', color: t.text }}>{file.name}</span>
                {file.isEncrypted && <Lock size={9} style={{ position: 'absolute', top: '7px', right: '7px', color: t.accent }} />}
              </div>
            ))}
          </div>
        ) : (
          /* ── List view: beautiful cards ── */
          <div>
            {/* Folders */}
            {currentFolders.map(folder => (
              <div key={folder.id}
                draggable onDragStart={() => onDragStart('folder', folder.id)}
                onDragOver={e => onDragOver(e, folder.id)} onDrop={e => onDrop(e, folder.id, 'folder')}
                onMouseEnter={() => setHoveredId(folder.id)} onMouseLeave={() => setHoveredId(null)}
                onClick={() => setFolderStack(st => [...st, folder])}
                onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, item: folder, isFolder: true }); }}
                style={s.folderCard(hoveredId === folder.id)}
              >
                <div style={{ width: 42, height: 42, borderRadius: '11px', background: t.accent + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FolderIcon size={22} style={{ color: t.folderColor }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {renamingId === folder.id ? (
                    <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') submitRename(folder.id, true); if (e.key === 'Escape') setRenamingId(null); }}
                      onBlur={() => submitRename(folder.id, true)} style={{ ...s.input, fontSize: '13px' }} onClick={e => e.stopPropagation()} />
                  ) : (
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: t.text }}>{folder.name}</div>
                  )}
                  <div style={{ fontSize: '11px', color: t.muted, marginTop: '2px' }}>{formatDate(folder.createdAt)}</div>
                </div>
                <button onClick={e => { e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, item: folder, isFolder: true }); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.muted, padding: '4px' }}>
                  <MoreHorizontal size={16} />
                </button>
                <ChevronRight size={16} style={{ color: t.muted, flexShrink: 0 }} />
              </div>
            ))}

            {/* Files (list view) */}
            {displayFiles.map(file => (
              <div key={file.id}
                draggable onDragStart={() => onDragStart('file', file.id)}
                onDragOver={e => onDragOver(e, file.id)} onDrop={e => onDrop(e, file.id, 'file')}
                onMouseEnter={() => setHoveredId(file.id)} onMouseLeave={() => setHoveredId(null)}
                onClick={() => { setSelected(file); setDrawerOpen(true); }}
                onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, item: file, isFolder: false }); }}
                style={s.fileCard(selected?.id === file.id)}
              >
                <div style={{ width: 42, height: 42, borderRadius: '11px', background: t.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }}>
                  <FileTypeIcon mime={file.mimeType} size={22} />
                  {file.isEncrypted && (
                    <div style={{ position: 'absolute', bottom: -3, right: -3, background: t.accent, borderRadius: '50%', padding: '2px', lineHeight: 0 }}>
                      <Lock size={8} style={{ color: t.accentText }} />
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {renamingId === file.id ? (
                    <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') submitRename(file.id, false); if (e.key === 'Escape') setRenamingId(null); }}
                      onBlur={() => submitRename(file.id, false)} style={{ ...s.input, fontSize: '13px' }} onClick={e => e.stopPropagation()} />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: t.text }}>{file.name}</div>
                      {file.isStarred && <Star size={11} style={{ color: '#f59e0b', flexShrink: 0 }} fill="currentColor" />}
                    </div>
                  )}
                  <div style={{ fontSize: '11px', color: t.muted, marginTop: '2px' }}>{formatBytes(file.size)} · {formatDate(file.uploadedAt)}</div>
                </div>
                <button onClick={e => { e.stopPropagation(); toggleStar(file); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: file.isStarred ? '#f59e0b' : t.muted, padding: '6px', flexShrink: 0 }}>
                  <Star size={14} />
                </button>
                <button onClick={e => { e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, item: file, isFolder: false }); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.muted, padding: '6px', flexShrink: 0 }}>
                  <MoreHorizontal size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── New folder FAB (browse only) ── */}
      {section === 'browse' && (
        <button
          onClick={() => { setCreatingFolder(true); setNewFolderName(''); }}
          style={{ position: 'absolute', bottom: 72, right: 16, width: 44, height: 44, borderRadius: '13px', background: t.surface, border: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.3)', zIndex: 10 }}
          title="New Folder"
        >
          <FolderPlus size={18} style={{ color: t.text }} />
        </button>
      )}

      {/* ── Bottom tab bar ── */}
      <div style={{ display: 'flex', borderTop: `1px solid ${t.border}`, background: t.surface, flexShrink: 0 }}>
        {([
          ['browse', FolderOpen, 'My Files'],
          ['starred', Star, 'Starred'],
          ['trash', Trash2, 'Trash'],
        ] as const).map(([id, Icon, label]) => (
          <button key={id}
            onClick={() => { setSection(id as SectionId); setFolderStack([null]); }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 0 8px', background: 'none', border: 'none', cursor: 'pointer', color: section === id ? t.accent : t.muted, gap: '3px' }}>
            <Icon size={18} />
            <span style={{ fontSize: '10px', fontWeight: section === id ? 700 : 400 }}>{label}</span>
            {section === id && <div style={{ width: '18px', height: '2px', borderRadius: '9px', background: t.accent, marginTop: '1px' }} />}
          </button>
        ))}
      </div>

      {/* ── Details bottom sheet ── */}
      {drawerOpen && selected && (
        <DetailsDrawer
          file={selected}
          t={t}
          onClose={() => { setDrawerOpen(false); setSelected(null); }}
          onStar={() => toggleStar(selected)}
          onDelete={() => { section === 'trash' ? hardDeleteFile(selected) : trashFile(selected); }}
          onRestore={() => restoreFile(selected)}
          onRename={() => { setRenamingId(selected.id); setRenameValue(selected.name); setDrawerOpen(false); }}
          onDownload={() => triggerDownload(selected)}
          onGetPreviewUrl={() => downloadOrPreview(selected, false)}
          inTrash={section === 'trash'}
          copied={copied}
          onCopy={copyText}
        />
      )}

      {/* Context menu */}
      {ctxMenu && (
        <FoldrCtxMenu
          x={ctxMenu.x} y={ctxMenu.y} t={t}
          isFolder={ctxMenu.isFolder}
          inTrash={section === 'trash'}
          item={ctxMenu.item}
          onClose={() => setCtxMenu(null)}
          onOpen={() => {
            if (ctxMenu.isFolder) setFolderStack(st => [...st, ctxMenu.item as FoldrFolder]);
            else { setSelected(ctxMenu.item as FoldrFile); setDrawerOpen(true); }
            setCtxMenu(null);
          }}
          onDownload={ctxMenu.isFolder ? undefined : () => { triggerDownload(ctxMenu.item as FoldrFile); setCtxMenu(null); }}
          onRename={() => { setRenamingId((ctxMenu.item as { id: string }).id); setRenameValue(ctxMenu.item.name); setCtxMenu(null); }}
          onDuplicate={ctxMenu.isFolder ? undefined : () => { duplicateFile(ctxMenu.item as FoldrFile); setCtxMenu(null); }}
          onDelete={() => { if (ctxMenu.isFolder) deleteFolder(ctxMenu.item as FoldrFolder); else (section === 'trash' ? hardDeleteFile : trashFile)(ctxMenu.item as FoldrFile); setCtxMenu(null); }}
          onStar={ctxMenu.isFolder ? undefined : () => { toggleStar(ctxMenu.item as FoldrFile); setCtxMenu(null); }}
          onRestore={ctxMenu.isFolder ? undefined : () => { restoreFile(ctxMenu.item as FoldrFile); setCtxMenu(null); }}
          isStarred={!(ctxMenu.isFolder) && (ctxMenu.item as FoldrFile).isStarred}
          onNewSubfolder={ctxMenu.isFolder ? (name: string) => { createSubfolderIn(ctxMenu.item as FoldrFolder, name); setCtxMenu(null); } : undefined}
          onCopyName={() => { navigator.clipboard.writeText(ctxMenu.item.name).catch(() => {}); setCtxMenu(null); }}
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

function DetailsDrawer({ file, t, onClose, onStar, onDelete, onRestore, onRename, onDownload, onGetPreviewUrl, inTrash, copied, onCopy }: {
  file: FoldrFile; t: Theme; onClose: () => void; onStar: () => void; onDelete: () => void; onRestore: () => void; onRename: () => void; onDownload: () => void; onGetPreviewUrl: () => Promise<string | null>; inTrash: boolean; copied: string | null; onCopy: (text: string, key: string) => void;
}) {
  const isImg = file.mimeType.startsWith('image/');
  const isVideo = file.mimeType.startsWith('video/');
  const isAudio = file.mimeType.startsWith('audio/');
  const isMedia = isImg || isVideo || isAudio;

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const prevBlobRef = useRef<string | null>(null);

  useEffect(() => {
    if (prevBlobRef.current) { URL.revokeObjectURL(prevBlobRef.current); prevBlobRef.current = null; }
    setPreviewUrl(null);
    if (!isMedia) return;
    if (!file.isClientEncrypted) { setPreviewUrl(file.url); return; }
    let cancelled = false;
    setPreviewLoading(true);
    onGetPreviewUrl().then(url => {
      if (cancelled) return;
      if (url?.startsWith('blob:')) prevBlobRef.current = url;
      setPreviewUrl(url); setPreviewLoading(false);
    }).catch(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id, file.isClientEncrypted]);

  const rowStyle = { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', fontSize: '13px', color: t.text, background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' as const };
  const labelStyle = { fontSize: '10px', color: t.muted, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: '4px' };

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }} />

      {/* Bottom sheet */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: t.surface, borderRadius: '20px 20px 0 0', zIndex: 50, maxHeight: '80%', display: 'flex', flexDirection: 'column', boxShadow: '0 -8px 40px rgba(0,0,0,0.4)', overflow: 'hidden' }}>

        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: t.border }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '6px 16px 12px', gap: '12px' }}>
          <div style={{ width: 48, height: 48, borderRadius: '13px', background: t.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {isMedia && previewUrl && isImg ? (
              <img src={previewUrl} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '13px' }} />
            ) : previewLoading ? (
              <Loader2 size={20} className="animate-spin" style={{ color: t.muted }} />
            ) : (
              <FileTypeIcon mime={file.mimeType} size={24} />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: t.text }}>{file.name}</div>
            <div style={{ fontSize: '12px', color: t.muted, marginTop: '2px' }}>
              {formatBytes(file.size)} · {formatDate(file.uploadedAt)}
              {file.isEncrypted && <span style={{ marginLeft: '6px', color: t.accent }}>🔒 Encrypted</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: t.surface2, border: 'none', borderRadius: '50%', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: t.text, flexShrink: 0 }}>
            <X size={15} />
          </button>
        </div>

        {/* Media preview */}
        {isMedia && previewUrl && (isVideo || isAudio) && (
          <div style={{ padding: '0 16px 10px' }}>
            {isVideo && <video src={previewUrl} controls style={{ width: '100%', borderRadius: '10px', background: t.surface2 }} />}
            {isAudio && <audio src={previewUrl} controls style={{ width: '100%' }} />}
          </div>
        )}

        <div style={{ height: 1, background: t.border }} />

        {/* Actions */}
        <div style={{ overflowY: 'auto' }}>
          {inTrash ? (
            <>
              <button onClick={onDownload} style={rowStyle}><Download size={16} style={{ color: t.muted }} /> Download</button>
              <button onClick={onRestore} style={rowStyle}><RotateCcw size={16} style={{ color: t.accent }} /> Restore</button>
              <button onClick={onDelete} style={{ ...rowStyle, color: '#ef4444' }}><Trash2 size={16} /> Delete Forever</button>
            </>
          ) : (
            <>
              <button onClick={onDownload} style={rowStyle}><Download size={16} style={{ color: t.accent }} /> Download</button>
              <button onClick={onStar} style={rowStyle}><Star size={16} style={{ color: file.isStarred ? '#f59e0b' : t.muted }} /> {file.isStarred ? 'Unstar' : 'Star'}</button>
              <button onClick={onRename} style={rowStyle}><Edit2 size={16} style={{ color: t.muted }} /> Rename</button>
              <button onClick={onDelete} style={{ ...rowStyle, color: '#ef4444' }}><Trash2 size={16} /> Move to Trash</button>
            </>
          )}

          <div style={{ height: 1, background: t.border, margin: '4px 0' }} />

          {/* Storage info */}
          <div style={{ padding: '10px 16px 6px' }}>
            <div style={labelStyle}>Storage Key</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: t.surface2, borderRadius: '8px', padding: '8px 10px' }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '11px', fontFamily: 'monospace', color: t.muted }}>{file.cid}</span>
              <button onClick={() => onCopy(file.cid, 'cid')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.muted, flexShrink: 0, padding: '2px' }}>
                {copied === 'cid' ? <CheckCheck size={13} style={{ color: '#22c55e' }} /> : <Copy size={13} />}
              </button>
            </div>
          </div>

          <div style={{ height: 'env(safe-area-inset-bottom, 10px)', minHeight: '10px' }} />
        </div>
      </div>
    </>
  );
}

/* ─── Rich context menu ─────────────────────────────────────────────────── */
function FoldrCtxMenu({ x, y, t, isFolder, inTrash, item, onClose, onOpen, onDownload, onRename, onDuplicate, onDelete, onStar, onRestore, isStarred, onNewSubfolder, onCopyName }: {
  x: number; y: number; t: Theme; isFolder: boolean; inTrash: boolean;
  item: FoldrFile | FoldrFolder;
  onClose: () => void; onOpen: () => void;
  onDownload?: () => void; onRename: () => void; onDuplicate?: () => void;
  onDelete: () => void; onStar?: () => void; onRestore?: () => void;
  isStarred?: boolean; onNewSubfolder?: (name: string) => void; onCopyName: () => void;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const [subfolderInput, setSubfolderInput] = useState('');
  const [showSubfolder, setShowSubfolder] = useState(false);
  const [copied, setCopied] = useState(false);

  const w = 220;
  const left = x + w > window.innerWidth ? x - w : x;
  const top = y + 480 > window.innerHeight ? Math.max(8, y - 480) : y;

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-foldr-ctx]')) onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', close, true);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', close, true); document.removeEventListener('keydown', key); };
  }, [onClose]);

  const file = isFolder ? null : item as FoldrFile;

  function Row({ icon, label, onClick, danger, sub }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean; sub?: string }) {
    return (
      <button
        data-foldr-ctx="true"
        onClick={onClick}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '7px 10px', background: 'none', border: 'none', cursor: 'pointer', color: danger ? '#f87171' : t.text, borderRadius: 7, fontSize: 12 }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = t.rowHover; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
      >
        <span style={{ color: danger ? '#f87171' : t.accent, width: 14, flexShrink: 0, display: 'flex' }}>{icon}</span>
        <span style={{ flex: 1 }}>{label}</span>
        {sub && <span style={{ color: t.muted, fontSize: 10 }}>{sub}</span>}
      </button>
    );
  }

  const sep = <div style={{ height: 1, background: t.border, margin: '3px 8px' }} />;

  return (
    <div
      data-foldr-ctx="true"
      onClick={e => e.stopPropagation()}
      style={{ position: 'fixed', top, left, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.45)', zIndex: 9999, minWidth: w, padding: '6px 4px', fontSize: 12 }}
    >
      {/* Item name */}
      <div style={{ padding: '6px 10px 8px', borderBottom: `1px solid ${t.border}`, marginBottom: 4 }}>
        <div style={{ fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: w - 24, fontSize: 12 }}>{item.name}</div>
        <div style={{ color: t.muted, fontSize: 10, marginTop: 2 }}>
          {isFolder ? 'Folder' : `${formatBytes((item as FoldrFile).size)} · ${(item as FoldrFile).mimeType.split('/')[1]?.toUpperCase() || 'File'}`}
        </div>
      </div>

      <Row icon={<FolderOpen size={13} />} label={isFolder ? 'Open Folder' : 'Open / Preview'} onClick={onOpen} />
      {!isFolder && onDownload && (
        <Row icon={<Download size={13} />} label="Download" onClick={onDownload} />
      )}

      {sep}

      <Row icon={<Edit2 size={13} />} label="Rename" onClick={onRename} />
      {!isFolder && onDuplicate && (
        <Row icon={<Copy size={13} />} label="Duplicate" onClick={onDuplicate} />
      )}
      <Row
        icon={copied ? <CheckCheck size={13} /> : <Copy size={13} />}
        label={copied ? 'Copied!' : 'Copy Filename'}
        onClick={() => {
          navigator.clipboard.writeText(item.name).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      />

      {sep}

      {isFolder && onNewSubfolder && (
        <>
          {showSubfolder ? (
            <div data-foldr-ctx="true" style={{ padding: '4px 8px 6px' }}>
              <input
                autoFocus
                placeholder="Subfolder name…"
                value={subfolderInput}
                onChange={e => setSubfolderInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && subfolderInput.trim()) { onNewSubfolder(subfolderInput.trim()); }
                  if (e.key === 'Escape') setShowSubfolder(false);
                }}
                style={{ width: '100%', padding: '5px 8px', background: t.surface2, border: `1px solid ${t.accent}`, borderRadius: 6, color: t.text, fontSize: 12, outline: 'none' }}
              />
            </div>
          ) : (
            <Row icon={<FolderPlus size={13} />} label="New Subfolder" onClick={() => setShowSubfolder(true)} />
          )}
          {sep}
        </>
      )}

      {!isFolder && onStar && (
        <Row icon={<Star size={13} />} label={isStarred ? 'Remove Star' : 'Add Star'} onClick={onStar} />
      )}

      {!isFolder && file && (
        <Row
          icon={<Info size={13} />}
          label={showInfo ? 'Hide Info' : 'Get Info'}
          onClick={() => setShowInfo(v => !v)}
        />
      )}

      {showInfo && file && (
        <div data-foldr-ctx="true" style={{ margin: '2px 8px 4px', padding: '8px 10px', background: t.surface2, borderRadius: 8, fontSize: 11 }}>
          {[
            ['Name', file.name],
            ['Size', formatBytes(file.size)],
            ['Type', file.mimeType],
            ['Uploaded', formatDate(file.uploadedAt)],
            ['Encrypted', file.isClientEncrypted ? 'Yes (AES-256)' : file.isEncrypted ? 'Server-side' : 'No'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
              <span style={{ color: t.muted, width: 64, flexShrink: 0 }}>{k}</span>
              <span style={{ color: t.text, wordBreak: 'break-all' }}>{v}</span>
            </div>
          ))}
        </div>
      )}

      {sep}

      {inTrash ? (
        <>
          {!isFolder && onRestore && <Row icon={<RotateCcw size={13} />} label="Restore" onClick={onRestore} />}
          <Row icon={<Trash2 size={13} />} label="Delete Forever" onClick={onDelete} danger />
        </>
      ) : (
        <Row icon={<Trash2 size={13} />} label="Move to Trash" onClick={onDelete} danger />
      )}
    </div>
  );
}
