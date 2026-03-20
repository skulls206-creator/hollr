import { useState, useRef, useEffect, useCallback } from 'react';
import { PlusCircle, Smile, Music2, Slash } from 'lucide-react';
import { useSendMessage, useRequestUploadUrl, useListServerMembers, getListServerMembersQueryKey } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { cn, formatBytes } from '@/lib/utils';
import { useAppStore } from '@/store/use-app-store';
import { EmojiPickerPopover } from './EmojiPickerPopover';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';

const BASE = import.meta.env.BASE_URL;

interface SlashCommand {
  name: string;
  description: string;
  hasArg?: boolean;
  argPlaceholder?: string;
  requiresVoice?: boolean;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'play',   description: 'Play a song (SoundCloud URL or search terms)', hasArg: true, argPlaceholder: '<song name or soundcloud-url>', requiresVoice: true },
  { name: 'pause',  description: 'Pause music playback', requiresVoice: true },
  { name: 'resume', description: 'Resume music playback', requiresVoice: true },
  { name: 'skip',   description: 'Skip the current track', requiresVoice: true },
  { name: 'stop',   description: 'Stop music and clear queue', requiresVoice: true },
  { name: 'queue',  description: 'Show the current music queue', requiresVoice: true },
  { name: 'join',   description: 'Add music bot to your voice channel', requiresVoice: true },
  { name: 'leave',  description: 'Remove music bot from voice channel', requiresVoice: true },
];

async function callMusicApi(voiceChannelId: string, endpoint: string, method = 'POST', body?: object) {
  const res = await fetch(`${BASE}api/voice/${voiceChannelId}/music/${endpoint}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({}));
}

export function MessageComposer({ channelId }: { channelId: string }) {
  const [content, setContent] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number>(0);
  const [selectedMentionIdx, setSelectedMentionIdx] = useState(0);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [selectedSlashIdx, setSelectedSlashIdx] = useState(0);
  const [cmdLoading, setCmdLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const { activeServerId, pendingMention, clearPendingMention, voiceConnection } = useAppStore();
  const voiceChannelId = voiceConnection.channelId;

  useEffect(() => {
    if (!pendingMention) return;
    setContent(prev => {
      const base = prev.trimEnd();
      return base ? `${base} @${pendingMention} ` : `@${pendingMention} `;
    });
    clearPendingMention();
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [pendingMention]);

  const { mutate: sendMessage, isPending: isSending } = useSendMessage();
  const { mutateAsync: requestUpload } = useRequestUploadUrl();
  const { toast } = useToast();

  const { data: members = [] } = useListServerMembers(activeServerId || '', {
    query: { queryKey: getListServerMembersQueryKey(activeServerId || ''), enabled: !!activeServerId },
  });

  const mentionMatches = mentionQuery !== null
    ? members
        .filter(m =>
          (m.user.displayName || m.user.username).toLowerCase().includes(mentionQuery.toLowerCase())
        )
        .slice(0, 8)
    : [];

  // Slash command filtering
  const slashMatches = slashQuery !== null
    ? SLASH_COMMANDS.filter(c => c.name.startsWith(slashQuery.toLowerCase()))
    : [];

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);

    const cursor = e.target.selectionStart || 0;
    const textBefore = val.slice(0, cursor);

    // Slash command: detect /command at start of input
    const slashMatch = val.match(/^\/(\w*)$/);
    if (slashMatch && cursor <= val.length) {
      setSlashQuery(slashMatch[1]);
      setSelectedSlashIdx(0);
      setMentionQuery(null);
      return;
    } else {
      setSlashQuery(null);
    }

    // @mention
    const mentionMatch = textBefore.match(/@(\w*)$/);
    if (mentionMatch) {
      setMentionQuery(mentionMatch[1]);
      setMentionStart(cursor - mentionMatch[0].length);
      setSelectedMentionIdx(0);
    } else {
      setMentionQuery(null);
    }
  }, []);

  const insertMention = useCallback((member: any) => {
    const name = member.user.displayName || member.user.username;
    const cursor = textareaRef.current?.selectionStart || 0;
    const before = content.slice(0, mentionStart);
    const after = content.slice(cursor);
    const newContent = `${before}@${name} ${after}`;
    setContent(newContent);
    setMentionQuery(null);
    setTimeout(() => {
      const pos = mentionStart + name.length + 2;
      textareaRef.current?.setSelectionRange(pos, pos);
      textareaRef.current?.focus();
    }, 0);
  }, [content, mentionStart]);

  const selectSlashCommand = useCallback((cmd: SlashCommand) => {
    if (cmd.hasArg) {
      setContent(`/${cmd.name} `);
      setSlashQuery(null);
      setTimeout(() => textareaRef.current?.focus(), 0);
    } else {
      setContent(`/${cmd.name}`);
      setSlashQuery(null);
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, []);

  const executeSlashCommand = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    const [cmdName, ...argParts] = trimmed.slice(1).split(/\s+/);
    const arg = argParts.join(' ').trim();

    if (!voiceChannelId) {
      toast({ title: 'Join a voice channel first', description: 'Music commands require an active voice connection', variant: 'destructive' });
      return;
    }

    const run = async () => {
      switch (cmdName) {
        case 'join':   return callMusicApi(voiceChannelId, 'join');
        case 'leave':  return callMusicApi(voiceChannelId, 'leave');
        case 'pause':  return callMusicApi(voiceChannelId, 'pause');
        case 'resume': return callMusicApi(voiceChannelId, 'resume');
        case 'skip':   return callMusicApi(voiceChannelId, 'skip');
        case 'stop':   return callMusicApi(voiceChannelId, 'stop');
        case 'play': {
          if (!arg) {
            toast({ title: 'Usage: /play <song name or soundcloud-url>', variant: 'destructive' });
            return null;
          }
          return callMusicApi(voiceChannelId, 'play', 'POST', { query: arg });
        }
        case 'queue': {
          const state = await callMusicApi(voiceChannelId, 'queue', 'GET');
          const queueLen = state?.queue?.length ?? 0;
          const current = state?.currentTrack?.title;
          toast({
            title: current ? `Now playing: ${current}` : 'No track playing',
            description: queueLen > 0 ? `${queueLen} track(s) in queue` : 'Queue is empty',
          });
          return state;
        }
        default:
          toast({ title: `Unknown command: /${cmdName}`, variant: 'destructive' });
          return null;
      }
    };

    setCmdLoading(true);
    try {
      const result = await run();
      if (result?.error) {
        toast({ title: `/${cmdName} failed`, description: result.error, variant: 'destructive' });
      } else if (result !== null && cmdName !== 'queue') {
        toast({ title: `/${cmdName} executed` });
      }
    } catch {
      toast({ title: 'Command failed', variant: 'destructive' });
    } finally {
      setCmdLoading(false);
    }
  }, [voiceChannelId, toast]);

  const handleSend = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed && !isUploading) return;

    // Slash command interception
    if (trimmed.startsWith('/')) {
      const [cmdName] = trimmed.slice(1).split(/\s+/);
      const isKnown = SLASH_COMMANDS.some(c => c.name === cmdName);
      if (isKnown) {
        await executeSlashCommand(trimmed);
        setContent('');
        return;
      }
    }

    sendMessage({ channelId, data: { content: trimmed } }, {
      onSuccess: () => setContent(''),
      onError: () => toast({ title: "Failed to send", variant: "destructive" })
    });
  }, [content, isUploading, channelId, sendMessage, toast, executeSlashCommand]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Slash command palette navigation
    if (slashQuery !== null && slashMatches.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedSlashIdx(i => (i + 1) % slashMatches.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedSlashIdx(i => (i - 1 + slashMatches.length) % slashMatches.length); return; }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        selectSlashCommand(slashMatches[selectedSlashIdx]);
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); setSlashQuery(null); return; }
    }
    // @mention navigation
    if (mentionQuery !== null && mentionMatches.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedMentionIdx(i => (i + 1) % mentionMatches.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedMentionIdx(i => (i - 1 + mentionMatches.length) % mentionMatches.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionMatches[selectedMentionIdx]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setMentionQuery(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 100MB", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);

    try {
      const { uploadURL, objectPath } = await requestUpload({
        data: { name: file.name, size: file.size, contentType: file.type }
      });
      setUploadProgress(40);

      const uploadRes = await fetch(uploadURL, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type }
      });

      if (!uploadRes.ok) throw new Error("Upload failed");
      setUploadProgress(100);

      sendMessage({
        channelId,
        data: {
          content: content.trim() || `Uploaded ${file.name}`,
          attachments: [{ objectPath, name: file.name, contentType: file.type, size: file.size }]
        }
      }, {
        onSuccess: () => {
          setContent('');
          toast({ title: "File uploaded successfully" });
        }
      });

    } catch (err: any) {
      toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="px-4 pb-6 pt-2 w-full bg-[#313338] relative">
      {/* Slash command palette */}
      {slashQuery !== null && slashMatches.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 mb-2 bg-[#2B2D31] border border-border/20 rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="px-3 py-1.5 border-b border-border/10 flex items-center gap-2">
            <Slash size={10} className="text-muted-foreground" />
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Commands</p>
          </div>
          {slashMatches.map((cmd, i) => (
            <button
              key={cmd.name}
              onMouseDown={(e) => { e.preventDefault(); selectSlashCommand(cmd); }}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                i === selectedSlashIdx ? 'bg-primary/20' : 'hover:bg-secondary/50'
              )}
            >
              <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center shrink-0">
                <Music2 size={12} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-foreground">/{cmd.name}</span>
                  {cmd.argPlaceholder && (
                    <span className="text-xs text-primary/70">{cmd.argPlaceholder}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">{cmd.description}</p>
              </div>
              {cmd.requiresVoice && !voiceChannelId && (
                <span className="text-[10px] text-yellow-400/80 shrink-0">need voice</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* @mention autocomplete */}
      {mentionQuery !== null && mentionMatches.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 mb-2 bg-[#2B2D31] border border-border/20 rounded-xl shadow-2xl overflow-hidden max-h-64 overflow-y-auto z-50">
          <div className="px-3 py-1.5 border-b border-border/10">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Members</p>
          </div>
          {mentionMatches.map((m, i) => (
            <button
              key={m.userId}
              onClick={() => insertMention(m)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors',
                i === selectedMentionIdx ? 'bg-primary/20 text-foreground' : 'hover:bg-secondary/50 text-foreground'
              )}
            >
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarImage src={m.user.avatarUrl || undefined} />
                <AvatarFallback className="bg-primary text-white text-[10px]">
                  {getInitials(m.user.displayName || m.user.username)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{m.user.displayName || m.user.username}</p>
                <p className="text-xs text-muted-foreground truncate">@{m.user.username}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="bg-[#383A40] rounded-lg flex items-center px-4 py-2 relative overflow-visible shadow-sm focus-within:ring-1 focus-within:ring-primary/50">

        {isUploading && (
          <div className="absolute top-0 left-0 h-1 bg-primary transition-all duration-300 ease-out rounded-t-lg" style={{ width: `${uploadProgress}%` }} />
        )}

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="p-1 mr-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-full transition-colors shrink-0 disabled:opacity-50"
        >
          <PlusCircle size={22} className="fill-muted-foreground/20" />
        </button>
        <input
          type="file"
          className="hidden"
          ref={fileInputRef}
          onChange={handleFileUpload}
        />

        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Message… (type / for commands)"
          className="flex-1 bg-transparent border-0 focus:ring-0 resize-none text-foreground placeholder:text-muted-foreground py-2 h-[44px] min-h-[44px] max-h-[50vh] overflow-y-auto leading-normal"
          rows={1}
        />

        <div className="flex items-center gap-1 ml-2 shrink-0 relative">
          <button
            ref={emojiButtonRef}
            onClick={() => setEmojiPickerOpen(v => !v)}
            className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
            title="Emoji picker"
          >
            <Smile size={22} />
          </button>
          {emojiPickerOpen && (
            <EmojiPickerPopover
              onEmojiClick={(emoji) => {
                setContent(c => c + emoji);
                textareaRef.current?.focus();
              }}
              onClose={() => setEmojiPickerOpen(false)}
              anchorRef={emojiButtonRef as any}
            />
          )}
        </div>
      </div>
    </div>
  );
}
