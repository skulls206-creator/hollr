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
  streamUrl?: string;
}

async function resolveTrack(url: string): Promise<TrackInfo> {
  await ensurePlaydl();

  if (playdl.yt_validate(url) === 'video') {
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

  if (url.includes('soundcloud.com')) {
    const info = await playdl.soundcloud(url) as any;
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

  try {
    const info = await resolveTrack(url);
    res.json(info);
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? 'Failed to resolve track' });
  }
});

// GET /rippd/download?url=... — streams audio with download headers
router.get('/rippd/download', async (req, res) => {
  const { url } = req.query as { url?: string };
  if (!url) return res.status(400).json({ error: 'url is required' });

  try {
    await ensurePlaydl();

    let streamResult: any;
    let filename = 'rippd-audio.mp3';

    if (playdl.yt_validate(url) === 'video') {
      const info = await playdl.video_info(url);
      const title = info.video_details.title ?? 'audio';
      filename = `${title.replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 80)}.mp3`;
      streamResult = await playdl.stream_from_info(info, { quality: 2 });
    } else if (url.includes('soundcloud.com')) {
      const info = await playdl.soundcloud(url) as any;
      filename = `${(info.name ?? 'audio').replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 80)}.mp3`;
      streamResult = await playdl.stream(url, { quality: 2 });
    } else {
      return res.status(400).json({ error: 'Unsupported URL.' });
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
