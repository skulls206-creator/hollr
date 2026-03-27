/**
 * FoldrPanel — cloud file manager backed by Lighthouse (IPFS) + HOLLR account
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Upload, Trash2, Download, Search, X, LayoutGrid, List,
  FileText, FileCode, FileImage, FileVideo, FileAudio,
  File as FileIcon, Loader2, RefreshCw, Info, Copy, CheckCheck,
} from 'lucide-react';
import type { NativePanelProps } from '@/lib/khurk-apps';
import { useAuth } from '@workspace/replit-auth-web';

const API = import.meta.env.BASE_URL;

interface FoldrFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  cid: string;
  url: string;
  uploadedAt: string;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return <FileImage size={20} className="text-blue-400" />;
  if (mime.startsWith('video/')) return <FileVideo size={20} className="text-purple-400" />;
  if (mime.startsWith('audio/')) return <FileAudio size={20} className="text-pink-400" />;
  if (mime.includes('pdf') || mime.startsWith('text/')) return <FileText size={20} className="text-orange-400" />;
  if (mime.includes('json') || mime.includes('javascript') || mime.includes('typescript') || mime.includes('html') || mime.includes('css'))
    return <FileCode size={20} className="text-green-400" />;
  return <FileIcon size={20} className="text-muted-foreground" />;
}

function largeFileIcon(mime: string) {
  if (mime.startsWith('image/')) return <FileImage size={32} className="text-blue-400" />;
  if (mime.startsWith('video/')) return <FileVideo size={32} className="text-purple-400" />;
  if (mime.startsWith('audio/')) return <FileAudio size={32} className="text-pink-400" />;
  if (mime.includes('pdf') || mime.startsWith('text/')) return <FileText size={32} className="text-orange-400" />;
  return <FileIcon size={32} className="text-muted-foreground" />;
}

export function FoldrPanel({ storagePrefix }: NativePanelProps) {
  const { user } = useAuth();
  const [files, setFiles] = useState<FoldrFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem(`${storagePrefix}:view`) as 'grid' | 'list') ?? 'grid';
  });
  const [selected, setSelected] = useState<FoldrFile | null>(null);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const setView = (v: 'grid' | 'list') => {
    setViewMode(v);
    localStorage.setItem(`${storagePrefix}:view`, v);
  };

  /* ── Fetch files ── */
  const fetchFiles = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}api/foldr/files`, { credentials: 'include' });
      if (!res.ok) throw new Error();
      const data: FoldrFile[] = await res.json();
      setFiles(data);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  /* ── Upload ── */
  const uploadFile = useCallback(async (file: File) => {
    setUploading(true);
    setUploadProgress(`Uploading ${file.name}…`);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API}api/foldr/upload`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      if (!res.ok) throw new Error(await res.text());
      const uploaded: FoldrFile = await res.json();
      setFiles(prev => [uploaded, ...prev]);
      setSelected(uploaded);
    } catch (err) {
      console.error('[Foldr] upload failed', err);
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }, []);

  const uploadFiles = async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList);
    for (const f of arr) await uploadFile(f);
  };

  /* ── Delete ── */
  const deleteFile = useCallback(async (id: string) => {
    if (!confirm('Delete this file? It will be removed from your library but remain on IPFS.')) return;
    const res = await fetch(`${API}api/foldr/files/${id}`, { method: 'DELETE', credentials: 'include' });
    if (!res.ok) return;
    setFiles(prev => prev.filter(f => f.id !== id));
    if (selected?.id === id) setSelected(null);
  }, [selected]);

  /* ── Drag & drop ── */
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
  };

  /* ── Copy CID ── */
  const copyCid = async (cid: string) => {
    await navigator.clipboard.writeText(cid);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  /* ── Filtered list ── */
  const filtered = files.filter(f =>
    !search || f.name.toLowerCase().includes(search.toLowerCase())
  );

  const isImage = (mime: string) => mime.startsWith('image/');

  if (!user) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        Sign in to use Foldr
      </div>
    );
  }

  return (
    <div
      ref={dropZoneRef}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`h-full flex flex-col bg-background text-foreground overflow-hidden transition-colors ${dragging ? 'ring-2 ring-primary ring-inset' : ''}`}
    >

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0 bg-background/90 backdrop-blur">
        {/* Upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          Upload
        </button>
        <input ref={fileInputRef} type="file" multiple hidden onChange={e => e.target.files && uploadFiles(e.target.files)} />

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search files…"
            className="w-full pl-7 pr-2 py-1.5 text-xs rounded-md border border-border bg-background focus:outline-none placeholder:text-muted-foreground"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={11} />
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button onClick={fetchFiles} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title="Refresh">
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setView('grid')}
            className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}
            title="Grid view"
          ><LayoutGrid size={14} /></button>
          <button
            onClick={() => setView('list')}
            className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}
            title="List view"
          ><List size={14} /></button>
        </div>
      </div>

      {/* ── Upload progress ── */}
      {uploadProgress && (
        <div className="px-4 py-2 bg-primary/10 text-primary text-xs border-b border-border flex items-center gap-2 shrink-0">
          <Loader2 size={12} className="animate-spin" />
          {uploadProgress}
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* File area */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
              {dragging ? (
                <p className="text-sm font-medium text-primary">Drop files here to upload</p>
              ) : (
                <>
                  <Upload size={28} className="opacity-40" />
                  <p className="text-sm">{search ? 'No files match your search' : 'Drop files here or click Upload'}</p>
                </>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {filtered.map(f => (
                <div
                  key={f.id}
                  onClick={() => setSelected(sel => sel?.id === f.id ? null : f)}
                  className={`group relative flex flex-col items-center gap-1.5 p-3 rounded-lg border cursor-pointer transition-all ${
                    selected?.id === f.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-border/80 hover:bg-accent/30'
                  }`}
                >
                  {isImage(f.mimeType) ? (
                    <img src={f.url} alt={f.name} className="w-12 h-12 rounded object-cover" loading="lazy" />
                  ) : (
                    <div className="w-12 h-12 flex items-center justify-center rounded bg-accent/50">
                      {largeFileIcon(f.mimeType)}
                    </div>
                  )}
                  <span className="text-[10px] text-center truncate w-full leading-tight">{f.name}</span>
                  <span className="text-[9px] text-muted-foreground">{formatBytes(f.size)}</span>
                </div>
              ))}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left py-1.5 px-2 font-medium">Name</th>
                  <th className="text-left py-1.5 px-2 font-medium">Size</th>
                  <th className="text-left py-1.5 px-2 font-medium">Date</th>
                  <th className="py-1.5 px-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(f => (
                  <tr
                    key={f.id}
                    onClick={() => setSelected(sel => sel?.id === f.id ? null : f)}
                    className={`border-b border-border/50 cursor-pointer transition-colors ${selected?.id === f.id ? 'bg-primary/5' : 'hover:bg-accent/30'}`}
                  >
                    <td className="py-1.5 px-2">
                      <div className="flex items-center gap-2">
                        {fileIcon(f.mimeType)}
                        <span className="truncate max-w-[180px]">{f.name}</span>
                      </div>
                    </td>
                    <td className="py-1.5 px-2 text-muted-foreground whitespace-nowrap">{formatBytes(f.size)}</td>
                    <td className="py-1.5 px-2 text-muted-foreground whitespace-nowrap">{formatDate(f.uploadedAt)}</td>
                    <td className="py-1.5 px-2">
                      <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <a href={f.url} target="_blank" rel="noopener noreferrer" download={f.name} onClick={e => e.stopPropagation()}>
                          <Download size={13} className="text-muted-foreground hover:text-foreground" />
                        </a>
                        <button onClick={e => { e.stopPropagation(); deleteFile(f.id); }}>
                          <Trash2 size={13} className="text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-60 shrink-0 border-l border-border flex flex-col overflow-hidden bg-background">
            {/* Preview */}
            <div className="h-40 bg-accent/20 flex items-center justify-center shrink-0 relative">
              {isImage(selected.mimeType) ? (
                <img src={selected.url} alt={selected.name} className="w-full h-full object-contain" />
              ) : (
                <div className="flex flex-col items-center gap-2">
                  {largeFileIcon(selected.mimeType)}
                  <span className="text-[10px] text-muted-foreground">{selected.mimeType}</span>
                </div>
              )}
              <button
                onClick={() => setSelected(null)}
                className="absolute top-2 right-2 p-1 rounded-full bg-background/80 hover:bg-background text-muted-foreground hover:text-foreground"
              ><X size={12} /></button>
            </div>

            {/* Info */}
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
              <div>
                <p className="text-xs font-semibold truncate">{selected.name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{formatBytes(selected.size)}</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <InfoRow label="Uploaded" value={formatDate(selected.uploadedAt)} />
                <InfoRow label="Type" value={selected.mimeType} />
              </div>

              {/* CID */}
              <div>
                <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1"><Info size={10} /> IPFS CID</p>
                <div className="flex items-center gap-1 bg-accent/40 rounded px-2 py-1">
                  <span className="text-[9px] font-mono truncate flex-1">{selected.cid}</span>
                  <button onClick={() => copyCid(selected.cid)} className="shrink-0 text-muted-foreground hover:text-foreground">
                    {copied ? <CheckCheck size={11} className="text-green-500" /> : <Copy size={11} />}
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-1.5 mt-auto pt-2">
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={selected.name}
                  className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-md border border-border text-xs hover:bg-accent transition-colors"
                >
                  <Download size={12} /> Download
                </a>
                <button
                  onClick={() => deleteFile(selected.id)}
                  className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-md border border-border text-xs text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="h-6 border-t border-border flex items-center px-4 gap-4 text-[10px] text-muted-foreground shrink-0">
        <span>{files.length} file{files.length !== 1 ? 's' : ''}</span>
        <span>{formatBytes(files.reduce((a, f) => a + f.size, 0))} total</span>
        <span className="ml-auto opacity-60">Stored on IPFS via Lighthouse</span>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-[10px] truncate">{value}</span>
    </div>
  );
}
