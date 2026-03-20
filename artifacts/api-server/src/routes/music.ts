import { Router } from 'express';
import { musicBot, BOT_USER_ID, BOT_DISPLAY_NAME, BOT_USERNAME } from '../lib/music-bot';
import { broadcast, addBotToVoiceRoom, removeBotFromVoiceRoom } from '../lib/ws';
import type { MusicState } from '@workspace/api-zod';

const router = Router();

function broadcastMusicState(state: MusicState) {
  broadcast({ type: 'MUSIC_STATE_UPDATE', payload: state });
}

const BOT_PARTICIPANT = {
  userId: BOT_USER_ID,
  displayName: BOT_DISPLAY_NAME,
  username: BOT_USERNAME,
  avatarUrl: null as null,
  isBot: true as const,
};

function broadcastBotJoin(channelId: string) {
  // Keep the bot in voiceRooms so VOICE_ROOMS_SNAPSHOT includes it on reconnect
  addBotToVoiceRoom(channelId, BOT_PARTICIPANT);
  broadcast({
    type: 'VOICE_USER_JOINED',
    payload: {
      channelId,
      user: {
        ...BOT_PARTICIPANT,
        muted: false,
        deafened: false,
        speaking: false,
        streaming: false,
        hasCamera: false,
      },
    },
  });
}

function broadcastBotLeave(channelId: string) {
  removeBotFromVoiceRoom(channelId, BOT_USER_ID);
  broadcast({
    type: 'VOICE_USER_LEFT',
    payload: { channelId, userId: BOT_USER_ID },
  });
}

/** Ensure the bot has a stateChange listener registered for this channel.
 *  Idempotent — safe to call multiple times. */
async function ensureBotJoined(channelId: string): Promise<boolean> {
  const state = musicBot.getState(channelId);
  if (!state.botConnected) {
    await musicBot.join(channelId, (s) => broadcastMusicState(s));
    broadcastBotJoin(channelId);
    return true; // newly joined
  }
  return false;
}

// GET /voice/:channelId/music/stream — chunked MP3 audio stream (no auth required)
router.get('/voice/:channelId/music/stream', (req, res) => {
  const { channelId } = req.params;
  console.log(`[music-route] New stream client for channel ${channelId}`);
  musicBot.addStreamClient(channelId, res);
});

// GET /voice/:channelId/music/state — current music state
router.get('/voice/:channelId/music/state', (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: 'Unauthorized' }); return; }
  res.json(musicBot.getState(req.params.channelId));
});

// GET /voice/:channelId/music/queue — alias for state
router.get('/voice/:channelId/music/queue', (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: 'Unauthorized' }); return; }
  res.json(musicBot.getState(req.params.channelId));
});

// POST /voice/:channelId/music/join
router.post('/voice/:channelId/music/join', async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: 'Unauthorized' }); return; }
  const { channelId } = req.params;
  try {
    await musicBot.join(channelId, (s) => broadcastMusicState(s));
    broadcastBotJoin(channelId);
    res.json({ ok: true, state: musicBot.getState(channelId) });
  } catch (err: any) {
    console.error('[music-route] join error:', err.message);
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
    console.error('[music-route] leave error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /voice/:channelId/music/play
router.post('/voice/:channelId/music/play', async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: 'Unauthorized' }); return; }
  const { channelId } = req.params;
  // Accept 'url' (legacy) or 'query' (search term / any URL)
  const input: string = req.body.query ?? req.body.url ?? '';

  if (!input || typeof input !== 'string') {
    res.status(400).json({ error: 'query or url is required' });
    return;
  }

  try {
    await ensureBotJoined(channelId);
    const track = await musicBot.play(channelId, input.trim(), req.user!.id);
    broadcastMusicState(musicBot.getState(channelId));
    res.json({ ok: true, track, state: musicBot.getState(channelId) });
  } catch (err: any) {
    console.error('[music-route] play error:', err.message);
    res.status(400).json({ error: err.message ?? 'Could not load track' });
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
    console.error('[music-route] resume error:', err.message);
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
    console.error('[music-route] skip error:', err.message);
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
    console.error('[music-route] stop error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
