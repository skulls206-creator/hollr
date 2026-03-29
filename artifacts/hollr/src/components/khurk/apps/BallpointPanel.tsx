/**
 * BallpointPanel — account-backed rich text editor (Tiptap + DB storage)
 * Mobile-first: full-screen list → full-screen editor navigation
 */
import { useState, useEffect, useCallback, useRef, forwardRef } from 'react';
import type { Editor } from '@tiptap/react';
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
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Plus, Link2,
  AlignLeft, AlignCenter, AlignRight, List, ListOrdered,
  CheckSquare, Undo2, Redo2, Search, ChevronLeft, X, Pin,
  Archive, Trash2, RotateCcw, Cloud, ChevronDown, MoreVertical,
  FileText, Star, Clock, Copy, Download, Type, Hash as HashIcon,
  Check, Scissors, Heading1, Heading2, Heading3, Pilcrow, Quote,
  RemoveFormatting,
} from 'lucide-react';
import type { NativePanelProps } from '@/lib/khurk-apps';
import { useAuth } from '@workspace/replit-auth-web';

const API = import.meta.env.BASE_URL;

const ACCENT = '#7c3aed';
const ACCENT2 = '#a855f7';
const BG = 'var(--background)';
const SURFACE = 'var(--surface-1, #18181b)';
const BORDER = 'var(--border)';
const FG = 'var(--foreground)';
const MUTED = 'var(--muted-foreground)';

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
type View = 'list' | 'editor';

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
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff < 7 * 86400000) {
    return d.toLocaleDateString([], { weekday: 'short' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getPlainText(html: string) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent ?? '';
}

const NOTE_COLORS = [
  'linear-gradient(135deg,#7c3aed,#a855f7)',
  'linear-gradient(135deg,#2563eb,#7c3aed)',
  'linear-gradient(135deg,#0891b2,#2563eb)',
  'linear-gradient(135deg,#059669,#0891b2)',
  'linear-gradient(135deg,#d97706,#dc2626)',
  'linear-gradient(135deg,#dc2626,#7c3aed)',
];

function noteColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return NOTE_COLORS[Math.abs(h) % NOTE_COLORS.length];
}

/* ─── Export helpers ─────────────────────────────────────────────────────── */
function htmlToMarkdown(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  function nodeToMd(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as Element;
    const kids = () => Array.from(el.childNodes).map(nodeToMd).join('');
    switch (el.tagName.toLowerCase()) {
      case 'h1': return `# ${kids()}\n\n`;
      case 'h2': return `## ${kids()}\n\n`;
      case 'h3': return `### ${kids()}\n\n`;
      case 'h4': return `#### ${kids()}\n\n`;
      case 'p': return `${kids()}\n\n`;
      case 'strong': case 'b': return `**${kids()}**`;
      case 'em': case 'i': return `*${kids()}*`;
      case 'u': return `<u>${kids()}</u>`;
      case 'code': return `\`${kids()}\``;
      case 'pre': return `\`\`\`\n${kids()}\n\`\`\`\n\n`;
      case 'blockquote': return `> ${kids()}\n\n`;
      case 'ul': return `${kids()}`;
      case 'ol': return Array.from(el.children).map((li, i) => `${i + 1}. ${nodeToMd(li)}`).join('');
      case 'li': return `- ${kids()}\n`;
      case 'a': return `[${kids()}](${el.getAttribute('href') ?? ''})`;
      case 'br': return '\n';
      case 'hr': return '---\n\n';
      default: return kids();
    }
  }
  return nodeToMd(div).trim();
}

function downloadTextFile(content: string, filename: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function countWords(html: string) {
  const text = (document.createElement('div')).innerHTML = html, div = document.createElement('div');
  div.innerHTML = String(text);
  const plain = div.textContent ?? '';
  const words = plain.trim().split(/\s+/).filter(Boolean).length;
  const chars = plain.length;
  return { words, chars };
}

export function BallpointPanel({ storagePrefix }: NativePanelProps) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<BpNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<Section>('all');
  const [search, setSearch] = useState('');
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [view, setView] = useState<View>('list');
  const [showSearch, setShowSearch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fontFamily, setFontFamily] = useState('Sans-serif');
  const [titleInput, setTitleInput] = useState('');
  const [showNoteMenu, setShowNoteMenu] = useState(false);
  const [showFontMenu, setShowFontMenu] = useState(false);
  const [showHeadingMenu, setShowHeadingMenu] = useState(false);
  const [noteCtxMenu, setNoteCtxMenu] = useState<{ x: number; y: number; note: BpNote } | null>(null);
  const [editorCtxMenu, setEditorCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [ctxCopied, setCtxCopied] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notesRef = useRef<BpNote[]>([]);
  const noteMenuRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef('');
  const activeTabRef = useRef<string | null>(null);
  const editorCtxMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { notesRef.current = notes; }, [notes]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { titleInputRef.current = titleInput; }, [titleInput]);

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
    setView('editor');
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
    if (activeTab === id) { setActiveTab(null); setView('list'); }
  }, [activeTab]);

  const duplicateNote = useCallback(async (note: BpNote) => {
    const res = await fetch(`${API}api/ballpoint/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title: `Copy of ${note.title}`, content: note.content }),
    });
    if (!res.ok) return;
    const newNote: BpNote = await res.json();
    setNotes(prev => [newNote, ...prev]);
  }, []);

  /* ── Context menu close ── */
  useEffect(() => {
    if (!noteCtxMenu) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-bp-ctx]')) setNoteCtxMenu(null);
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setNoteCtxMenu(null); };
    document.addEventListener('mousedown', close, true);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', close, true); document.removeEventListener('keydown', key); };
  }, [noteCtxMenu]);

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
      const note = notesRef.current.find(n => n.id === activeTabRef.current);
      if (!note) return;
      const html = editor.getHTML();
      setNotes(prev => prev.map(n =>
        n.id === note.id ? { ...n, content: html } : n
      ));
      notesRef.current = notesRef.current.map(n =>
        n.id === note.id ? { ...n, content: html } : n
      );
      scheduleSave(note.id, titleInputRef.current, html);
    },
  });

  const lastLoadedId = useRef<string | null>(null);
  useEffect(() => {
    if (!editor) return;
    if (activeNote && lastLoadedId.current !== activeNote.id) {
      lastLoadedId.current = activeNote.id;
      editor.commands.setContent(activeNote.content || '');
      setTitleInput(activeNote.title || '');
    } else if (!activeNote) {
      lastLoadedId.current = null;
      editor.commands.setContent('');
      setTitleInput('');
    }
  }, [editor, activeNote]);

  const prevFamily = useRef('');
  useEffect(() => {
    if (!editor || prevFamily.current === fontFamily) return;
    prevFamily.current = fontFamily;
    editor.chain().setFontFamily(FONT_FAMILY_MAP[fontFamily]).run();
  }, [fontFamily, editor]);

  const setLink = () => {
    const prev = editor?.getAttributes('link').href ?? '';
    const url = window.prompt('Link URL', prev);
    if (url === null) return;
    if (url === '') { editor?.chain().focus().unsetLink().run(); return; }
    editor?.chain().focus().setLink({ href: url }).run();
  };

  const handleTitleChange = useCallback((val: string) => {
    setTitleInput(val);
    const id = activeTabRef.current;
    if (!id) return;
    setNotes(prev => prev.map(n => n.id === id ? { ...n, title: val } : n));
    notesRef.current = notesRef.current.map(n => n.id === id ? { ...n, title: val } : n);
    const content = notesRef.current.find(n => n.id === id)?.content ?? '';
    scheduleSave(id, val, content);
  }, [scheduleSave]);

  /* ── Close note menu on outside click ── */
  useEffect(() => {
    if (!showNoteMenu) return;
    const handler = (e: MouseEvent) => {
      if (!noteMenuRef.current?.contains(e.target as Node)) setShowNoteMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showNoteMenu]);

  /* ── Close editor context menu on outside click ── */
  useEffect(() => {
    if (!editorCtxMenu) return;
    const close = (e: MouseEvent) => {
      if (!editorCtxMenuRef.current?.contains(e.target as Node)) setEditorCtxMenu(null);
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setEditorCtxMenu(null); };
    document.addEventListener('mousedown', close, true);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', close, true);
      document.removeEventListener('keydown', key);
    };
  }, [editorCtxMenu]);

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
    setView('editor');
  };

  const goBack = () => {
    setView('list');
    setShowNoteMenu(false);
  };

  if (!user) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: BG, color: MUTED }}>
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})` }}>
            <FileText size={26} color="white" />
          </div>
          <p className="text-sm font-semibold" style={{ color: FG }}>Sign in to use Ballpoint</p>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════
     EDITOR VIEW
  ══════════════════════════════════════════════ */
  if (view === 'editor') {
    return (
      <div className="h-full flex flex-col overflow-hidden select-none" style={{ background: BG, color: FG }}>

        {/* Editor header */}
        <div
          className="flex items-center gap-2 px-3 shrink-0"
          style={{ height: 52, background: SURFACE, borderBottom: `1px solid ${BORDER}` }}
        >
          <button
            onClick={goBack}
            className="p-2 rounded-xl transition-colors hover:bg-white/10 active:scale-95"
            style={{ color: ACCENT2 }}
          >
            <ChevronLeft size={20} />
          </button>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: FG }}>
              {activeNote?.title || 'Untitled'}
            </p>
            <p className="text-[10px]" style={{ color: MUTED }}>
              {activeNote ? `Edited ${formatDate(activeNote.updatedAt)}` : ''}
              {saving && <span style={{ color: ACCENT2 }}> · Saving…</span>}
            </p>
          </div>

          {/* Note actions */}
          <div className="flex items-center gap-0.5 relative" ref={noteMenuRef}>
            {saving && <Cloud size={13} style={{ color: ACCENT2 }} className="animate-pulse mr-1" />}
            <button
              onClick={() => editor?.chain().focus().undo().run()}
              className="p-2 rounded-xl hover:bg-white/10 transition-colors"
              style={{ color: MUTED }}
            ><Undo2 size={15} /></button>
            <button
              onClick={() => editor?.chain().focus().redo().run()}
              className="p-2 rounded-xl hover:bg-white/10 transition-colors"
              style={{ color: MUTED }}
            ><Redo2 size={15} /></button>
            <button
              onClick={() => setShowNoteMenu(v => !v)}
              className="p-2 rounded-xl hover:bg-white/10 transition-colors"
              style={{ color: MUTED }}
            ><MoreVertical size={15} /></button>

            {showNoteMenu && activeNote && (
              <div
                className="absolute right-0 top-10 z-50 rounded-2xl overflow-hidden shadow-2xl border"
                style={{ background: SURFACE, borderColor: BORDER, minWidth: 180 }}
              >
                <button
                  onClick={() => { patchNote(activeNote.id, { isPinned: !activeNote.isPinned }); setShowNoteMenu(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/5 transition-colors"
                  style={{ color: FG }}
                >
                  <Pin size={14} style={{ color: activeNote.isPinned ? ACCENT2 : MUTED }} />
                  {activeNote.isPinned ? 'Unpin note' : 'Pin note'}
                </button>
                <button
                  onClick={() => { patchNote(activeNote.id, { isArchived: !activeNote.isArchived }); setShowNoteMenu(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/5 transition-colors"
                  style={{ color: FG }}
                >
                  <Archive size={14} style={{ color: MUTED }} />
                  {activeNote.isArchived ? 'Unarchive' : 'Archive'}
                </button>
                <div style={{ height: 1, background: BORDER }} />
                {activeNote.isTrashed ? (
                  <>
                    <button
                      onClick={() => { patchNote(activeNote.id, { isTrashed: false }); setShowNoteMenu(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/5 transition-colors"
                      style={{ color: FG }}
                    >
                      <RotateCcw size={14} style={{ color: MUTED }} /> Restore
                    </button>
                    <button
                      onClick={() => { deleteNote(activeNote.id); setShowNoteMenu(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-red-500/10 transition-colors"
                      style={{ color: '#ef4444' }}
                    >
                      <Trash2 size={14} /> Delete forever
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => { patchNote(activeNote.id, { isTrashed: true }); goBack(); setShowNoteMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-red-500/10 transition-colors"
                    style={{ color: '#ef4444' }}
                  >
                    <Trash2 size={14} /> Move to Trash
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Editor content */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ background: BG }}
          onContextMenu={e => { e.preventDefault(); setEditorCtxMenu({ x: e.clientX, y: e.clientY }); }}
        >
          {/* Title field — separate from body */}
          <div className="px-5 pt-5 pb-3">
            <input
              type="text"
              value={titleInput}
              onChange={e => handleTitleChange(e.target.value)}
              placeholder="Title"
              className="w-full bg-transparent outline-none text-[22px] font-bold leading-tight tracking-tight"
              style={{ color: FG }}
            />
          </div>
          <div className="mx-5 h-px opacity-25" style={{ background: ACCENT2 }} />
          <EditorContent
            editor={editor}
            className="ballpoint-editor min-h-full px-5 py-4"
          />
        </div>

        {/* Formatting toolbar — bottom (compact) */}
        <div
          className="shrink-0 flex items-center gap-px px-1.5 overflow-x-auto scrollbar-none"
          style={{ height: 42, background: SURFACE, borderTop: `1px solid ${BORDER}` }}
        >
          {/* Inline format */}
          <FmtBtn active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()} title="Bold (Ctrl+B)">
            <Bold size={13} />
          </FmtBtn>
          <FmtBtn active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()} title="Italic (Ctrl+I)">
            <Italic size={13} />
          </FmtBtn>
          <FmtBtn active={editor?.isActive('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()} title="Underline (Ctrl+U)">
            <UnderlineIcon size={13} />
          </FmtBtn>
          <FmtBtn active={editor?.isActive('strike')} onClick={() => editor?.chain().focus().toggleStrike().run()} title="Strikethrough">
            <Strikethrough size={13} />
          </FmtBtn>

          <TbSep />

          {/* Heading picker */}
          <div className="relative shrink-0">
            <button
              onMouseDown={e => { e.preventDefault(); setShowHeadingMenu(v => !v); }}
              title="Heading style"
              className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg text-[11px] font-bold transition-colors hover:bg-white/10"
              style={{
                color: (editor?.isActive('heading') || editor?.isActive('blockquote')) ? ACCENT2 : MUTED,
                background: (editor?.isActive('heading') || editor?.isActive('blockquote')) ? `${ACCENT}22` : 'transparent',
              }}
            >
              {editor?.isActive('heading', { level: 1 }) ? 'H1'
                : editor?.isActive('heading', { level: 2 }) ? 'H2'
                : editor?.isActive('heading', { level: 3 }) ? 'H3'
                : editor?.isActive('blockquote') ? '❝'
                : 'Aa'}
              <ChevronDown size={9} />
            </button>
            {showHeadingMenu && (
              <div
                className="absolute bottom-10 left-0 rounded-xl overflow-hidden shadow-2xl border z-50"
                style={{ background: SURFACE, borderColor: BORDER, minWidth: 150 }}
              >
                {([
                  { label: 'Normal', icon: <Pilcrow size={12} />, action: () => editor?.chain().focus().setParagraph().run(), active: !editor?.isActive('heading') && !editor?.isActive('blockquote') },
                  { label: 'Heading 1', icon: <Heading1 size={12} />, action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), active: editor?.isActive('heading', { level: 1 }) },
                  { label: 'Heading 2', icon: <Heading2 size={12} />, action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), active: editor?.isActive('heading', { level: 2 }) },
                  { label: 'Heading 3', icon: <Heading3 size={12} />, action: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), active: editor?.isActive('heading', { level: 3 }) },
                  { label: 'Block Quote', icon: <Quote size={12} />, action: () => editor?.chain().focus().toggleBlockquote().run(), active: editor?.isActive('blockquote') },
                ] as const).map(({ label, icon, action, active }) => (
                  <button
                    key={label}
                    onMouseDown={e => { e.preventDefault(); action(); setShowHeadingMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-xs hover:bg-white/5 transition-colors"
                    style={{ color: active ? ACCENT2 : FG }}
                  >
                    <span style={{ color: active ? ACCENT2 : MUTED }}>{icon}</span>
                    {label}
                    {active && <Check size={10} className="ml-auto" style={{ color: ACCENT2 }} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <TbSep />

          {/* Lists */}
          <FmtBtn active={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()} title="Bullet list">
            <List size={13} />
          </FmtBtn>
          <FmtBtn active={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()} title="Numbered list">
            <ListOrdered size={13} />
          </FmtBtn>
          <FmtBtn active={editor?.isActive('taskList')} onClick={() => editor?.chain().focus().toggleTaskList().run()} title="Checklist">
            <CheckSquare size={13} />
          </FmtBtn>

          <TbSep />

          {/* Alignment */}
          <FmtBtn active={editor?.isActive({ textAlign: 'left' })} onClick={() => editor?.chain().focus().setTextAlign('left').run()} title="Align left">
            <AlignLeft size={13} />
          </FmtBtn>
          <FmtBtn active={editor?.isActive({ textAlign: 'center' })} onClick={() => editor?.chain().focus().setTextAlign('center').run()} title="Center">
            <AlignCenter size={13} />
          </FmtBtn>
          <FmtBtn active={editor?.isActive({ textAlign: 'right' })} onClick={() => editor?.chain().focus().setTextAlign('right').run()} title="Align right">
            <AlignRight size={13} />
          </FmtBtn>

          <TbSep />

          {/* Link + Font */}
          <FmtBtn active={editor?.isActive('link')} onClick={setLink} title="Insert link">
            <Link2 size={13} />
          </FmtBtn>

          <TbSep />

          {/* Font family picker */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowFontMenu(v => !v)}
              className="flex items-center gap-0.5 px-1.5 h-7 rounded-lg text-[11px] transition-colors hover:bg-white/10"
              style={{ color: MUTED }}
            >
              {fontFamily.slice(0, 4)} <ChevronDown size={9} />
            </button>
            {showFontMenu && (
              <div
                className="absolute bottom-9 left-0 rounded-xl overflow-hidden shadow-2xl border z-50"
                style={{ background: SURFACE, borderColor: BORDER, minWidth: 130 }}
              >
                {FONTS.map(f => (
                  <button
                    key={f}
                    onClick={() => { setFontFamily(f); setShowFontMenu(false); }}
                    className="w-full px-3.5 py-2 text-left text-xs hover:bg-white/5 transition-colors"
                    style={{ color: fontFamily === f ? ACCENT2 : FG }}
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Editor right-click context menu */}
        {editorCtxMenu && (
          <EditorCtxMenu
            ref={editorCtxMenuRef}
            x={editorCtxMenu.x}
            y={editorCtxMenu.y}
            editor={editor}
            onClose={() => setEditorCtxMenu(null)}
          />
        )}
      </div>
    );
  }

  /* ══════════════════════════════════════════════
     LIST VIEW
  ══════════════════════════════════════════════ */
  return (
    <div className="h-full flex flex-col overflow-hidden select-none" style={{ background: BG, color: FG }}>

      {/* Top header */}
      <div
        className="flex items-center gap-2 px-4 shrink-0"
        style={{ height: 52, background: SURFACE, borderBottom: `1px solid ${BORDER}` }}
      >
        <h1 className="text-base font-bold flex-1 tracking-tight" style={{ color: FG }}>
          {section === 'all' ? 'All Notes' : section === 'pinned' ? 'Pinned' : section === 'archived' ? 'Archived' : 'Trash'}
        </h1>
        <button
          onClick={() => setShowSearch(v => !v)}
          className="p-2 rounded-xl hover:bg-white/10 transition-colors"
          style={{ color: showSearch ? ACCENT2 : MUTED }}
        ><Search size={17} /></button>
        <button
          onClick={createNote}
          className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg transition-all hover:brightness-110 active:scale-95"
          style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})` }}
        ><Plus size={18} color="white" /></button>
      </div>

      {/* Search bar (expanded) */}
      {showSearch && (
        <div className="px-4 py-2 shrink-0" style={{ borderBottom: `1px solid ${BORDER}`, background: SURFACE }}>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: MUTED }} />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search notes…"
              className="w-full rounded-xl pl-9 pr-8 py-2 text-sm outline-none border"
              style={{ background: 'var(--background)', color: FG, borderColor: BORDER }}
            />
            {search && (
              <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setSearch('')}>
                <X size={13} style={{ color: MUTED }} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Note list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2.5">
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16" style={{ color: MUTED }}>
            <div className="text-center">
              <div className="w-10 h-10 rounded-2xl mx-auto mb-3 animate-pulse" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})` }} />
              <p className="text-xs">Loading notes…</p>
            </div>
          </div>
        ) : visibleNotes.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 gap-4" style={{ color: MUTED }}>
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center opacity-40"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})` }}
            >
              <FileText size={24} color="white" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium mb-1" style={{ color: FG }}>No notes here</p>
              <p className="text-xs">
                {section === 'all' ? 'Tap + to create your first note' :
                  section === 'pinned' ? 'Pin a note to find it here' :
                  section === 'archived' ? 'Archived notes appear here' :
                  'Deleted notes appear here'}
              </p>
            </div>
            {section === 'all' && (
              <button
                onClick={createNote}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:brightness-110 active:scale-95"
                style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`, color: 'white' }}
              >
                <Plus size={15} /> New Note
              </button>
            )}
          </div>
        ) : (
          visibleNotes.map(note => (
            <NoteCard
              key={note.id}
              note={note}
              isActive={activeTab === note.id}
              color={noteColor(note.id)}
              onOpen={() => openNote(note)}
              onPin={() => patchNote(note.id, { isPinned: !note.isPinned })}
              onArchive={() => patchNote(note.id, { isArchived: !note.isArchived })}
              onTrash={() => patchNote(note.id, { isTrashed: !note.isTrashed })}
              onRestore={() => patchNote(note.id, { isTrashed: false })}
              onDelete={() => deleteNote(note.id)}
              inTrash={section === 'trash'}
              onCtxMenu={(x, y) => setNoteCtxMenu({ x, y, note })}
            />
          ))
        )}
      </div>

      {/* Note context menu */}
      {noteCtxMenu && (
        <BpNoteCtxMenu
          x={noteCtxMenu.x} y={noteCtxMenu.y} note={noteCtxMenu.note}
          ctxCopied={ctxCopied}
          inTrash={section === 'trash'}
          onClose={() => setNoteCtxMenu(null)}
          onOpen={() => { openNote(noteCtxMenu.note); setNoteCtxMenu(null); }}
          onDuplicate={() => { duplicateNote(noteCtxMenu.note); setNoteCtxMenu(null); }}
          onExportMd={() => {
            const md = htmlToMarkdown(noteCtxMenu.note.content);
            const safe = noteCtxMenu.note.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'note';
            downloadTextFile(md, `${safe}.md`, 'text/markdown');
            setNoteCtxMenu(null);
          }}
          onExportTxt={() => {
            const div = document.createElement('div');
            div.innerHTML = noteCtxMenu.note.content;
            const txt = div.textContent ?? '';
            const safe = noteCtxMenu.note.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'note';
            downloadTextFile(txt, `${safe}.txt`);
            setNoteCtxMenu(null);
          }}
          onCopyText={() => {
            const div = document.createElement('div');
            div.innerHTML = noteCtxMenu.note.content;
            navigator.clipboard.writeText(div.textContent ?? '').catch(() => {});
            setCtxCopied(true);
            setTimeout(() => setCtxCopied(false), 1500);
            setNoteCtxMenu(null);
          }}
          onPin={() => { patchNote(noteCtxMenu.note.id, { isPinned: !noteCtxMenu.note.isPinned }); setNoteCtxMenu(null); }}
          onArchive={() => { patchNote(noteCtxMenu.note.id, { isArchived: !noteCtxMenu.note.isArchived }); setNoteCtxMenu(null); }}
          onTrash={() => { patchNote(noteCtxMenu.note.id, { isTrashed: true }); setNoteCtxMenu(null); }}
          onRestore={() => { patchNote(noteCtxMenu.note.id, { isTrashed: false }); setNoteCtxMenu(null); }}
          onDelete={() => { deleteNote(noteCtxMenu.note.id); setNoteCtxMenu(null); }}
        />
      )}

      {/* Bottom tab bar */}
      <div
        className="flex shrink-0"
        style={{ borderTop: `1px solid ${BORDER}`, background: SURFACE, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {([
          ['all', FileText, 'All'],
          ['pinned', Pin, 'Pinned'],
          ['archived', Archive, 'Archive'],
          ['trash', Trash2, 'Trash'],
        ] as const).map(([id, Icon, label]) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors"
            style={{ color: section === id ? ACCENT2 : MUTED }}
          >
            <Icon size={18} />
            <span className="text-[10px] font-medium">{label}</span>
            {section === id && (
              <div className="w-4 h-0.5 rounded-full mt-0.5" style={{ background: ACCENT2 }} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Note Card ── */
function NoteCard({
  note, isActive, color, onOpen, inTrash, onCtxMenu,
}: {
  note: BpNote; isActive: boolean; color: string;
  onOpen: () => void; onPin: () => void; onArchive: () => void;
  onTrash: () => void; onRestore: () => void; onDelete: () => void;
  inTrash: boolean; onCtxMenu?: (x: number, y: number) => void;
}) {
  const preview = getPlainText(note.content).slice(0, 100);

  return (
    <div
      className="rounded-2xl overflow-hidden border cursor-pointer transition-all active:scale-[0.98]"
      style={{
        background: SURFACE,
        borderColor: isActive ? ACCENT : BORDER,
        boxShadow: isActive ? `0 0 0 1px ${ACCENT}40` : '0 1px 3px rgba(0,0,0,0.2)',
      }}
      onClick={onOpen}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onCtxMenu?.(e.clientX, e.clientY); }}
    >
      {/* Color accent bar */}
      <div className="h-1" style={{ background: color }} />

      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              {note.isPinned && <Star size={11} style={{ color: ACCENT2 }} fill="currentColor" className="shrink-0" />}
              <p className="text-sm font-semibold truncate" style={{ color: FG }}>
                {note.title || 'Untitled'}
              </p>
            </div>
            <p className="text-xs leading-relaxed line-clamp-2" style={{ color: MUTED }}>
              {preview || 'No content'}
            </p>
          </div>

          {/* ⋯ button — opens full context menu (fixed-positioned, never overflows) */}
          <button
            onClick={e => {
              e.stopPropagation();
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              onCtxMenu?.(rect.right, rect.bottom + 4);
            }}
            className="p-1.5 rounded-xl hover:bg-white/10 transition-colors shrink-0"
            style={{ color: MUTED }}
          >
            <MoreVertical size={14} />
          </button>
        </div>

        <div className="flex items-center gap-1 mt-2">
          <Clock size={10} style={{ color: MUTED }} />
          <span className="text-[10px]" style={{ color: MUTED }}>{formatDate(note.updatedAt)}</span>
          {inTrash && <span className="text-[10px] ml-1" style={{ color: MUTED }}>· Trash</span>}
        </div>
      </div>
    </div>
  );
}

/* ── Toolbar separator ── */
function TbSep() {
  return <div className="w-px h-4 shrink-0 mx-0.5" style={{ background: BORDER }} />;
}

/* ── Format Button (compact) ── */
function FmtBtn({ children, active, onClick, title }: {
  children: React.ReactNode; active?: boolean | null;
  onClick?: () => void; title?: string;
}) {
  return (
    <button
      onMouseDown={e => { e.preventDefault(); onClick?.(); }}
      title={title}
      className="p-1.5 rounded-lg transition-colors shrink-0"
      style={{
        color: active ? ACCENT2 : MUTED,
        background: active ? `${ACCENT}22` : 'transparent',
      }}
    >
      {children}
    </button>
  );
}

/* ── Context Menu Item ── */
function CtxItem({ children, onClick, icon, danger }: {
  children: React.ReactNode; onClick: () => void; icon?: React.ReactNode; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/5 transition-colors text-left"
      style={{ color: danger ? '#ef4444' : FG }}
    >
      {icon}{children}
    </button>
  );
}

/* ── Ballpoint Note Context Menu ── */
function BpNoteCtxMenu({
  x, y, note, ctxCopied, inTrash,
  onClose, onOpen, onDuplicate, onExportMd, onExportTxt, onCopyText,
  onPin, onArchive, onTrash, onRestore, onDelete,
}: {
  x: number; y: number; note: BpNote; ctxCopied: boolean; inTrash: boolean;
  onClose: () => void; onOpen: () => void; onDuplicate: () => void;
  onExportMd: () => void; onExportTxt: () => void; onCopyText: () => void;
  onPin: () => void; onArchive: () => void; onTrash: () => void;
  onRestore: () => void; onDelete: () => void;
}) {
  const w = 220;
  const left = x + w > window.innerWidth ? x - w : x;
  const top = y + 420 > window.innerHeight ? y - 420 : y;

  const { words, chars } = countWords(note.content);
  const plain = (() => { const d = document.createElement('div'); d.innerHTML = note.content; return d.textContent ?? ''; })();
  const readMin = Math.max(1, Math.round(words / 200));

  const sep = <div style={{ height: 1, background: BORDER, margin: '3px 10px' }} />;

  function Row({ icon, label, sub, onClick, danger }: {
    icon: React.ReactNode; label: string; sub?: string; onClick: () => void; danger?: boolean;
  }) {
    return (
      <button
        data-bp-ctx="true"
        onClick={onClick}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors text-left group"
        style={{ color: danger ? '#f87171' : FG, background: 'none' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
      >
        <span style={{ color: danger ? '#f87171' : ACCENT2, width: 15, flexShrink: 0, display: 'flex' }}>{icon}</span>
        <span className="flex-1">{label}</span>
        {sub && <span style={{ color: MUTED, fontSize: 10 }}>{sub}</span>}
      </button>
    );
  }

  return (
    <div
      data-bp-ctx="true"
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed', top, left, zIndex: 10000,
        background: SURFACE,
        border: `1px solid ${BORDER}`,
        borderRadius: 14, boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
        padding: '6px 4px', minWidth: w,
        backdropFilter: 'blur(16px)',
      }}
    >
      {/* Header */}
      <div style={{ padding: '8px 12px 8px', borderBottom: `1px solid ${BORDER}`, marginBottom: 4 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: FG, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: w - 28 }}>{note.title || 'Untitled'}</div>
        <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
          {words} words · {chars} chars · ~{readMin} min read
        </div>
      </div>

      <Row icon={<FileText size={13} />} label="Open Note" onClick={onOpen} />

      {sep}

      <Row icon={<Copy size={13} />} label="Duplicate" onClick={onDuplicate} />
      <Row icon={<Download size={13} />} label="Export as Markdown" sub=".md" onClick={onExportMd} />
      <Row icon={<Type size={13} />} label="Export as Plain Text" sub=".txt" onClick={onExportTxt} />
      <Row
        icon={ctxCopied ? <Check size={13} /> : <Copy size={13} />}
        label={ctxCopied ? 'Copied!' : 'Copy All Text'}
        onClick={onCopyText}
      />

      {sep}

      {!inTrash && (
        <>
          <Row icon={<Star size={13} />} label={note.isPinned ? 'Unpin' : 'Pin to Top'} onClick={onPin} />
          <Row icon={<Archive size={13} />} label={note.isArchived ? 'Unarchive' : 'Archive'} onClick={onArchive} />
          {sep}
        </>
      )}

      {/* Word count stats row */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 12px 4px', color: MUTED, fontSize: 10, borderBottom: `1px solid ${BORDER}`, marginBottom: 4 }}>
        <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 3 }}>
          <HashIcon size={9} /> {words}w
        </span>
        <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 3 }}>
          <Type size={9} /> {chars}c
        </span>
        <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 3 }}>
          📖 {readMin}m
        </span>
        <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 3 }}>
          {plain.trim().split(/\n+/).filter(Boolean).length}p
        </span>
      </div>

      {inTrash ? (
        <>
          <Row icon={<RotateCcw size={13} />} label="Restore" onClick={onRestore} />
          <Row icon={<Trash2 size={13} />} label="Delete Forever" onClick={onDelete} danger />
        </>
      ) : (
        <Row icon={<Trash2 size={13} />} label="Move to Trash" onClick={onTrash} danger />
      )}
    </div>
  );
}

/* ── Editor right-click context menu ── */
const EditorCtxMenu = forwardRef<HTMLDivElement, {
  x: number; y: number; editor: Editor | null; onClose: () => void;
}>(function EditorCtxMenu({ x, y, editor, onClose }, ref) {
  const w = 210;
  const left = x + w > window.innerWidth ? x - w : x;
  const top = y + 320 > window.innerHeight ? y - 320 : y;

  function CRow({ icon, label, onClick, active, danger, shortcut }: {
    icon: React.ReactNode; label: string; onClick: () => void;
    active?: boolean; danger?: boolean; shortcut?: string;
  }) {
    return (
      <button
        onMouseDown={e => { e.preventDefault(); onClick(); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3 py-[7px] text-xs transition-colors text-left"
        style={{ color: danger ? '#f87171' : active ? ACCENT2 : FG, background: 'none' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
      >
        <span style={{ color: danger ? '#f87171' : ACCENT2, width: 15, flexShrink: 0, display: 'flex' }}>{icon}</span>
        <span className="flex-1">{label}</span>
        {shortcut && <span style={{ color: MUTED, fontSize: 10 }}>{shortcut}</span>}
        {active && <Check size={10} style={{ color: ACCENT2, flexShrink: 0 }} />}
      </button>
    );
  }

  const sep = <div style={{ height: 1, background: BORDER, margin: '3px 10px' }} />;

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed', top, left, zIndex: 10001,
        background: SURFACE,
        border: `1px solid ${BORDER}`,
        borderRadius: 14, boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
        padding: '6px 4px', minWidth: w,
        backdropFilter: 'blur(16px)',
      }}
    >
      {/* Inline formatting */}
      <div style={{ padding: '4px 8px 2px', color: MUTED, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Format</div>
      <div style={{ display: 'flex', gap: 2, padding: '2px 8px 4px' }}>
        {([
          { icon: <Bold size={13} />, title: 'Bold', active: editor?.isActive('bold'), action: () => editor?.chain().focus().toggleBold().run() },
          { icon: <Italic size={13} />, title: 'Italic', active: editor?.isActive('italic'), action: () => editor?.chain().focus().toggleItalic().run() },
          { icon: <UnderlineIcon size={13} />, title: 'Underline', active: editor?.isActive('underline'), action: () => editor?.chain().focus().toggleUnderline().run() },
          { icon: <Strikethrough size={13} />, title: 'Strikethrough', active: editor?.isActive('strike'), action: () => editor?.chain().focus().toggleStrike().run() },
        ] as const).map(({ icon, title, active, action }) => (
          <button
            key={title}
            title={title}
            onMouseDown={e => { e.preventDefault(); action(); onClose(); }}
            style={{
              flex: 1, padding: '5px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: active ? `${ACCENT}33` : 'rgba(255,255,255,0.04)',
              color: active ? ACCENT2 : MUTED,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s',
            }}
          >{icon}</button>
        ))}
      </div>

      {sep}

      {/* Heading / block style */}
      <div style={{ padding: '4px 8px 2px', color: MUTED, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Style</div>
      <CRow icon={<Pilcrow size={12} />} label="Normal" active={!editor?.isActive('heading') && !editor?.isActive('blockquote')} onClick={() => editor?.chain().focus().setParagraph().run()} />
      <CRow icon={<Heading1 size={12} />} label="Heading 1" active={editor?.isActive('heading', { level: 1 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} />
      <CRow icon={<Heading2 size={12} />} label="Heading 2" active={editor?.isActive('heading', { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} />
      <CRow icon={<Heading3 size={12} />} label="Heading 3" active={editor?.isActive('heading', { level: 3 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} />
      <CRow icon={<Quote size={12} />} label="Block Quote" active={editor?.isActive('blockquote')} onClick={() => editor?.chain().focus().toggleBlockquote().run()} />

      {sep}

      {/* Edit actions */}
      <CRow
        icon={<Copy size={12} />}
        label="Copy"
        shortcut="⌘C"
        onClick={() => document.execCommand('copy')}
      />
      <CRow
        icon={<Scissors size={12} />}
        label="Cut"
        shortcut="⌘X"
        onClick={() => document.execCommand('cut')}
      />
      <CRow
        icon={<RemoveFormatting size={12} />}
        label="Clear formatting"
        onClick={() => editor?.chain().focus().clearNodes().unsetAllMarks().run()}
      />
    </div>
  );
});
