import { useState, useRef, useEffect, useCallback } from 'react';
import { PlusCircle, Smile, Music2, Slash, ArrowUp, Ghost, X, ChevronDown } from 'lucide-react';
import { useSendMessage, useRequestUploadUrl, useListServerMembers, getListServerMembersQueryKey, getListMessagesQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { cn, formatBytes } from '@/lib/utils';
import { useAppStore } from '@/store/use-app-store';
import { EmojiPickerPopover } from './EmojiPickerPopover';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { enqueueMessage } from '@/lib/bg-sync';
import { ghostEncrypt } from '@/lib/ghost-crypto';

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
  const [ghostMode, setGhostMode] = useState(false);
  const [ghostTarget, setGhostTarget] = useState<{ userId: string; displayName: string } | null>(null);
  const [ghostTargetPickerOpen, setGhostTargetPickerOpen] = useState(false);
  const [ghostTargetQuery, setGhostTargetQuery] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const { activeServerId, pendingMention, clearPendingMention, pendingCommand, clearPendingCommand, voiceConnection } = useAppStore();
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

  useEffect(() => {
    if (!pendingCommand) return;
    setContent(pendingCommand);
    clearPendingCommand();
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [pendingCommand]);

  const qc = useQueryClient();
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

  const slashMatches = slashQuery !== null
    ? SLASH_COMMANDS.filter(c => c.name.startsWith(slashQuery.toLowerCase()))
    : [];

  const ghostTargetMatches = ghostTargetPickerOpen
    ? members.filter(m =>
        (m.user.displayName || m.user.username).toLowerCase().includes(ghostTargetQuery.toLowerCase())
      ).slice(0, 8)
    : [];

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [content, resizeTextarea]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);

    const cursor = e.target.selectionStart || 0;
    const textBefore = val.slice(0, cursor);

    const slashMatch = val.match(/^\/(\w*)$/);
    if (slashMatch && cursor <= val.length) {
      setSlashQuery(slashMatch[1]);
      setSelectedSlashIdx(0);
      setMentionQuery(null);
      return;
    } else {
      setSlashQuery(null);
    }

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

    if (trimmed.startsWith('/')) {
      const [cmdName] = trimmed.slice(1).split(/\s+/);
      const isKnown = SLASH_COMMANDS.some(c => c.name === cmdName);
      if (isKnown) {
        await executeSlashCommand(trimmed);
        setContent('');
        if (textareaRef.current) textareaRef.current.style.height = '46px';
        return;
      }
    }

    if (ghostMode) {
      if (!ghostTarget) {
        toast({ title: 'Choose a recipient', description: 'Select who this ghost message is for', variant: 'destructive' });
        return;
      }
      try {
        const { ciphertext, keyBase64, iv } = await ghostEncrypt(trimmed);
        const secretRes = await fetch(`${BASE}api/secrets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ ciphertext, iv, contextType: 'channel', contextId: channelId, targetUserId: ghostTarget.userId }),
        });
        if (!secretRes.ok) throw new Error('Failed to store ghost message');
        const { id: secretId } = await secretRes.json() as { id: string };
        sendMessage({ channelId, data: { content: '', metadata: { ghost: true, secretId, keyBase64, targetUserId: ghostTarget.userId } } }, {
          onSuccess: (newMsg) => {
            setContent('');
            setGhostTarget(null);
            setGhostMode(false);
            if (textareaRef.current) textareaRef.current.style.height = '46px';
            qc.setQueryData<unknown[]>(getListMessagesQueryKey(channelId), (old = []) => {
              if ((old as Array<{ id: string }>).some(m => m.id === newMsg.id)) return old;
              return [...old, newMsg];
            });
          },
          onError: () => toast({ title: 'Failed to send ghost message', variant: 'destructive' }),
        });
      } catch {
        toast({ title: 'Failed to send ghost message', variant: 'destructive' });
      }
      return;
    }

    sendMessage({ channelId, data: { content: trimmed } }, {
      onSuccess: (newMsg) => {
        setContent('');
        if (textareaRef.current) textareaRef.current.style.height = '46px';
        qc.setQueryData<any[]>(getListMessagesQueryKey(channelId), (old = []) => {
          if (old.some((m: any) => m.id === newMsg.id)) return old;
          return [...old, newMsg];
        });
      },
      onError: () => {
        enqueueMessage({ channelId, content: trimmed });
        toast({ title: "You're offline — message queued", description: "It will send automatically when you reconnect.", variant: "destructive" });
        setContent('');
        if (textareaRef.current) textareaRef.current.style.height = '34px';
      },
    });
  }, [content, isUploading, channelId, sendMessage, toast, executeSlashCommand, ghostMode, ghostTarget]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
        onSuccess: (newMsg) => {
          setContent('');
          toast({ title: "File uploaded successfully" });
          qc.setQueryData<any[]>(getListMessagesQueryKey(channelId), (old = []) => {
            if (old.some((m: any) => m.id === newMsg.id)) return old;
            return [...old, newMsg];
          });
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

  const hasContent = !!content.trim();
  const canSendGhost = ghostMode ? (hasContent && !!ghostTarget) : hasContent;

  return (
    <div className="px-3 pb-3 pt-1 w-full relative">
      {/* Ghost mode banner */}
      {ghostMode && (
        <div className="mb-1.5 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-[12px] text-primary font-medium select-none">
          <div className="flex items-center gap-2 flex-wrap">
            <Ghost size={13} />
            <span className="opacity-80">Ghost for:</span>
            {/* Target picker trigger */}
            <button
              type="button"
              onClick={() => { setGhostTargetPickerOpen(v => !v); setGhostTargetQuery(''); }}
              className={cn(
                'flex items-center gap-1.5 px-2 py-0.5 rounded-full border transition-colors',
                ghostTarget
                  ? 'bg-primary/20 border-primary/40 text-primary'
                  : 'border-primary/30 text-primary/60 hover:bg-primary/10'
              )}
            >
              {ghostTarget ? (
                <>
                  <span className="font-semibold">@{ghostTarget.displayName}</span>
                  <X
                    size={11}
                    className="opacity-60 hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); setGhostTarget(null); }}
                  />
                </>
              ) : (
                <>
                  <span>Pick someone…</span>
                  <ChevronDown size={11} />
                </>
              )}
            </button>
            <span className="ml-auto opacity-60 text-[11px]">self-destructs after reveal</span>
          </div>

          {/* Target member picker dropdown */}
          {ghostTargetPickerOpen && (
            <div className="mt-2 bg-surface-1 border border-border/30 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
              <div className="px-2 pt-2 pb-1">
                <input
                  autoFocus
                  type="text"
                  placeholder="Search members…"
                  value={ghostTargetQuery}
                  onChange={e => setGhostTargetQuery(e.target.value)}
                  className="w-full bg-secondary border border-border/20 rounded-lg px-2.5 py-1 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>
              {ghostTargetMatches.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-muted-foreground/60">No members found</div>
              ) : (
                ghostTargetMatches.map((m) => (
                  <button
                    key={m.userId}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setGhostTarget({ userId: m.userId, displayName: m.user.displayName || m.user.username });
                      setGhostTargetPickerOpen(false);
                      setGhostTargetQuery('');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-secondary/50 transition-colors"
                  >
                    <Avatar className="h-6 w-6 shrink-0">
                      <AvatarImage src={m.user.avatarUrl || undefined} />
                      <AvatarFallback className="bg-primary text-white text-[9px]">
                        {getInitials(m.user.displayName || m.user.username)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-foreground truncate">{m.user.displayName || m.user.username}</p>
                      <p className="text-[10px] text-muted-foreground truncate">@{m.user.username}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Slash command palette */}
      {slashQuery !== null && slashMatches.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 mb-2 bg-surface-1 border border-border/20 rounded-2xl shadow-2xl overflow-hidden z-50">
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
              <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
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
        <div className="absolute bottom-full left-3 right-3 mb-2 bg-surface-1 border border-border/20 rounded-2xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto z-50">
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

      {/* Composer pill */}
      <div className="relative flex items-center gap-2">

        {/* Attach button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="shrink-0 p-1.5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          title="Attach file"
        >
          <PlusCircle size={20} className="fill-muted-foreground/10" />
        </button>
        <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />

        {/* Input pill */}
        <div
          className={cn(
            'relative flex-1 flex items-center bg-secondary border border-border/30 rounded-[22px] px-4 py-0 shadow-sm transition-shadow cursor-text',
            'focus-within:ring-1 focus-within:ring-primary/40',
          )}
          onClick={() => textareaRef.current?.focus()}
        >
          {isUploading && (
            <div
              className="absolute top-0 left-0 h-0.5 bg-primary transition-all duration-300 rounded-t-full"
              style={{ width: `${uploadProgress}%` }}
            />
          )}

          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent border-0 focus:ring-0 resize-none text-foreground py-2.5 min-h-[46px] max-h-[160px] overflow-y-auto leading-normal text-[15px]"
            rows={1}
            style={{ height: '46px' }}
            data-ctx-suppress
          />

          {/* Emoji button inside pill */}
          <div className="relative flex items-center shrink-0">
            <button
              ref={emojiButtonRef}
              onClick={() => setEmojiPickerOpen(v => !v)}
              className="p-1 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              title="Emoji picker"
            >
              <Smile size={19} />
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

        {/* Ghost mode toggle */}
        <button
          onClick={() => {
            const next = !ghostMode;
            setGhostMode(next);
            if (!next) { setGhostTarget(null); setGhostTargetPickerOpen(false); }
          }}
          title={ghostMode ? 'Ghost mode on — click to disable' : 'Send as ghost message'}
          className={cn(
            'shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150',
            ghostMode
              ? 'bg-primary/20 text-primary ring-1 ring-primary/40'
              : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary'
          )}
        >
          <Ghost size={17} />
        </button>

        {/* Send button — filled circle when content is ready */}
        <button
          onClick={handleSend}
          disabled={!canSendGhost || isSending || cmdLoading}
          title={ghostMode && !ghostTarget ? 'Pick a recipient first' : 'Send message'}
          className={cn(
            'shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150',
            canSendGhost
              ? ghostMode
                ? 'bg-primary/80 text-primary-foreground shadow-md hover:bg-primary/70 active:scale-95'
                : 'bg-primary text-primary-foreground shadow-md hover:bg-primary/90 active:scale-95'
              : 'bg-muted/50 text-muted-foreground/40 cursor-not-allowed'
          )}
        >
          {ghostMode ? <Ghost size={17} strokeWidth={2} /> : <ArrowUp size={18} strokeWidth={2.5} />}
        </button>
      </div>
    </div>
  );
}
