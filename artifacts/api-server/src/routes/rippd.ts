import { Router } from 'express';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import crypto from 'crypto';

const router = Router();

const TEMP_DIR = join(tmpdir(), 'rippd-downloads');
const FILE_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface DownloadEntry {
  filePath: string;
  filename: string;
  title: string;
  createdAt: number;
}

const downloadTokens = new Map<string, DownloadEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [token, info] of downloadTokens.entries()) {
    if (now - info.createdAt > FILE_TTL_MS) {
      fs.unlink(info.filePath).catch(() => {});
      downloadTokens.delete(token);
    }
  }
}, FILE_TTL_MS);

const ALLOWED_HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com',
  'youtu.be', 'music.youtube.com',
  'soundcloud.com', 'on.soundcloud.com', 'm.soundcloud.com',
]);

function validateUrl(raw: string): URL {
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new Error('Invalid URL format.'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Only http/https URLs are supported.');
  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) throw new Error('Unsupported site. Paste a YouTube or SoundCloud link.');
  return parsed;
}

async function ensureTempDir() {
  await fs.mkdir(TEMP_DIR, { recursive: true });
}

function runYtDlp(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args, {
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || stdout || `yt-dlp exited with code ${code}`));
    });
    proc.on('error', (err) => reject(new Error(`Failed to spawn yt-dlp: ${err.message}`)));
  });
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w\s\-().]/g, '').replace(/\s+/g, '_').slice(0, 100);
}

function parseTitle(raw: string): string {
  const first = raw.trim().split('\n')[0].trim();
  return first.replace(/^after_move:/i, '').trim() || 'audio';
}

async function findOutputFile(fileId: string): Promise<string | null> {
  try {
    const files = await fs.readdir(TEMP_DIR);
    const match = files.find((f) => f.startsWith(fileId));
    if (match) return join(TEMP_DIR, match);
  } catch {}
  return null;
}

// GET /rippd/info?url=...
router.get('/rippd/info', async (req, res) => {
  const { url } = req.query as { url?: string };
  if (!url) { res.status(400).json({ error: 'url is required' }); return; }

  try {
    validateUrl(url);
  } catch (err: any) {
    res.status(400).json({ error: err.message }); return;
  }

  try {
    console.log(`[rippd] info url=${url}`);
    const { stdout } = await runYtDlp(['--dump-json', '--no-playlist', url]);
    const info = JSON.parse(stdout.trim().split('\n')[0]);
    res.json({
      title: info.title || 'Unknown Title',
      artist: info.uploader || info.channel || 'Unknown Artist',
      duration: info.duration ?? 0,
      thumbnail: info.thumbnail ?? null,
      source: (info.extractor_key || info.extractor || '').toLowerCase().includes('soundcloud') ? 'soundcloud' : 'youtube',
    });
  } catch (err: any) {
    console.error('[rippd] info error:', err.message);
    res.status(500).json({ error: err.message.split('\n')[0].slice(0, 300) });
  }
});

// POST /rippd/audio — downloads audio and returns a one-time token
router.post('/rippd/audio', async (req, res) => {
  const { url } = req.body as { url?: string };
  if (!url) { res.status(400).json({ error: 'url is required' }); return; }

  try {
    validateUrl(url);
  } catch (err: any) {
    res.status(400).json({ error: err.message }); return;
  }

  try {
    console.log(`[rippd] download url=${url}`);
    await ensureTempDir();

    const fileId = crypto.randomBytes(16).toString('hex');
    const outputTemplate = join(TEMP_DIR, `${fileId}.%(ext)s`);

    const { stdout } = await runYtDlp([
      '--no-playlist',
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--output', outputTemplate,
      '--print', 'after_move:%(title)s',
      url,
    ]);

    const title = parseTitle(stdout);
    const outputPath = await findOutputFile(fileId);

    if (!outputPath) throw new Error('Audio file not found after download.');

    const token = crypto.randomBytes(24).toString('hex');
    const filename = `${sanitizeFilename(title)}.mp3`;

    downloadTokens.set(token, { filePath: outputPath, filename, title, createdAt: Date.now() });

    res.json({ token, filename, title });
  } catch (err: any) {
    console.error('[rippd] download error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message.split('\n')[0].slice(0, 300) });
  }
});

// GET /rippd/file/:token — serve the downloaded file
router.get('/rippd/file/:token', async (req, res) => {
  const info = downloadTokens.get(req.params.token);
  if (!info) { res.status(404).json({ error: 'File not found or expired. Please rip again.' }); return; }

  if (Date.now() - info.createdAt > FILE_TTL_MS) {
    downloadTokens.delete(req.params.token);
    fs.unlink(info.filePath).catch(() => {});
    res.status(404).json({ error: 'Download link expired. Please rip again.' }); return;
  }

  try {
    await fs.access(info.filePath);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${info.filename}"`);
    res.sendFile(info.filePath, (err) => {
      if (!err) {
        fs.unlink(info.filePath).catch(() => {});
        downloadTokens.delete(req.params.token);
      }
    });
  } catch {
    downloadTokens.delete(req.params.token);
    res.status(404).json({ error: 'File no longer available. Please rip again.' });
  }
});

export default router;
