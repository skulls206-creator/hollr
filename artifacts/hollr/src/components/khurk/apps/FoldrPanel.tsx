import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Folder, FolderOpen, File, FileText, FileCode, Film, Music,
  Image, X, Plus, Upload, Edit2, Trash2, Check,
  LayoutGrid, List, ChevronRight, FolderPlus, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface NativePanelProps {
  dirHandle: FileSystemDirectoryHandle | null;
  onPickFolder: () => void;
  storagePrefix: string;
}

interface FsEntry {
  name: string;
  kind: 'file' | 'directory';
  handle: FileSystemFileHandle | FileSystemDirectoryHandle;
  size?: number;
  lastModified?: number;
}

interface DirChild {
  name: string;
  handle: FileSystemDirectoryHandle;
}

function fileIconFor(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (/^(png|jpe?g|gif|webp|svg|ico|bmp)$/.test(ext)) return Image;
  if (/^(mp4|webm|mov|avi|mkv|m4v)$/.test(ext)) return Film;
  if (/^(mp3|flac|ogg|wav|m4a|aac)$/.test(ext)) return Music;
  if (/^(ts|tsx|js|jsx|py|rs|go|java|c|cpp|css|html|json|yaml|toml|sh|env|xml|php|rb|swift|kt)$/.test(ext)) return FileCode;
  if (/^(md|txt|rtf|csv)$/.test(ext)) return FileText;
  if (ext === 'pdf') return FileText;
  return File;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|ico|bmp)$/i;
const TEXT_EXT = /\.(md|txt|json|ts|tsx|js|jsx|html|css|yaml|toml|rs|py|go|java|c|cpp|sh|env|xml|rb|swift|kt|php|csv)$/i;

// ── Recursive directory copier (used for dir rename) ───────────────────────
async function copyDirRecursive(
  src: FileSystemDirectoryHandle,
  dst: FileSystemDirectoryHandle,
) {
  for await (const entry of src.values()) {
    if (entry.kind === 'file') {
      const file = await entry.getFile();
      const buf = await file.arrayBuffer();
      const fh = await dst.getFileHandle(entry.name, { create: true });
      const w = await fh.createWritable();
      await w.write(buf);
      await w.close();
    } else {
      const subDst = await dst.getDirectoryHandle(entry.name, { create: true });
      await copyDirRecursive(entry, subDst);
    }
  }
}

// ── Folder tree sidebar ────────────────────────────────────────────────────
function FolderTree({
  rootHandle,
  selectedPath,
  onNavigate,
  refreshTick,
}: {
  rootHandle: FileSystemDirectoryHandle;
  selectedPath: string;
  onNavigate: (pathKey: string, stack: FileSystemDirectoryHandle[]) => void;
  refreshTick: number;
}) {
  const rootKey = rootHandle.name;
  // path → sorted dir children (undefined = not yet loaded)
  const [childrenMap, setChildrenMap] = useState<Map<string, DirChild[]>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set([rootKey]));
  // path → handle lookup (populated as we expand nodes)
  const handlesMap = useRef<Map<string, FileSystemDirectoryHandle>>(
    new Map([[rootKey, rootHandle]])
  );

  const loadChildren = useCallback(async (pathKey: string) => {
    const handle = handlesMap.current.get(pathKey);
    if (!handle) return;
    const children: DirChild[] = [];
    try {
      for await (const entry of handle.values()) {
        if (entry.kind === 'directory' && !entry.name.startsWith('.')) {
          const childKey = `${pathKey}/${entry.name}`;
          handlesMap.current.set(childKey, entry);
          children.push({ name: entry.name, handle: entry });
        }
      }
    } catch { /* permission may be denied */ }
    children.sort((a, b) => a.name.localeCompare(b.name));
    setChildrenMap(prev => new Map(prev).set(pathKey, children));
  }, []);

  // Load root on mount and when refreshTick changes
  useEffect(() => {
    setChildrenMap(new Map());
    handlesMap.current = new Map([[rootKey, rootHandle]]);
    loadChildren(rootKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootHandle, refreshTick]);

  const toggle = useCallback(async (e: React.MouseEvent, pathKey: string) => {
    e.stopPropagation();
    if (expanded.has(pathKey)) {
      setExpanded(prev => { const n = new Set(prev); n.delete(pathKey); return n; });
    } else {
      if (!childrenMap.has(pathKey)) await loadChildren(pathKey);
      setExpanded(prev => new Set([...prev, pathKey]));
    }
  }, [expanded, childrenMap, loadChildren]);

  const navigate = useCallback((pathKey: string) => {
    const segments = pathKey.split('/').slice(1); // skip root name
    const stack: FileSystemDirectoryHandle[] = [];
    let cur = rootKey;
    for (const seg of segments) {
      cur = `${cur}/${seg}`;
      const h = handlesMap.current.get(cur);
      if (h) stack.push(h);
    }
    onNavigate(pathKey, stack);
  }, [rootKey, onNavigate]);

  // Auto-expand the selected path in the tree
  useEffect(() => {
    if (!selectedPath) return;
    const parts = selectedPath.split('/');
    const toExpand: string[] = [];
    for (let i = 1; i <= parts.length; i++) {
      toExpand.push(parts.slice(0, i).join('/'));
    }
    setExpanded(prev => {
      const n = new Set(prev);
      toExpand.forEach(p => n.add(p));
      return n;
    });
    // Load children for all ancestors that aren't loaded yet
    toExpand.forEach(p => { if (!childrenMap.has(p)) loadChildren(p); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPath]);

  function renderNode(pathKey: string, depth: number): React.ReactNode {
    const children = childrenMap.get(pathKey);
    const isExp = expanded.has(pathKey);
    const isSel = pathKey === selectedPath;
    const name = depth === 0 ? rootHandle.name : pathKey.split('/').pop()!;
    const hasKids = children === undefined || children.length > 0;

    return (
      <div key={pathKey}>
        <div
          onClick={() => navigate(pathKey)}
          className={cn(
            'flex items-center gap-1 py-1 rounded-md cursor-pointer select-none transition-colors text-[11px]',
            isSel ? 'bg-blue-600/25 text-blue-300' : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]',
          )}
          style={{ paddingLeft: `${6 + depth * 14}px`, paddingRight: '6px' }}
        >
          <button
            onClick={e => toggle(e, pathKey)}
            className={cn('shrink-0 transition-colors', hasKids ? 'text-white/25 hover:text-white/60' : 'opacity-0 pointer-events-none')}
          >
            <ChevronRight
              size={10}
              className={cn('transition-transform duration-150', isExp && 'rotate-90')}
            />
          </button>
          {isExp
            ? <FolderOpen size={11} className="shrink-0 text-blue-400/80" strokeWidth={1.5} />
            : <Folder size={11} className="shrink-0 text-blue-400/60" strokeWidth={1.5} />}
          <span className="truncate">{name}</span>
        </div>
        {isExp && children && children.map(child =>
          renderNode(`${pathKey}/${child.name}`, depth + 1)
        )}
        {isExp && children && children.length === 0 && (
          <p className="text-[10px] text-white/20 italic" style={{ paddingLeft: `${6 + (depth + 1) * 14 + 12}px` }}>Empty</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto py-1 px-1">
      {renderNode(rootKey, 0)}
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────
export function FoldrPanel({ dirHandle, onPickFolder }: NativePanelProps) {
  const [pathStack, setPathStack] = useState<FileSystemDirectoryHandle[]>([]);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMeta, setPreviewMeta] = useState<{ size: number; lastModified: number } | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  const currentDir: FileSystemDirectoryHandle | null =
    pathStack.length > 0 ? pathStack[pathStack.length - 1] : dirHandle;

  // Compute path key for the tree (used to highlight selected tree node)
  const selectedTreePath = dirHandle
    ? [dirHandle.name, ...pathStack.map(h => h.name)].join('/')
    : '';

  function clearPreview() {
    if (previewUrlRef.current) { URL.revokeObjectURL(previewUrlRef.current); previewUrlRef.current = null; }
    setPreviewContent(null);
    setPreviewUrl(null);
    setPreviewMeta(null);
  }

  const loadEntries = useCallback(async (dir: FileSystemDirectoryHandle) => {
    setLoading(true);
    try {
      const list: FsEntry[] = [];
      for await (const entry of dir.values()) {
        if (entry.name.startsWith('.')) continue;
        if (entry.kind === 'file') {
          const file = await entry.getFile();
          list.push({ name: entry.name, kind: 'file', handle: entry, size: file.size, lastModified: file.lastModified });
        } else {
          list.push({ name: entry.name, kind: 'directory', handle: entry });
        }
      }
      list.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setEntries(list);
      setSelected(null);
      clearPreview();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!dirHandle) { setPathStack([]); setEntries([]); setSelected(null); clearPreview(); return; }
    setPathStack([]);
    loadEntries(dirHandle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirHandle]);

  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); }, []);

  // Navigate via tree click
  const handleTreeNavigate = useCallback(async (pathKey: string, stack: FileSystemDirectoryHandle[]) => {
    setPathStack(stack);
    const target = stack.length > 0 ? stack[stack.length - 1] : dirHandle;
    if (target) await loadEntries(target);
  }, [dirHandle, loadEntries]);

  // Navigate into a directory from the file list (double-click)
  const navigateInto = useCallback(async (entry: FsEntry) => {
    if (entry.kind !== 'directory') return;
    const dh = entry.handle as FileSystemDirectoryHandle;
    setPathStack(prev => [...prev, dh]);
    await loadEntries(dh);
  }, [loadEntries]);

  // Navigate via breadcrumb click
  const navigateTo = useCallback(async (idx: number) => {
    if (!dirHandle) return;
    if (idx < 0) {
      setPathStack([]);
      await loadEntries(dirHandle);
    } else {
      const next = pathStack.slice(0, idx + 1);
      setPathStack(next);
      await loadEntries(next[next.length - 1]);
    }
  }, [dirHandle, pathStack, loadEntries]);

  const selectFile = useCallback(async (entry: FsEntry) => {
    if (entry.kind === 'directory') return;
    setSelected(entry.name);
    clearPreview();
    try {
      const file = await (entry.handle as FileSystemFileHandle).getFile();
      setPreviewMeta({ size: file.size, lastModified: file.lastModified });
      if (IMAGE_EXT.test(entry.name)) {
        const url = URL.createObjectURL(file);
        previewUrlRef.current = url;
        setPreviewUrl(url);
      } else if (TEXT_EXT.test(entry.name)) {
        setPreviewContent(await file.text());
      }
    } catch (e) { console.warn('[Foldr] preview:', e); }
  }, []);

  const refresh = useCallback(() => {
    if (currentDir) { loadEntries(currentDir); setRefreshTick(t => t + 1); }
  }, [currentDir, loadEntries]);

  const createFile = useCallback(async () => {
    if (!currentDir) return;
    const existing = new Set(entries.map(e => e.name));
    let i = 1;
    let name = `untitled-${i}.txt`;
    while (existing.has(name)) name = `untitled-${++i}.txt`;
    try {
      const fh = await currentDir.getFileHandle(name, { create: true });
      const w = await fh.createWritable(); await w.write(''); await w.close();
      await loadEntries(currentDir);
      setRenaming(name);
      setRenameVal(name.replace(/\.[^.]+$/, ''));
    } catch (e) { console.warn('[Foldr] createFile:', e); }
  }, [currentDir, entries, loadEntries]);

  const createFolder = useCallback(async () => {
    if (!currentDir) return;
    const existing = new Set(entries.map(e => e.name));
    let i = 1;
    let name = `New Folder ${i}`;
    while (existing.has(name)) name = `New Folder ${++i}`;
    try {
      await currentDir.getDirectoryHandle(name, { create: true });
      await loadEntries(currentDir);
      setRefreshTick(t => t + 1);
      setRenaming(name);
      setRenameVal(name);
    } catch (e) { console.warn('[Foldr] createFolder:', e); }
  }, [currentDir, entries, loadEntries]);

  const startRename = (entry: FsEntry) => {
    setRenaming(entry.name);
    setRenameVal(
      entry.kind === 'file' && entry.name.includes('.')
        ? entry.name.replace(/\.[^.]+$/, '')
        : entry.name
    );
  };

  const commitRename = useCallback(async () => {
    if (!currentDir || !renaming || !renameVal.trim()) { setRenaming(null); return; }
    const entry = entries.find(e => e.name === renaming);
    if (!entry) { setRenaming(null); return; }

    const ext = entry.kind === 'file' && renaming.includes('.') ? '.' + renaming.split('.').pop() : '';
    const base = renameVal.trim();
    let newName = base + ext;
    if (newName === renaming) { setRenaming(null); return; }

    // Collision guard: auto-suffix if the target name already exists
    const existingNames = new Set(entries.map(e => e.name).filter(n => n !== renaming));
    if (existingNames.has(newName)) {
      let i = 2;
      while (existingNames.has(newName)) {
        newName = ext ? `${base} (${i++})${ext}` : `${base} (${i++})`;
      }
    }

    try {
      if (entry.kind === 'file') {
        // File rename: copy bytes then remove original
        const fh = entry.handle as FileSystemFileHandle;
        const buf = await (await fh.getFile()).arrayBuffer();
        const newFh = await currentDir.getFileHandle(newName, { create: true });
        const w = await newFh.createWritable(); await w.write(buf); await w.close();
        await currentDir.removeEntry(renaming);
      } else {
        // Directory rename: create new dir, recursively copy, remove old
        const srcDh = entry.handle as FileSystemDirectoryHandle;
        const dstDh = await currentDir.getDirectoryHandle(newName, { create: true });
        await copyDirRecursive(srcDh, dstDh);
        await currentDir.removeEntry(renaming, { recursive: true });
        setRefreshTick(t => t + 1);
      }
      await loadEntries(currentDir);
    } catch (e) { console.warn('[Foldr] rename:', e); }
    setRenaming(null);
  }, [currentDir, renaming, renameVal, entries, loadEntries]);

  const deleteEntry = useCallback(async (name: string) => {
    if (!currentDir) return;
    try {
      await currentDir.removeEntry(name, { recursive: true });
      await loadEntries(currentDir);
      setRefreshTick(t => t + 1);
      if (selected === name) { setSelected(null); clearPreview(); }
    } catch (e) { console.warn('[Foldr] delete:', e); }
    setConfirmDelete(null);
  }, [currentDir, selected, loadEntries]);

  const uploadFiles = useCallback(async (fileList: FileList) => {
    if (!currentDir) return;
    for (const file of Array.from(fileList)) {
      try {
        const fh = await currentDir.getFileHandle(file.name, { create: true });
        const w = await fh.createWritable(); await w.write(file); await w.close();
      } catch (e) { console.warn('[Foldr] upload:', e); }
    }
    await loadEntries(currentDir);
  }, [currentDir, loadEntries]);

  const hasPreview = selected && (previewContent !== null || previewUrl !== null || previewMeta !== null);

  if (!dirHandle) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#080e18] gap-5 px-6 text-white">
        <div className="w-14 h-14 rounded-2xl bg-blue-600/20 flex items-center justify-center">
          <FolderOpen size={28} className="text-blue-400" strokeWidth={1.5} />
        </div>
        <div className="text-center space-y-1.5">
          <h2 className="text-base font-semibold">Foldr Storage</h2>
          <p className="text-sm text-white/50 leading-relaxed max-w-xs">Connect a local folder to browse, manage, and preview your files.</p>
        </div>
        <button onClick={onPickFolder} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
          <FolderOpen size={16} />Connect Folder
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 h-full overflow-hidden bg-[#080e18] text-white relative">
      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-50">
          <div className="bg-[#0f1625] border border-white/10 rounded-2xl p-6 w-72 space-y-4 shadow-2xl">
            <h3 className="text-sm font-semibold text-white">Delete "{confirmDelete}"?</h3>
            <p className="text-xs text-white/40">This cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 rounded-lg text-xs text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors">Cancel</button>
              <button onClick={() => deleteEntry(confirmDelete)} className="px-3 py-1.5 rounded-lg text-xs bg-red-600 hover:bg-red-500 text-white transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" multiple className="hidden"
        onChange={e => e.target.files && uploadFiles(e.target.files)} />

      {/* ── Folder tree sidebar ── */}
      <div className="w-[180px] shrink-0 flex flex-col border-r border-white/[0.06] bg-[#0a1120]">
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/[0.06] shrink-0">
          <FolderOpen size={12} className="text-blue-400 shrink-0" strokeWidth={1.5} />
          <span className="text-[11px] font-semibold text-white/60 truncate flex-1">{dirHandle.name}</span>
          <button onClick={refresh} title="Refresh tree" className="p-0.5 text-white/20 hover:text-white/60 transition-colors shrink-0">
            <RefreshCw size={10} />
          </button>
        </div>
        <FolderTree
          rootHandle={dirHandle}
          selectedPath={selectedTreePath}
          onNavigate={handleTreeNavigate}
          refreshTick={refreshTick}
        />
      </div>

      {/* ── Main file list ── */}
      <div className={cn('flex flex-col flex-1 min-w-0 min-h-0', hasPreview && 'border-r border-white/[0.06]')}>
        {/* Toolbar */}
        <div className="flex items-center gap-1 px-3 py-2 bg-[#0a1120] border-b border-white/[0.06] shrink-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-0.5 flex-1 min-w-0 text-[11px] overflow-hidden">
            <button onClick={() => navigateTo(-1)}
              className={cn('flex items-center gap-1 px-1.5 py-0.5 rounded-md transition-colors shrink-0',
                pathStack.length === 0 ? 'text-blue-300' : 'text-white/35 hover:text-white/65 hover:bg-white/[0.05]')}>
              <span className="max-w-[70px] truncate">{dirHandle.name}</span>
            </button>
            {pathStack.map((seg, i) => (
              <span key={i} className="flex items-center gap-0.5 shrink-0">
                <ChevronRight size={9} className="text-white/15" />
                <button onClick={() => navigateTo(i)}
                  className={cn('px-1.5 py-0.5 rounded-md transition-colors max-w-[70px] truncate',
                    i === pathStack.length - 1 ? 'text-blue-300' : 'text-white/35 hover:text-white/65 hover:bg-white/[0.05]')}>
                  {seg.name}
                </button>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={refresh} title="Refresh" className="p-1.5 rounded-md text-white/25 hover:text-white/65 hover:bg-white/[0.05] transition-colors"><RefreshCw size={11} /></button>
            <button onClick={createFile} title="New File" className="p-1.5 rounded-md text-white/25 hover:text-white/65 hover:bg-white/[0.05] transition-colors"><Plus size={11} /></button>
            <button onClick={createFolder} title="New Folder" className="p-1.5 rounded-md text-white/25 hover:text-white/65 hover:bg-white/[0.05] transition-colors"><FolderPlus size={11} /></button>
            <button onClick={() => fileInputRef.current?.click()} title="Upload Files" className="p-1.5 rounded-md text-white/25 hover:text-white/65 hover:bg-white/[0.05] transition-colors"><Upload size={11} /></button>
            {selected && (
              <>
                <div className="w-px h-4 bg-white/[0.06] mx-0.5" />
                <button
                  onClick={() => { const e = entries.find(en => en.name === selected); if (e) startRename(e); }}
                  title={`Rename "${selected}"`}
                  className="p-1.5 rounded-md text-white/25 hover:text-white/65 hover:bg-white/[0.05] transition-colors"
                ><Edit2 size={11} /></button>
                <button
                  onClick={() => setConfirmDelete(selected)}
                  title={`Delete "${selected}"`}
                  className="p-1.5 rounded-md text-white/25 hover:text-red-400/80 hover:bg-red-500/10 transition-colors"
                ><Trash2 size={11} /></button>
              </>
            )}
            <div className="w-px h-4 bg-white/[0.06] mx-0.5" />
            <button onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')} title="Toggle view"
              className="p-1.5 rounded-md text-white/25 hover:text-white/65 hover:bg-white/[0.05] transition-colors">
              {viewMode === 'grid' ? <List size={11} /> : <LayoutGrid size={11} />}
            </button>
          </div>
        </div>

        {/* File area */}
        <div
          className="flex-1 overflow-y-auto p-3"
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); e.dataTransfer.files && uploadFiles(e.dataTransfer.files); }}
        >
          {loading && <p className="text-[11px] text-white/25 text-center py-8">Loading…</p>}
          {!loading && entries.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <FolderOpen size={28} className="text-white/10" strokeWidth={1.5} />
              <p className="text-sm text-white/25">Empty folder</p>
              <p className="text-[11px] text-white/15">Drop files here or use the toolbar</p>
            </div>
          )}
          {!loading && (
            viewMode === 'grid' ? (
              <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))' }}>
                {entries.map(entry => (
                  <GridItem key={entry.name} entry={entry}
                    isSelected={selected === entry.name}
                    isRenaming={renaming === entry.name}
                    renameVal={renameVal}
                    onRenameChange={setRenameVal}
                    onRenameCommit={commitRename}
                    onRenameCancel={() => setRenaming(null)}
                    onNavigate={() => navigateInto(entry)}
                    onSelect={() => selectFile(entry)}
                    onRename={() => startRename(entry)}
                    onDelete={() => setConfirmDelete(entry.name)}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-0.5">
                {entries.map(entry => (
                  <ListItem key={entry.name} entry={entry}
                    isSelected={selected === entry.name}
                    isRenaming={renaming === entry.name}
                    renameVal={renameVal}
                    onRenameChange={setRenameVal}
                    onRenameCommit={commitRename}
                    onRenameCancel={() => setRenaming(null)}
                    onNavigate={() => navigateInto(entry)}
                    onSelect={() => selectFile(entry)}
                    onRename={() => startRename(entry)}
                    onDelete={() => setConfirmDelete(entry.name)}
                  />
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* ── Preview panel ── */}
      {hasPreview && (
        <div className="w-56 shrink-0 flex flex-col bg-[#0a1120]">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06] shrink-0">
            <span className="text-[11px] font-medium text-white/45 truncate">{selected}</span>
            <button onClick={() => { setSelected(null); clearPreview(); }} className="text-white/20 hover:text-white/50 transition-colors ml-2 shrink-0">
              <X size={11} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {previewUrl && (
              <img src={previewUrl} alt={selected!} className="w-full rounded-lg object-contain max-h-40" />
            )}
            {previewContent !== null && (
              <pre className="text-[11px] text-white/55 font-mono whitespace-pre-wrap break-words leading-relaxed">
                {previewContent.length > 4000 ? previewContent.slice(0, 4000) + '\n…' : previewContent}
              </pre>
            )}
            {previewMeta && (
              <div className="text-[10px] text-white/30 border-t border-white/[0.06] pt-2 space-y-1">
                {previewMeta.size !== undefined && <p>Size: {formatBytes(previewMeta.size)}</p>}
                {previewMeta.lastModified && <p>Modified: {new Date(previewMeta.lastModified).toLocaleString()}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Grid item ──────────────────────────────────────────────────────────────
function GridItem({ entry, isSelected, isRenaming, renameVal, onRenameChange, onRenameCommit, onRenameCancel, onNavigate, onSelect, onRename, onDelete }: {
  entry: FsEntry; isSelected: boolean; isRenaming: boolean;
  renameVal: string; onRenameChange: (v: string) => void; onRenameCommit: () => void; onRenameCancel: () => void;
  onNavigate: () => void; onSelect: () => void; onRename: () => void; onDelete: () => void;
}) {
  const isDir = entry.kind === 'directory';
  const Icon = isDir ? Folder : fileIconFor(entry.name);
  return (
    <div
      onClick={onSelect}
      onDoubleClick={isDir ? onNavigate : undefined}
      className={cn('flex flex-col items-center gap-1.5 p-2 rounded-xl cursor-pointer transition-colors select-none group relative',
        isSelected ? 'bg-blue-600/20 ring-1 ring-blue-500/30' : 'hover:bg-white/[0.04]')}>
      <Icon size={26} className={isDir ? 'text-blue-400' : 'text-white/40'} strokeWidth={1.5} />
      {isRenaming ? (
        <input autoFocus value={renameVal} onChange={e => onRenameChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onRenameCommit(); if (e.key === 'Escape') onRenameCancel(); }}
          onClick={e => e.stopPropagation()}
          className="w-full bg-[#0f1625] text-[10px] text-white text-center px-1 py-0.5 rounded border border-blue-500/50 outline-none" />
      ) : (
        <span className="text-[10px] text-white/65 text-center leading-tight line-clamp-2 break-all">{entry.name}</span>
      )}
      {!isRenaming && (
        <div className="absolute top-1 right-1 hidden group-hover:flex gap-0.5">
          <button onClick={e => { e.stopPropagation(); onRename(); }}
            className="p-0.5 rounded bg-white/10 hover:bg-white/20 text-white/40 hover:text-white/70 transition-colors"><Edit2 size={8} /></button>
          <button onClick={e => { e.stopPropagation(); onDelete(); }}
            className="p-0.5 rounded bg-white/10 hover:bg-red-500/30 text-white/40 hover:text-red-400 transition-colors"><Trash2 size={8} /></button>
        </div>
      )}
    </div>
  );
}

// ── List item ──────────────────────────────────────────────────────────────
function ListItem({ entry, isSelected, isRenaming, renameVal, onRenameChange, onRenameCommit, onRenameCancel, onNavigate, onSelect, onRename, onDelete }: {
  entry: FsEntry; isSelected: boolean; isRenaming: boolean;
  renameVal: string; onRenameChange: (v: string) => void; onRenameCommit: () => void; onRenameCancel: () => void;
  onNavigate: () => void; onSelect: () => void; onRename: () => void; onDelete: () => void;
}) {
  const isDir = entry.kind === 'directory';
  const Icon = isDir ? Folder : fileIconFor(entry.name);
  return (
    <div
      onClick={onSelect}
      onDoubleClick={isDir ? onNavigate : undefined}
      className={cn('flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors select-none group',
        isSelected ? 'bg-blue-600/20 ring-1 ring-blue-500/30' : 'hover:bg-white/[0.04]')}>
      <Icon size={14} className={isDir ? 'text-blue-400 shrink-0' : 'text-white/35 shrink-0'} strokeWidth={1.5} />
      {isRenaming ? (
        <input autoFocus value={renameVal} onChange={e => onRenameChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onRenameCommit(); if (e.key === 'Escape') onRenameCancel(); }}
          onClick={e => e.stopPropagation()}
          className="flex-1 bg-[#0f1625] text-[11px] text-white px-2 py-0.5 rounded border border-blue-500/50 outline-none" />
      ) : (
        <>
          <span className="flex-1 text-[12px] text-white/75 truncate">{entry.name}</span>
          {entry.size !== undefined && <span className="text-[10px] text-white/20 shrink-0">{formatBytes(entry.size)}</span>}
          {entry.lastModified && (
            <span className="text-[10px] text-white/15 shrink-0 hidden sm:block">
              {new Date(entry.lastModified).toLocaleDateString()}
            </span>
          )}
          {isDir && <ChevronRight size={11} className="text-white/15 shrink-0" />}
        </>
      )}
      {!isRenaming && (
        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
          <button onClick={e => { e.stopPropagation(); onRename(); }}
            className="p-1 rounded hover:bg-white/10 text-white/25 hover:text-white/65 transition-colors"><Edit2 size={10} /></button>
          <button onClick={e => { e.stopPropagation(); onDelete(); }}
            className="p-1 rounded hover:bg-red-500/15 text-white/25 hover:text-red-400 transition-colors"><Trash2 size={10} /></button>
        </div>
      )}
    </div>
  );
}
