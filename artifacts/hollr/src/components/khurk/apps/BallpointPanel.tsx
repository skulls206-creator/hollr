import { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileText, Plus, Star, Archive, Trash2, RotateCcw, Trash,
  Eye, EyeOff, FolderOpen, Search, X, Check, Edit2, Copy,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface NativePanelProps {
  dirHandle: FileSystemDirectoryHandle | null;
  onPickFolder: () => void;
}

type NoteSection = 'all' | 'favorites' | 'archive' | 'trash';

interface NoteEntry {
  name: string;
  content: string;
  lastModified: number;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function titleFromName(name: string): string {
  return name.replace(/\.(md|txt)$/i, '').replace(/[-_]/g, ' ');
}

const LAST_FOLDER_KEY = 'ballpoint:lastFolderName';

function storageKey(handle: FileSystemDirectoryHandle, suffix: string): string {
  return `bp:${handle.name}:${suffix}`;
}

function loadSet(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) ?? '[]')); } catch { return new Set(); }
}

function saveSet(key: string, s: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...s]));
}

function simpleMarkdown(text: string): string {
  if (!text.trim()) return '';
  let h = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```([\s\S]*?)```/g, (_m, c) => `<pre style="background:rgba(255,255,255,0.05);border-radius:6px;padding:8px 12px;font-size:11px;overflow-x:auto;margin:8px 0"><code>${c.trim()}</code></pre>`)
    .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:4px;font-size:11px">$1</code>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:1.2em;font-weight:700;margin:14px 0 4px">$1</h1>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:1em;font-weight:600;margin:12px 0 4px">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:.9em;font-weight:600;margin:10px 0 4px">$1</h3>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/^- \[x\] (.+)$/gim, '<div style="display:flex;gap:6px;align-items:flex-start;margin:2px 0"><input type="checkbox" checked disabled style="margin-top:3px;accent-color:#7c3aed"/><span style="opacity:.6;text-decoration:line-through">$1</span></div>')
    .replace(/^- \[ \] (.+)$/gim, '<div style="display:flex;gap:6px;align-items:flex-start;margin:2px 0"><input type="checkbox" disabled style="margin-top:3px"/><span>$1</span></div>')
    .replace(/^[-*] (.+)$/gm, '<li style="margin-left:16px;list-style-type:disc;margin-bottom:2px">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li style="margin-left:16px;list-style-type:decimal;margin-bottom:2px">$1</li>')
    .replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid #7c3aed;padding-left:10px;margin:6px 0;opacity:.7">$1</blockquote>')
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:12px 0"/>')
    .replace(/\n\n+/g, '</p><p style="margin:6px 0">')
    .replace(/\n/g, '<br/>');
  return `<p style="margin:6px 0">${h}</p>`;
}

export function BallpointPanel({ dirHandle, onPickFolder }: NativePanelProps) {
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [activeNote, setActiveNote] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [section, setSection] = useState<NoteSection>('all');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [archive, setArchive] = useState<Set<string>>(new Set());
  const [trash, setTrash] = useState<Set<string>>(new Set());
  const [showPreview, setShowPreview] = useState(false);
  const [search, setSearch] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [ctxMenu, setCtxMenu] = useState<{ note: string; x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeNoteRef = useRef<string | null>(null);
  const dirRef = useRef<FileSystemDirectoryHandle | null>(null);
  const contentRef = useRef('');
  activeNoteRef.current = activeNote;
  dirRef.current = dirHandle;
  contentRef.current = content;

  const loadNotes = useCallback(async (handle: FileSystemDirectoryHandle) => {
    setLoading(true);
    try {
      const entries: NoteEntry[] = [];
      for await (const entry of (handle as any).values()) {
        if (entry.kind !== 'file' || !/\.(md|txt)$/i.test(entry.name) || entry.name.startsWith('.')) continue;
        const file = await entry.getFile();
        entries.push({ name: entry.name, content: await file.text(), lastModified: file.lastModified });
      }
      entries.sort((a, b) => b.lastModified - a.lastModified);
      setNotes(entries);
      if (entries.length > 0) {
        setActiveNote(entries[0].name);
        setContent(entries[0].content);
      } else {
        setActiveNote(null);
        setContent('');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!dirHandle) { setNotes([]); setActiveNote(null); setContent(''); return; }
    // Persist folder name so we can show a reconnect prompt next time
    localStorage.setItem(LAST_FOLDER_KEY, dirHandle.name);
    setFavorites(loadSet(storageKey(dirHandle, 'fav')));
    setArchive(loadSet(storageKey(dirHandle, 'arc')));
    setTrash(loadSet(storageKey(dirHandle, 'trash')));
    loadNotes(dirHandle);
  }, [dirHandle, loadNotes]);

  const scheduleAutoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const handle = dirRef.current;
      const name = activeNoteRef.current;
      const text = contentRef.current;
      if (!handle || !name) return;
      setSaving(true);
      try {
        const fh = await handle.getFileHandle(name, { create: true });
        const w = await fh.createWritable();
        await w.write(text);
        await w.close();
        const now = Date.now();
        // Re-sort by lastModified desc so the edited note rises to top
        setNotes(prev =>
          prev
            .map(n => n.name === name ? { ...n, content: text, lastModified: now } : n)
            .sort((a, b) => b.lastModified - a.lastModified)
        );
      } catch (e) { console.warn('[Ballpoint] save:', e); }
      setSaving(false);
    }, 800);
  }, []);

  const handleContentChange = useCallback((val: string) => {
    setContent(val);
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const flushSave = useCallback(async () => {
    if (!saveTimerRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    const handle = dirRef.current;
    const name = activeNoteRef.current;
    if (!handle || !name) return;
    try {
      const fh = await handle.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(contentRef.current);
      await w.close();
    } catch {}
  }, []);

  const createNote = useCallback(async () => {
    if (!dirHandle) return;
    const existing = new Set(notes.map(n => n.name));
    let i = 1;
    let name = `untitled-${i}.md`;
    while (existing.has(name)) name = `untitled-${++i}.md`;
    try {
      const fh = await dirHandle.getFileHandle(name, { create: true });
      const w = await fh.createWritable(); await w.write(''); await w.close();
      const entry: NoteEntry = { name, content: '', lastModified: Date.now() };
      setNotes(prev => [entry, ...prev]);
      setActiveNote(name);
      setContent('');
      setSection('all');
    } catch (e) { console.warn('[Ballpoint] create:', e); }
  }, [dirHandle, notes]);

  const selectNote = useCallback(async (name: string) => {
    await flushSave();
    const note = notes.find(n => n.name === name);
    if (note) { setActiveNote(name); setContent(note.content); }
  }, [notes, flushSave]);

  const startRename = (name: string) => {
    setRenaming(name);
    setRenameVal(titleFromName(name));
    setCtxMenu(null);
  };

  const commitRename = useCallback(async () => {
    if (!dirHandle || !renaming || !renameVal.trim()) { setRenaming(null); return; }
    const ext = renaming.endsWith('.txt') ? '.txt' : '.md';
    let newName = renameVal.trim() + ext;
    if (newName === renaming) { setRenaming(null); return; }
    const existing = new Set(notes.map(n => n.name));
    let i = 1;
    const base = renameVal.trim();
    while (existing.has(newName) && newName !== renaming) newName = `${base}-${i++}${ext}`;
    try {
      const oldFh = await dirHandle.getFileHandle(renaming);
      const text = await (await oldFh.getFile()).text();
      const newFh = await dirHandle.getFileHandle(newName, { create: true });
      const w = await newFh.createWritable(); await w.write(text); await w.close();
      await (dirHandle as any).removeEntry(renaming);
      const migrate = (s: Set<string>, key: string): Set<string> => {
        if (!s.has(renaming)) return s;
        const n = new Set(s); n.delete(renaming); n.add(newName);
        saveSet(storageKey(dirHandle, key), n);
        return n;
      };
      setFavorites(p => migrate(p, 'fav'));
      setArchive(p => migrate(p, 'arc'));
      setTrash(p => migrate(p, 'trash'));
      setNotes(prev => prev.map(n => n.name === renaming ? { ...n, name: newName } : n));
      if (activeNote === renaming) setActiveNote(newName);
    } catch (e) { console.warn('[Ballpoint] rename:', e); }
    setRenaming(null);
  }, [dirHandle, renaming, renameVal, notes, activeNote]);

  const toggleFav = useCallback((name: string) => {
    if (!dirHandle) return;
    setFavorites(prev => {
      const n = new Set(prev);
      if (n.has(name)) n.delete(name); else n.add(name);
      saveSet(storageKey(dirHandle, 'fav'), n);
      return n;
    });
    setCtxMenu(null);
  }, [dirHandle]);

  const toggleArc = useCallback((name: string) => {
    if (!dirHandle) return;
    setArchive(prev => {
      const n = new Set(prev);
      if (n.has(name)) n.delete(name); else n.add(name);
      saveSet(storageKey(dirHandle, 'arc'), n);
      return n;
    });
    setCtxMenu(null);
  }, [dirHandle]);

  const moveToTrash = useCallback((name: string) => {
    if (!dirHandle) return;
    setTrash(prev => {
      const n = new Set(prev); n.add(name);
      saveSet(storageKey(dirHandle, 'trash'), n);
      return n;
    });
    if (activeNote === name) {
      const next = notes.find(n => n.name !== name && !trash.has(n.name));
      if (next) { setActiveNote(next.name); setContent(next.content); }
      else { setActiveNote(null); setContent(''); }
    }
    setCtxMenu(null);
  }, [dirHandle, activeNote, notes, trash]);

  const restoreNote = useCallback((name: string) => {
    if (!dirHandle) return;
    setTrash(prev => {
      const n = new Set(prev); n.delete(name);
      saveSet(storageKey(dirHandle, 'trash'), n);
      return n;
    });
    setCtxMenu(null);
  }, [dirHandle]);

  const deleteForever = useCallback(async (name: string) => {
    if (!dirHandle) return;
    try {
      await (dirHandle as any).removeEntry(name);
      setNotes(prev => prev.filter(n => n.name !== name));
      setTrash(prev => {
        const n = new Set(prev); n.delete(name);
        saveSet(storageKey(dirHandle, 'trash'), n);
        return n;
      });
      if (activeNote === name) { setActiveNote(null); setContent(''); }
    } catch (e) { console.warn('[Ballpoint] delete:', e); }
    setCtxMenu(null);
  }, [dirHandle, activeNote]);

  const duplicateNote = useCallback(async (name: string) => {
    if (!dirHandle) return;
    const note = notes.find(n => n.name === name);
    if (!note) return;
    const ext = name.endsWith('.txt') ? '.txt' : '.md';
    const base = name.replace(/\.(md|txt)$/, '');
    let newName = `${base} copy${ext}`;
    const existing = new Set(notes.map(n => n.name));
    let i = 1;
    while (existing.has(newName)) newName = `${base} copy ${i++}${ext}`;
    try {
      const fh = await dirHandle.getFileHandle(newName, { create: true });
      const w = await fh.createWritable(); await w.write(note.content); await w.close();
      setNotes(prev => [{ name: newName, content: note.content, lastModified: Date.now() }, ...prev]);
    } catch (e) { console.warn('[Ballpoint] dupe:', e); }
    setCtxMenu(null);
  }, [dirHandle, notes]);

  const filteredNotes = notes.filter(n => {
    if (section === 'trash') return trash.has(n.name);
    if (trash.has(n.name)) return false;
    if (section === 'favorites') return favorites.has(n.name);
    if (section === 'archive') return archive.has(n.name);
    if (archive.has(n.name)) return false;
    if (search && !n.name.toLowerCase().includes(search.toLowerCase()) && !n.content.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const isReadOnly = activeNote ? trash.has(activeNote) : false;
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  if (!dirHandle) {
    const lastFolder = localStorage.getItem(LAST_FOLDER_KEY);
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#0f0a1e] gap-5 px-6 text-white">
        <div className="w-14 h-14 rounded-2xl bg-purple-600/20 flex items-center justify-center">
          <FileText size={28} className="text-purple-400" strokeWidth={1.5} />
        </div>
        <div className="text-center space-y-1.5">
          <h2 className="text-base font-semibold">Ballpoint Notes</h2>
          <p className="text-sm text-white/50 leading-relaxed max-w-xs">
            Connect a local folder to store your notes as plain Markdown files on your device.
          </p>
        </div>
        {lastFolder && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.06] text-[12px]">
            <FolderOpen size={12} className="text-purple-400 shrink-0" />
            <span className="text-white/40">Last used:</span>
            <span className="text-white/70 font-medium">{lastFolder}</span>
          </div>
        )}
        <button
          onClick={onPickFolder}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors"
        >
          <FolderOpen size={16} />
          {lastFolder ? `Reconnect "${lastFolder}"` : 'Connect Folder'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 h-full overflow-hidden bg-[#0f0a1e] text-white select-none">
      {ctxMenu && (
        <NoteContextMenu
          note={ctxMenu.note} x={ctxMenu.x} y={ctxMenu.y}
          inTrash={trash.has(ctxMenu.note)} inArchive={archive.has(ctxMenu.note)} isFav={favorites.has(ctxMenu.note)}
          onClose={() => setCtxMenu(null)}
          onRename={() => startRename(ctxMenu.note)}
          onFav={() => toggleFav(ctxMenu.note)}
          onArchive={() => toggleArc(ctxMenu.note)}
          onTrash={() => moveToTrash(ctxMenu.note)}
          onRestore={() => restoreNote(ctxMenu.note)}
          onDeleteForever={() => deleteForever(ctxMenu.note)}
          onDuplicate={() => duplicateNote(ctxMenu.note)}
        />
      )}

      {/* ── Sidebar ── */}
      <div className="w-[200px] shrink-0 flex flex-col border-r border-white/[0.06] bg-[#0c0820]">
        <div className="px-2 pt-2.5 pb-1.5 shrink-0">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.05]">
            <Search size={11} className="text-white/30 shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="flex-1 bg-transparent text-[11px] text-white placeholder:text-white/25 outline-none" />
            {search && <button onClick={() => setSearch('')} className="text-white/20 hover:text-white/50 transition-colors"><X size={9} /></button>}
          </div>
        </div>

        <div className="px-1.5 pb-1 shrink-0">
          {(['all', 'favorites', 'archive', 'trash'] as NoteSection[]).map(s => {
            const counts: Record<NoteSection, number> = {
              all: notes.filter(n => !trash.has(n.name) && !archive.has(n.name)).length,
              favorites: notes.filter(n => favorites.has(n.name) && !trash.has(n.name)).length,
              archive: notes.filter(n => archive.has(n.name) && !trash.has(n.name)).length,
              trash: notes.filter(n => trash.has(n.name)).length,
            };
            const icons: Record<NoteSection, React.ReactNode> = {
              all: <FileText size={11} />,
              favorites: <Star size={11} />,
              archive: <Archive size={11} />,
              trash: <Trash2 size={11} />,
            };
            const labels: Record<NoteSection, string> = { all: 'All Notes', favorites: 'Favorites', archive: 'Archive', trash: 'Trash' };
            return (
              <button key={s} onClick={() => setSection(s)}
                className={cn('w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors text-left',
                  section === s ? 'bg-purple-600/25 text-purple-300' : 'text-white/45 hover:text-white/75 hover:bg-white/[0.04]'
                )}>
                {icons[s]}
                <span>{labels[s]}</span>
                <span className="ml-auto text-[10px] opacity-40">{counts[s] || ''}</span>
              </button>
            );
          })}
        </div>

        <div className="h-px bg-white/[0.05] mx-2 my-1 shrink-0" />

        <div className="flex-1 overflow-y-auto py-1 px-1.5">
          {loading && <p className="text-[11px] text-white/25 text-center py-6">Loading…</p>}
          {!loading && filteredNotes.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 px-3 text-center">
              <FileText size={18} className="text-white/10" strokeWidth={1.5} />
              <p className="text-[11px] text-white/25">
                {section === 'trash' ? 'Trash is empty' : section === 'archive' ? 'Nothing archived' : section === 'favorites' ? 'No pinned notes' : 'No notes yet'}
              </p>
            </div>
          )}
          {filteredNotes.map(note => (
            <div key={note.name}>
              {renaming === note.name ? (
                <div className="flex items-center gap-1 px-1.5 py-1">
                  <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null); }}
                    className="flex-1 bg-white/[0.08] text-[11px] text-white px-2 py-1 rounded outline-none border border-purple-500/50" />
                  <button onClick={commitRename} className="text-emerald-400 p-0.5"><Check size={11} /></button>
                  <button onClick={() => setRenaming(null)} className="text-white/25 p-0.5"><X size={11} /></button>
                </div>
              ) : (
                <button
                  onClick={() => selectNote(note.name)}
                  onContextMenu={e => { e.preventDefault(); setCtxMenu({ note: note.name, x: e.clientX, y: e.clientY }); }}
                  className={cn('w-full text-left px-2 py-2 rounded-lg mb-0.5 transition-colors group',
                    activeNote === note.name ? 'bg-purple-600/20 border border-purple-500/20' : 'hover:bg-white/[0.04]'
                  )}>
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-[11px] font-medium text-white/85 leading-tight truncate">{titleFromName(note.name)}</span>
                    {favorites.has(note.name) && <Star size={8} className="text-yellow-400 fill-yellow-400 shrink-0 mt-0.5" />}
                  </div>
                  <p className="text-[10px] text-white/25 truncate mt-0.5 leading-tight">
                    {note.content.split('\n').find(l => l.trim()) || 'Empty note'}
                  </p>
                  <p className="text-[9px] text-white/15 mt-1">{relativeTime(note.lastModified)}</p>
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="px-2 py-2 shrink-0 border-t border-white/[0.05]">
          <button onClick={createNote}
            className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-[11px] font-medium transition-colors border border-purple-500/20">
            <Plus size={12} />New Note
          </button>
        </div>
      </div>

      {/* ── Editor ── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 select-text">
        {!activeNote ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
            <FileText size={28} className="text-white/10" strokeWidth={1.5} />
            <p className="text-sm text-white/25">Select a note or create a new one</p>
            <button onClick={createNote}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-sm transition-colors border border-purple-500/20">
              <Plus size={14} />New Note
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.06] bg-[#0c0820] shrink-0">
              {renaming === activeNote ? (
                <div className="flex items-center gap-1 flex-1">
                  <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null); }}
                    className="flex-1 bg-white/[0.08] text-sm text-white px-2 py-1 rounded outline-none border border-purple-500/50" />
                  <button onClick={commitRename} className="text-emerald-400 p-1"><Check size={13} /></button>
                  <button onClick={() => setRenaming(null)} className="text-white/25 p-1"><X size={13} /></button>
                </div>
              ) : (
                <button onDoubleClick={() => startRename(activeNote)} title="Double-click to rename"
                  className="flex-1 min-w-0 text-sm font-semibold text-white/75 hover:text-white text-left truncate transition-colors">
                  {titleFromName(activeNote)}
                </button>
              )}
              <span className="text-[10px] text-white/15 shrink-0">{wordCount}w</span>
              {saving && <span className="text-[10px] text-white/25 shrink-0">Saving…</span>}
              <button onClick={() => setShowPreview(v => !v)} title={showPreview ? 'Hide preview' : 'Show preview'}
                className={cn('p-1.5 rounded-md transition-colors shrink-0',
                  showPreview ? 'text-purple-400 bg-purple-600/20' : 'text-white/25 hover:text-white/60 hover:bg-white/[0.06]')}>
                {showPreview ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
              <button onClick={createNote} title="New note" className="p-1.5 rounded-md text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-colors shrink-0">
                <Plus size={13} />
              </button>
            </div>

            <div className="flex flex-1 min-h-0 overflow-hidden">
              <textarea
                value={content}
                onChange={e => handleContentChange(e.target.value)}
                disabled={isReadOnly}
                placeholder={isReadOnly ? '(In trash — restore to edit)' : 'Start writing in Markdown…'}
                spellCheck
                className={cn('flex-1 bg-transparent px-5 py-4 resize-none outline-none font-mono text-[13px] leading-relaxed text-white/80 placeholder:text-white/15 disabled:opacity-30',
                  showPreview && 'border-r border-white/[0.06]')}
              />
              {showPreview && (
                <div
                  className="flex-1 overflow-y-auto px-5 py-4 text-[13px] text-white/75 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: simpleMarkdown(content) }}
                />
              )}
            </div>

            {isReadOnly && (
              <div className="flex items-center gap-2 px-4 py-2 bg-orange-500/10 border-t border-orange-500/20 shrink-0">
                <Trash2 size={12} className="text-orange-400" />
                <span className="text-[11px] text-orange-300">In Trash —</span>
                <button onClick={() => restoreNote(activeNote)} className="text-[11px] text-orange-200 underline underline-offset-2">Restore</button>
                <span className="text-white/20 mx-1">·</span>
                <button onClick={() => deleteForever(activeNote)} className="text-[11px] text-red-400 underline underline-offset-2">Delete Forever</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function NoteContextMenu({
  note, x, y, inTrash, inArchive, isFav,
  onClose, onRename, onFav, onArchive, onTrash, onRestore, onDeleteForever, onDuplicate,
}: {
  note: string; x: number; y: number;
  inTrash: boolean; inArchive: boolean; isFav: boolean;
  onClose: () => void; onRename: () => void; onFav: () => void;
  onArchive: () => void; onTrash: () => void; onRestore: () => void;
  onDeleteForever: () => void; onDuplicate: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: x + r.width > window.innerWidth ? x - r.width : x, y: y + r.height > window.innerHeight ? y - r.height : y });
  }, [x, y]);

  useEffect(() => {
    const hide = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof MouseEvent && ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener('mousedown', hide);
    document.addEventListener('keydown', hide);
    return () => { document.removeEventListener('mousedown', hide); document.removeEventListener('keydown', hide); };
  }, [onClose]);

  type MI = { label: string; icon: React.ReactNode; danger?: boolean; action: () => void } | 'div';
  const items: MI[] = [];
  if (!inTrash) {
    items.push({ label: isFav ? 'Unpin from Favorites' : 'Pin to Favorites', icon: <Star size={11} className={isFav ? 'fill-yellow-400 text-yellow-400' : ''} />, action: onFav });
    items.push({ label: 'Rename', icon: <Edit2 size={11} />, action: onRename });
    items.push({ label: 'Duplicate', icon: <Copy size={11} />, action: onDuplicate });
    items.push('div');
    items.push({ label: inArchive ? 'Unarchive' : 'Archive', icon: <Archive size={11} />, action: onArchive });
    items.push({ label: 'Move to Trash', icon: <Trash2 size={11} />, danger: true, action: onTrash });
  } else {
    items.push({ label: 'Restore Note', icon: <RotateCcw size={11} />, action: onRestore });
    items.push('div');
    items.push({ label: 'Delete Forever', icon: <Trash size={11} />, danger: true, action: onDeleteForever });
  }

  return (
    <div ref={ref} style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 9999 }}
      className="w-44 bg-[#1a1030] border border-white/10 rounded-xl shadow-2xl py-1 text-[11px]">
      {items.map((item, i) =>
        item === 'div' ? <div key={i} className="h-px bg-white/[0.06] my-1" /> : (
          <button key={i} onClick={item.action}
            className={cn('w-full flex items-center gap-2 px-3 py-1.5 hover:bg-white/[0.06] transition-colors text-left',
              item.danger ? 'text-red-400 hover:text-red-300' : 'text-white/65 hover:text-white')}>
            {item.icon}{item.label}
          </button>
        )
      )}
    </div>
  );
}
