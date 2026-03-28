import { Router } from 'express';
import playdl from 'play-dl';
import { ensurePlaydl } from '../lib/music-bot';

const router = Router();

interface TrackInfo {
  title: string;
  artist: string;
  duration: number;
  thumbnail: string | null;
  source: 'youtube' | 'soundcloud' | 'unknown';
}

/**
 * Extract a YouTube video ID from any YouTube URL variant:
 *   youtube.com/watch?v=ID, m.youtube.com/watch?v=ID, youtu.be/ID,
 *   youtube.com/shorts/ID, youtube.com/embed/ID, music.youtube.com/watch?v=ID
 * Returns null if not a YouTube URL or no ID found.
 */
function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');

    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0];
      return id || null;
    }

    if (host === 'youtube.com' || host === 'music.youtube.com') {
      // /watch?v=
      const v = u.searchParams.get('v');
      if (v) return v;
      // /shorts/ID or /embed/ID
      const m = u.pathname.match(/\/(?:shorts|embed|v)\/([a-zA-Z0-9_-]{11})/);
      if (m) return m[1];
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Normalize any YouTube URL to a clean watch URL that play-dl accepts.
 * Returns the original URL unchanged if it's not YouTube.
 */
function normalizeUrl(raw: string): string {
  const ytId = extractYouTubeId(raw);
  if (ytId) return `https://www.youtube.com/watch?v=${ytId}`;
  return raw;
}

function isYouTubeUrl(raw: string): boolean {
  return extractYouTubeId(raw) !== null;
}

async function resolveTrack(rawUrl: string): Promise<TrackInfo> {
  await ensurePlaydl();
  const url = normalizeUrl(rawUrl);

  if (isYouTubeUrl(rawUrl)) {
    const info = await playdl.video_info(url);
    const details = info.video_details;
    return {
      title: details.title ?? 'Unknown Title',
      artist: details.channel?.name ?? 'Unknown Artist',
      duration: details.durationInSec ?? 0,
      thumbnail: details.thumbnails?.[details.thumbnails.length - 1]?.url ?? null,
      source: 'youtube',
    };
  }

  if (rawUrl.includes('soundcloud.com')) {
    const info = await playdl.soundcloud(rawUrl) as any;
    return {
      title: info.name ?? 'Unknown Title',
      artist: info.user?.name ?? 'Unknown Artist',
      duration: Math.floor((info.durationInMs ?? 0) / 1000),
      thumbnail: info.thumbnail ?? null,
      source: 'soundcloud',
    };
  }

  throw new Error('Unsupported URL. Paste a YouTube or SoundCloud link.');
}

// GET /rippd/info?url=...
router.get('/rippd/info', async (req, res) => {
  const { url } = req.query as { url?: string };
  if (!url) return res.status(400).json({ error: 'url is required' });

  const normalized = normalizeUrl(url);
  const isYt = isYouTubeUrl(url);
  console.log(`[rippd] info raw=${url} normalized=${normalized} isYt=${isYt}`);

  try {
    const info = await resolveTrack(url);
    res.json(info);
  } catch (err: any) {
    console.error('[rippd] info error:', err?.message, err?.stack?.split('\n')[1]);
    res.status(400).json({ error: err.message ?? 'Failed to resolve track' });
  }
});

// GET /rippd/download?url=... — streams audio with download headers
router.get('/rippd/download', async (req, res) => {
  const { url: rawUrl } = req.query as { url?: string };
  if (!rawUrl) return res.status(400).json({ error: 'url is required' });

  try {
    await ensurePlaydl();
    const url = normalizeUrl(rawUrl);

    let streamResult: any;
    let filename = 'rippd-audio.mp3';

    if (isYouTubeUrl(rawUrl)) {
      const info = await playdl.video_info(url);
      const title = info.video_details.title ?? 'audio';
      filename = `${title.replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 80)}.mp3`;
      streamResult = await playdl.stream_from_info(info, { quality: 2 });
    } else if (rawUrl.includes('soundcloud.com')) {
      const info = await playdl.soundcloud(rawUrl) as any;
      filename = `${(info.name ?? 'audio').replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 80)}.mp3`;
      streamResult = await playdl.stream(rawUrl, { quality: 2 });
    } else {
      return res.status(400).json({ error: 'Unsupported URL. Paste a YouTube or SoundCloud link.' });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');

    const nodeStream = streamResult.stream;
    nodeStream.pipe(res);
    nodeStream.on('error', () => res.end());
    req.on('close', () => { try { nodeStream.destroy(); } catch {} });
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(400).json({ error: err.message ?? 'Failed to stream audio' });
    }
  }
});

export default router;
