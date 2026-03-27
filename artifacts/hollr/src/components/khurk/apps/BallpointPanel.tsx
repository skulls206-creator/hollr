/**
 * BallpointPanel — account-backed rich text editor (Tiptap + DB storage)
 * Layout: collapsible sidebar note list | editor with tab bar + formatting toolbar
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Color from '@tiptap/extension-color';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import {
  Bold, Italic, Underline as UnderlineIcon, Plus, Minus, Link2, ImageIcon,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, List, ListOrdered,
  CheckSquare, Undo2, Redo2, Search, ChevronLeft, ChevronRight, X, Pin,
  Archive, Trash2, RotateCcw, PanelLeft, Cloud,
} from 'lucide-react';
import type { NativePanelProps } from '@/lib/khurk-apps';
import { useAuth } from '@workspace/replit-auth-web';

const API = import.meta.env.BASE_URL;

interface BpNote {
  id: string;
  userId: string;
  title: string;
  content: string;
  isPinned: boolean;
  isArchived: boolean;
  isTrashed: boolean;
  createdAt: string;
  updatedAt: string;
}

type Section = 'all' | 'pinned' | 'archived' | 'trash';

interface OpenTab { noteId: string }

const FONTS = ['Sans-serif', 'Serif', 'Monospace', 'Cursive'];
const FONT_FAMILY_MAP: Record<string, string> = {
  'Sans-serif': 'ui-sans-serif, system-ui, sans-serif',
  'Serif': 'ui-serif, Georgia, serif',
  'Monospace': 'ui-monospace, monospace',
  'Cursive': 'cursive',
};

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getPlainText(html: string) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent ?? '';
}

export function BallpointPanel({ storagePrefix }: NativePanelProps) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<BpNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<Section>('all');
  const [search, setSearch] = useState('');
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fontSize, setFontSize] = useState(14);
  const [fontFamily, setFontFamily] = useState('Sans-serif');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notesRef = useRef<BpNote[]>([]);

  useEffect(() => { notesRef.current = notes; }, [notes]);

  const lsKey = `${storagePrefix}:sidebar`;
  useEffect(() => {
    const stored = localStorage.getItem(lsKey);
    if (stored !== null) setSidebarOpen(stored === '1');
  }, [lsKey]);

  const activeNote = notes.find(n => n.id === activeTab) ?? null;

  /* ── API ── */
  const fetchNotes = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [res, trashRes] = await Promise.all([
        fetch(`${API}api/ballpoint/notes`, { credentials: 'include' }),
        fetch(`${API}api/ballpoint/notes/trash`, { credentials: 'include' }),
      ]);
      if (!res.ok || !trashRes.ok) throw new Error('fetch failed');
      const active: BpNote[] = await res.json();
      const trashed: BpNote[] = await trashRes.json();
      setNotes([...active, ...trashed]);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const createNote = useCallback(async () => {
    const res = await fetch(`${API}api/ballpoint/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title: 'Untitled', content: '' }),
    });
    if (!res.ok) return;
    const note: BpNote = await res.json();
    setNotes(prev => [note, ...prev]);
    setTabs(prev => [...prev, { noteId: note.id }]);
    setActiveTab(note.id);
    setSection('all');
  }, []);

  const patchNote = useCallback(async (id: string, patch: Partial<BpNote>) => {
    const res = await fetch(`${API}api/ballpoint/notes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(patch),
    });
    if (!res.ok) return;
    const updated: BpNote = await res.json();
    setNotes(prev => prev.map(n => n.id === id ? updated : n));
    notesRef.current = notesRef.current.map(n => n.id === id ? updated : n);
  }, []);

  const deleteNote = useCallback(async (id: string) => {
    await fetch(`${API}api/ballpoint/notes/${id}`, { method: 'DELETE', credentials: 'include' });
    setNotes(prev => prev.filter(n => n.id !== id));
    setTabs(prev => prev.filter(t => t.noteId !== id));
    if (activeTab === id) setActiveTab(null);
  }, [activeTab]);

  /* ── Auto-save ── */
  const scheduleSave = useCallback((id: string, title: string, content: string) => {
    clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(async () => {
      await patchNote(id, { title, content });
      setSaving(false);
    }, 900);
  }, [patchNote]);

  /* ── Tiptap editor ── */
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      FontFamily.configure({ types: ['textStyle'] }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
      Color,
      Image,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: '',
    onUpdate({ editor }) {
      const note = notesRef.current.find(n => n.id === activeTab);
      if (!note) return;
      const html = editor.getHTML();
      const firstLine = editor.getText().split('\n')[0]?.slice(0, 80) || 'Untitled';
      setNotes(prev => prev.map(n =>
        n.id === note.id ? { ...n, content: html, title: firstLine } : n
      ));
      notesRef.current = notesRef.current.map(n =>
        n.id === note.id ? { ...n, content: html, title: firstLine } : n
      );
      scheduleSave(note.id, firstLine, html);
    },
  });

  /* Sync editor when active note changes */
  const lastLoadedId = useRef<string | null>(null);
  useEffect(() => {
    if (!editor) return;
    if (activeNote && lastLoadedId.current !== activeNote.id) {
      lastLoadedId.current = activeNote.id;
      editor.commands.setContent(activeNote.content || '');
    } else if (!activeNote) {
      lastLoadedId.current = null;
      editor.commands.setContent('');
    }
  }, [editor, activeNote]);

  /* Sync font family to editor */
  const prevFamily = useRef('');
  useEffect(() => {
    if (!editor || prevFamily.current === fontFamily) return;
    prevFamily.current = fontFamily;
    editor.chain().setFontFamily(FONT_FAMILY_MAP[fontFamily]).run();
  }, [fontFamily, editor]);

  /* ── Toolbar helpers ── */
  const setFontSizeNum = (size: number) => {
    const clamped = Math.min(Math.max(size, 8), 96);
    setFontSize(clamped);
    editor?.chain().focus().setMark('textStyle', { fontSize: `${clamped}px` }).run();
  };

  const setLink = () => {
    const prev = editor?.getAttributes('link').href ?? '';
    const url = window.prompt('Link URL', prev);
    if (url === null) return;
    if (url === '') { editor?.chain().focus().unsetLink().run(); return; }
    editor?.chain().focus().setLink({ href: url }).run();
  };

  const addImage = () => {
    const url = window.prompt('Image URL');
    if (url) editor?.chain().focus().setImage({ src: url }).run();
  };

  /* ── Heading type selector ── */
  const headingType = (() => {
    if (!editor) return 'Paragraph';
    for (let i = 1; i <= 6; i++) {
      if (editor.isActive('heading', { level: i })) return `Heading ${i}`;
    }
    return 'Paragraph';
  })();

  const setHeading = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'Paragraph') { editor?.chain().focus().setParagraph().run(); return; }
    const lvl = parseInt(val.split(' ')[1]) as 1 | 2 | 3 | 4 | 5 | 6;
    editor?.chain().focus().toggleHeading({ level: lvl }).run();
  };

  /* ── Filtered note list ── */
  const visibleNotes = notes.filter(n => {
    if (section === 'trash') return n.isTrashed;
    if (n.isTrashed) return false;
    if (section === 'pinned') return n.isPinned && !n.isArchived;
    if (section === 'archived') return n.isArchived;
    if (n.isArchived) return false;
    if (search) {
      const q = search.toLowerCase();
      return n.title.toLowerCase().includes(q) || getPlainText(n.content).toLowerCase().includes(q);
    }
    return true;
  });

  const openNote = (note: BpNote) => {
    if (!tabs.find(t => t.noteId === note.id)) {
      setTabs(prev => [...prev, { noteId: note.id }]);
    }
    setActiveTab(note.id);
  };

  const closeTab = (noteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTabs(prev => {
      const next = prev.filter(t => t.noteId !== noteId);
      if (activeTab === noteId) {
        const idx = prev.findIndex(t => t.noteId === noteId);
        const fallback = next[idx] ?? next[idx - 1] ?? null;
        setActiveTab(fallback?.noteId ?? null);
      }
      return next;
    });
  };

  const tabBarRef = useRef<HTMLDivElement>(null);
  const scrollTabs = (dir: 'left' | 'right') => {
    tabBarRef.current?.scrollBy({ left: dir === 'left' ? -120 : 120, behavior: 'smooth' });
  };

  if (!user) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        Sign in to use Ballpoint
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background text-foreground overflow-hidden select-none font-sans">

      {/* ── Top bar ── */}
      <div className="flex items-center gap-1 border-b border-border px-2 h-10 shrink-0 bg-background/90 backdrop-blur">
        <button
          onClick={createNote}
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="New note"
        ><Plus size={15} /></button>
        <button onClick={() => scrollTabs('left')} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
          <ChevronLeft size={14} />
        </button>

        {/* Tabs */}
        <div ref={tabBarRef} className="flex-1 flex items-center gap-0.5 overflow-x-auto scrollbar-none">
          {tabs.map(t => {
            const note = notes.find(n => n.id === t.noteId);
            const isActive = t.noteId === activeTab;
            return (
              <button
                key={t.noteId}
                onClick={() => setActiveTab(t.noteId)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs whitespace-nowrap max-w-[160px] transition-colors shrink-0 ${
                  isActive ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:bg-accent/50'
                }`}
              >
                <span className="truncate">{note?.title || 'Untitled'}</span>
                <X size={11} className="shrink-0 opacity-60 hover:opacity-100" onClick={e => closeTab(t.noteId, e)} />
              </button>
            );
          })}
        </div>

        <button onClick={() => scrollTabs('right')} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
          <ChevronRight size={14} />
        </button>

        <div className="flex items-center gap-0.5 ml-1 shrink-0">
          {saving && <Cloud size={13} className="text-muted-foreground animate-pulse" />}
          <button onClick={() => editor?.chain().focus().undo().run()} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground" title="Undo"><Undo2 size={14} /></button>
          <button onClick={() => editor?.chain().focus().redo().run()} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground" title="Redo"><Redo2 size={14} /></button>
          <button
            onClick={() => setSidebarOpen(v => { localStorage.setItem(lsKey, !v ? '1' : '0'); return !v; })}
            className={`p-1 rounded hover:bg-accent transition-colors ${sidebarOpen ? 'text-foreground' : 'text-muted-foreground'}`}
            title="Toggle sidebar"
          ><PanelLeft size={14} /></button>
          <button
            onClick={() => setShowSearch(v => !v)}
            className={`p-1 rounded hover:bg-accent transition-colors ${showSearch ? 'text-foreground' : 'text-muted-foreground'}`}
            title="Search"
          ><Search size={14} /></button>
        </div>
      </div>

      {/* ── Formatting toolbar ── */}
      {activeNote && (
        <div className="flex items-center gap-0.5 border-b border-border px-2 h-9 shrink-0 bg-background/70 overflow-x-auto scrollbar-none">
          <ToolBtn active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()} title="Bold">
            <Bold size={13} />
          </ToolBtn>
          <ToolBtn active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()} title="Italic">
            <Italic size={13} />
          </ToolBtn>
          <ToolBtn active={editor?.isActive('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()} title="Underline">
            <UnderlineIcon size={13} />
          </ToolBtn>

          <div className="w-px h-5 bg-border mx-1 shrink-0" />

          <button onMouseDown={e => { e.preventDefault(); setFontSizeNum(fontSize - 1); }} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"><Minus size={11} /></button>
          <span className="text-xs w-8 text-center text-muted-foreground">{fontSize}px</span>
          <button onMouseDown={e => { e.preventDefault(); setFontSizeNum(fontSize + 1); }} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"><Plus size={11} /></button>

          <div className="w-px h-5 bg-border mx-1 shrink-0" />

          <select
            value={headingType}
            onChange={setHeading}
            className="text-xs h-6 rounded border border-border bg-background text-foreground px-1 cursor-pointer focus:outline-none"
          >
            <option>Paragraph</option>
            {[1,2,3,4,5,6].map(i => <option key={i} value={`Heading ${i}`}>Heading {i}</option>)}
          </select>

          <div className="w-px h-5 bg-border mx-1 shrink-0" />

          <select
            value={fontFamily}
            onChange={e => setFontFamily(e.target.value)}
            className="text-xs h-6 rounded border border-border bg-background text-foreground px-1 cursor-pointer focus:outline-none"
          >
            {FONTS.map(f => <option key={f}>{f}</option>)}
          </select>

          <div className="w-px h-5 bg-border mx-1 shrink-0" />

          <ToolBtn active={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()} title="Numbered list">
            <ListOrdered size={13} />
          </ToolBtn>
          <ToolBtn active={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()} title="Bullet list">
            <List size={13} />
          </ToolBtn>
          <ToolBtn active={editor?.isActive('taskList')} onClick={() => editor?.chain().focus().toggleTaskList().run()} title="Task list">
            <CheckSquare size={13} />
          </ToolBtn>

          <div className="w-px h-5 bg-border mx-1 shrink-0" />

          <ToolBtn active={editor?.isActive('link')} onClick={setLink} title="Link">
            <Link2 size={13} />
          </ToolBtn>
          <ToolBtn onClick={addImage} title="Image">
            <ImageIcon size={13} />
          </ToolBtn>

          <div className="w-px h-5 bg-border mx-1 shrink-0" />

          <ToolBtn active={editor?.isActive({ textAlign: 'left' })} onClick={() => editor?.chain().focus().setTextAlign('left').run()} title="Left"><AlignLeft size={13} /></ToolBtn>
          <ToolBtn active={editor?.isActive({ textAlign: 'center' })} onClick={() => editor?.chain().focus().setTextAlign('center').run()} title="Center"><AlignCenter size={13} /></ToolBtn>
          <ToolBtn active={editor?.isActive({ textAlign: 'right' })} onClick={() => editor?.chain().focus().setTextAlign('right').run()} title="Right"><AlignRight size={13} /></ToolBtn>
          <ToolBtn active={editor?.isActive({ textAlign: 'justify' })} onClick={() => editor?.chain().focus().setTextAlign('justify').run()} title="Justify"><AlignJustify size={13} /></ToolBtn>
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-56 shrink-0 border-r border-border flex flex-col overflow-hidden bg-background">
            {/* Section nav */}
            <div className="flex flex-col gap-0.5 p-2 border-b border-border shrink-0">
              {(['all', 'pinned', 'archived', 'trash'] as Section[]).map(s => (
                <button
                  key={s}
                  onClick={() => setSection(s)}
                  className={`flex items-center gap-2 px-2 py-1 rounded text-xs capitalize transition-colors ${section === s ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:bg-accent/50'}`}
                >
                  {s === 'pinned' && <Pin size={11} />}
                  {s === 'archived' && <Archive size={11} />}
                  {s === 'trash' && <Trash2 size={11} />}
                  {s === 'all' && <span className="w-[11px]" />}
                  {s === 'all' ? 'All Notes' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>

            {/* Search */}
            {showSearch && (
              <div className="px-2 py-1.5 border-b border-border shrink-0">
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search notes…"
                  className="w-full text-xs px-2 py-1 rounded bg-accent/50 border border-border focus:outline-none placeholder:text-muted-foreground"
                />
              </div>
            )}

            {/* Note list */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-xs text-muted-foreground">Loading…</div>
              ) : visibleNotes.length === 0 ? (
                <div className="p-4 text-xs text-muted-foreground">No notes</div>
              ) : (
                visibleNotes.map(note => (
                  <NoteListItem
                    key={note.id}
                    note={note}
                    isActive={activeTab === note.id}
                    onClick={() => openNote(note)}
                    onPin={() => patchNote(note.id, { isPinned: !note.isPinned })}
                    onArchive={() => patchNote(note.id, { isArchived: !note.isArchived })}
                    onTrash={() => patchNote(note.id, { isTrashed: !note.isTrashed })}
                    onRestore={() => patchNote(note.id, { isTrashed: false })}
                    onDelete={() => deleteNote(note.id)}
                    inTrash={section === 'trash'}
                  />
                ))
              )}
            </div>
          </div>
        )}

        {/* Editor pane */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {activeNote ? (
            <>
              <div className="flex-1 overflow-y-auto">
                <EditorContent
                  editor={editor}
                  className="ballpoint-editor h-full max-w-3xl mx-auto px-8 py-8"
                />
              </div>
              <div className="h-6 border-t border-border flex items-center px-4 gap-4 text-[10px] text-muted-foreground shrink-0">
                <span>{editor?.getText().length ?? 0} chars</span>
                <span>Saved {formatDate(activeNote.updatedAt)}</span>
                {saving && <span className="text-primary animate-pulse">Saving…</span>}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <p className="text-sm">Select a note or create a new one</p>
              <button
                onClick={createNote}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 transition-opacity"
              >
                <Plus size={14} /> New Note
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function ToolBtn({
  children,
  active,
  onClick,
  title,
}: {
  children: React.ReactNode;
  active?: boolean | null;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      onMouseDown={e => { e.preventDefault(); onClick?.(); }}
      title={title}
      className={`p-1.5 rounded transition-colors ${active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}`}
    >
      {children}
    </button>
  );
}

function NoteListItem({
  note, isActive, onClick, onPin, onArchive, onTrash, onRestore, onDelete, inTrash,
}: {
  note: BpNote;
  isActive: boolean;
  onClick: () => void;
  onPin: () => void;
  onArchive: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onDelete: () => void;
  inTrash: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  return (
    <div
      onClick={onClick}
      onContextMenu={e => { e.preventDefault(); setMenuOpen(true); }}
      className={`relative group px-3 py-2.5 cursor-pointer border-b border-border/50 transition-colors ${isActive ? 'bg-accent' : 'hover:bg-accent/40'}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs font-medium truncate">{note.title || 'Untitled'}</span>
        {note.isPinned && <Pin size={10} className="shrink-0 text-muted-foreground" />}
      </div>
      <p className="text-[10px] text-muted-foreground truncate mt-0.5">
        {getPlainText(note.content).slice(0, 60) || '—'}
      </p>
      <span className="text-[9px] text-muted-foreground/70 mt-0.5 block">{formatDate(note.updatedAt)}</span>

      {menuOpen && (
        <div ref={menuRef} className="absolute right-2 top-8 z-50 w-40 rounded-md border border-border bg-popover shadow-lg text-xs overflow-hidden">
          {inTrash ? (
            <>
              <CtxItem onClick={() => { onRestore(); setMenuOpen(false); }} icon={<RotateCcw size={12} />}>Restore</CtxItem>
              <CtxItem onClick={() => { onDelete(); setMenuOpen(false); }} icon={<Trash2 size={12} />} danger>Delete Forever</CtxItem>
            </>
          ) : (
            <>
              <CtxItem onClick={() => { onPin(); setMenuOpen(false); }} icon={<Pin size={12} />}>{note.isPinned ? 'Unpin' : 'Pin'}</CtxItem>
              <CtxItem onClick={() => { onArchive(); setMenuOpen(false); }} icon={<Archive size={12} />}>{note.isArchived ? 'Unarchive' : 'Archive'}</CtxItem>
              <CtxItem onClick={() => { onTrash(); setMenuOpen(false); }} icon={<Trash2 size={12} />} danger>Move to Trash</CtxItem>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CtxItem({ children, onClick, icon, danger }: { children: React.ReactNode; onClick: () => void; icon?: React.ReactNode; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-left transition-colors ${danger ? 'text-destructive' : ''}`}
    >
      {icon}{children}
    </button>
  );
}
