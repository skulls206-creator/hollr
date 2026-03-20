import { Router } from 'express';
import { musicBot, BOT_USER_ID, BOT_DISPLAY_NAME, BOT_USERNAME } from '../lib/music-bot';
import { broadcast } from '../lib/ws';
import type { MusicState } from '@workspace/api-zod';

const router = Router();

function broadcastMusicState(state: MusicState) {
  broadcast({ type: 'MUSIC_STATE_UPDATE', payload: state });
}

function broadcastBotJoin(channelId: string) {
  broadcast({
    type: 'VOICE_USER_JOINED',
    payload: {
      channelId,
      user: {
        userId: BOT_USER_ID,
        displayName: BOT_DISPLAY_NAME,
        username: BOT_USERNAME,
        avatarUrl: null,
        muted: false,
        deafened: false,
        speaking: false,
        streaming: false,
        hasCamera: false,
        isBot: true,
      },
    },
  });
}

function broadcastBotLeave(channelId: string) {
  broadcast({
    type: 'VOICE_USER_LEFT',
    payload: { channelId, userId: BOT_USER_ID },
  });
}

// GET /voice/:channelId/music/stream — chunked MP3 audio stream
router.get('/voice/:channelId/music/stream', (req, res) => {
  const { channelId } = req.params;
  musicBot.addStreamClient(channelId, res);
});

// GET /voice/:channelId/music/queue
router.get('/voice/:channelId/music/queue', (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: 'Unauthorized' }); return; }
  res.json(musicBot.getState(req.params.channelId));
});

// POST /voice/:channelId/music/join
router.post('/voice/:channelId/music/join', async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: 'Unauthorized' }); return; }
  const { channelId } = req.params;
  try {
    await musicBot.join(channelId, (state) => broadcastMusicState(state));
    broadcastBotJoin(channelId);
    res.json({ ok: true, state: musicBot.getState(channelId) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /voice/:channelId/music/leave
router.post('/voice/:channelId/music/leave', async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: 'Unauthorized' }); return; }
  const { channelId } = req.params;
  try {
    await musicBot.leave(channelId);
    broadcastBotLeave(channelId);
    broadcastMusicState(musicBot.getState(channelId));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /voice/:channelId/music/play
router.post('/voice/:channelId/music/play', async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: 'Unauthorized' }); return; }
  const { channelId } = req.params;
  const { url } = req.body;
  if (!url || typeof url !== 'string') { res.status(400).json({ error: 'url is required' }); return; }

  try {
    const state = musicBot.getState(channelId);
    if (!state.botConnected) {
      await musicBot.join(channelId, (s) => broadcastMusicState(s));
      broadcastBotJoin(channelId);
    }
    const track = await musicBot.play(channelId, url, req.user!.id);
    broadcastMusicState(musicBot.getState(channelId));
    res.json({ ok: true, track, state: musicBot.getState(channelId) });
  } catch (err: any) {
    const message = err.message?.includes('unavailable') || err.message?.includes('private')
      ? 'This video is unavailable or private'
      : err.message?.includes('age') ? 'Age-restricted video'
      : `Could not load track: ${err.message}`;
    res.status(400).json({ error: message });
  }
});

// POST /voice/:channelId/music/pause
router.post('/voice/:channelId/music/pause', (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: 'Unauthorized' }); return; }
  musicBot.pause(req.params.channelId);
  broadcastMusicState(musicBot.getState(req.params.channelId));
  res.json({ ok: true });
});

// POST /voice/:channelId/music/resume
router.post('/voice/:channelId/music/resume', async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    await musicBot.resume(req.params.channelId);
    broadcastMusicState(musicBot.getState(req.params.channelId));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /voice/:channelId/music/skip
router.post('/voice/:channelId/music/skip', async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    await musicBot.skip(req.params.channelId);
    broadcastMusicState(musicBot.getState(req.params.channelId));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /voice/:channelId/music/stop
router.post('/voice/:channelId/music/stop', async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    await musicBot.stop(req.params.channelId);
    broadcastMusicState(musicBot.getState(req.params.channelId));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
