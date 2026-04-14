import { useState, useEffect } from 'react';
import { Download, Lock, FileText, FileImage, FileVideo, FileAudio, File as FileIcon, Loader2, AlertTriangle } from 'lucide-react';

interface ShareData {
  u: string;   // presigned download URL
  i: string;   // iv (base64)
  k: string;   // AES key (base64)
  n: string;   // filename
  m: string;   // mimeType
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function b64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}

async function importAesKey(rawBase64: string): Promise<CryptoKey> {
  return window.crypto.subtle.importKey('raw', b64ToBuffer(rawBase64), { name: 'AES-GCM' }, false, ['decrypt']);
}

async function decryptBuffer(key: CryptoKey, ciphertext: ArrayBuffer, ivBase64: string): Promise<ArrayBuffer> {
  const iv = b64ToBuffer(ivBase64);
  return window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
}

export function FoldrSharePage() {
  const [state, setState] = useState<'loading' | 'ready' | 'downloading' | 'error'>('loading');
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);

  useEffect(() => {
    try {
      const hash = window.location.hash.slice(1);
      if (!hash) { setError('No share data found in URL.'); setState('error'); return; }
      const data: ShareData = JSON.parse(atob(hash));
      if (!data.u || !data.i || !data.k || !data.n || !data.m) {
        setError('Share link is malformed or incomplete.');
        setState('error');
        return;
      }
      setShareData(data);
      setState('ready');
    } catch {
      setError('Could not parse share link. It may be corrupted.');
      setState('error');
    }
  }, []);

  const handleDownload = async () => {
    if (!shareData) return;
    setState('downloading');
    setError(null);
    try {
      const key = await importAesKey(shareData.k);
      const fetchRes = await fetch(shareData.u);
      if (!fetchRes.ok) throw new Error('Failed to fetch file from storage. The link may have expired.');
      const ciphertextBuf = await fetchRes.arrayBuffer();
      setFileSize(ciphertextBuf.byteLength);
      const plaintext = await decryptBuffer(key, ciphertextBuf, shareData.i);
      const blob = new Blob([plaintext], { type: shareData.m });
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      const a = document.createElement('a');
      a.href = url;
      a.download = shareData.n;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setState('ready');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to decrypt file.';
      setError(msg);
      setState('error');
    }
  };

  const isImg = shareData?.m.startsWith('image/');
  const isVideo = shareData?.m.startsWith('video/');
  const isAudio = shareData?.m.startsWith('audio/');

  const FileIcon2 = () => {
    if (isImg) return <FileImage size={40} style={{ color: '#60a5fa' }} />;
    if (isVideo) return <FileVideo size={40} style={{ color: '#c084fc' }} />;
    if (isAudio) return <FileAudio size={40} style={{ color: '#f472b6' }} />;
    if (shareData?.m.startsWith('text/') || shareData?.m.includes('pdf')) return <FileText size={40} style={{ color: '#fb923c' }} />;
    return <FileIcon size={40} style={{ color: '#94a3b8' }} />;
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: '24px' }}>
      <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '20px', padding: '40px', maxWidth: '440px', width: '100%', boxShadow: '0 24px 80px rgba(0,0,0,0.6)', textAlign: 'center' }}>

        {/* Foldr brand */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '28px' }}>
          <Lock size={16} style={{ color: '#2d7dd2' }} />
          <span style={{ fontWeight: 700, fontSize: '15px', color: '#e6edf3' }}>Foldr</span>
          <span style={{ fontSize: '10px', color: '#7d8590', background: '#1c2128', borderRadius: '6px', padding: '2px 7px', border: '1px solid #30363d' }}>AES-256-GCM</span>
        </div>

        {state === 'loading' && (
          <div style={{ color: '#7d8590', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: '#2d7dd2' }} />
            <span>Parsing share link…</span>
          </div>
        )}

        {state === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
            <AlertTriangle size={40} style={{ color: '#ef4444' }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: '16px', color: '#f0f0f0', marginBottom: '8px' }}>Could not open file</div>
              <div style={{ fontSize: '13px', color: '#7d8590' }}>{error}</div>
            </div>
          </div>
        )}

        {(state === 'ready' || state === 'downloading') && shareData && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '20px', background: '#1c2128', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #30363d' }}>
              <FileIcon2 />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '17px', color: '#e6edf3', marginBottom: '6px', wordBreak: 'break-word' }}>{shareData.n}</div>
              <div style={{ fontSize: '12px', color: '#7d8590' }}>
                {fileSize != null ? formatBytes(fileSize) : shareData.m.split('/')[1]?.toUpperCase() || 'File'}
                {' · '}
                <span style={{ color: '#2d7dd2' }}>🔒 End-to-end encrypted</span>
              </div>
            </div>

            {blobUrl && (isImg || isVideo || isAudio) && (
              <div style={{ width: '100%', borderRadius: '12px', overflow: 'hidden', background: '#0d1117' }}>
                {isImg && <img src={blobUrl} alt={shareData.n} style={{ width: '100%', maxHeight: '260px', objectFit: 'contain' }} />}
                {isVideo && <video src={blobUrl} controls style={{ width: '100%', borderRadius: '12px' }} />}
                {isAudio && <audio src={blobUrl} controls style={{ width: '100%' }} />}
              </div>
            )}

            <button
              onClick={handleDownload}
              disabled={state === 'downloading'}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#2d7dd2', color: '#fff', border: 'none', borderRadius: '12px', padding: '12px 28px', fontSize: '14px', fontWeight: 600, cursor: state === 'downloading' ? 'not-allowed' : 'pointer', opacity: state === 'downloading' ? 0.7 : 1, transition: 'opacity 0.15s' }}
            >
              {state === 'downloading'
                ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Decrypting…</>
                : <><Download size={16} /> {blobUrl ? 'Download Again' : 'Decrypt & Download'}</>
              }
            </button>

            <div style={{ fontSize: '11px', color: '#7d8590', lineHeight: 1.5 }}>
              The decryption key is stored only in this URL — Foldr never sees your file contents.
              This link expires in 7 days.
            </div>
          </div>
        )}

      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
