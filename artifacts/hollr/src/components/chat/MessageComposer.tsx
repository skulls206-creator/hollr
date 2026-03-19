import { useState, useRef, useEffect, useCallback } from 'react';
import { PlusCircle, Smile, FileText, Download } from 'lucide-react';
import { useSendMessage, useRequestUploadUrl, useListServerMembers, getListServerMembersQueryKey } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { cn, formatBytes } from '@/lib/utils';
import { useAppStore } from '@/store/use-app-store';
import { EmojiPickerPopover } from './EmojiPickerPopover';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';

export function MessageComposer({ channelId }: { channelId: string }) {
  const [content, setContent] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number>(0);
  const [selectedMentionIdx, setSelectedMentionIdx] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const { activeServerId, pendingMention, clearPendingMention } = useAppStore();

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

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);

    const cursor = e.target.selectionStart || 0;
    const textBefore = val.slice(0, cursor);
    const match = textBefore.match(/@(\w*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionStart(cursor - match[0].length);
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

  const handleSend = () => {
    if (!content.trim() && !isUploading) return;
    sendMessage({ channelId, data: { content: content.trim() } }, {
      onSuccess: () => setContent(''),
      onError: () => toast({ title: "Failed to send", variant: "destructive" })
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
          placeholder=""
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
