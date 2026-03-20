import { useEffect, useRef, useState } from 'react';
import { useListDmMessages, useSendDmMessage } from '@workspace/api-client-react';
import { format } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials, formatBytes } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Smile, Menu, FileText, Download, SendHorizonal } from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';

export function DmChatArea({ threadId, recipientName, recipientAvatar }: {
  threadId: string;
  recipientName: string;
  recipientAvatar?: string | null;
}) {
  const { data: messages = [], isLoading } = useListDmMessages(threadId);
  const { mutate: sendMessage } = useSendDmMessage();
  const { toggleMobileSidebar, voicePanelHeight } = useAppStore();
  const { toast } = useToast();
  const [content, setContent] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resizeTextarea = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!content.trim()) return;
    sendMessage({ threadId, data: { content: content.trim() } }, {
      onSuccess: () => {
        setContent('');
        // Reset textarea height after clearing
        if (textareaRef.current) {
          textareaRef.current.style.height = '44px';
        }
      },
      onError: () => toast({ title: 'Failed to send', variant: 'destructive' }),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // API returns messages in ascending (oldest-first) order — no reverse needed
  const sorted = messages;

  return (
    <div className="flex-1 bg-[#313338] flex flex-col h-full min-w-0">
      {/* Header */}
      <div className="h-12 border-b border-border/10 flex items-center px-4 shrink-0 shadow-sm z-10 bg-[#313338]">
        <button
          onClick={toggleMobileSidebar}
          className="md:hidden mr-3 text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="Open sidebar"
        >
          <Menu size={22} />
        </button>
        <Avatar className="h-7 w-7 mr-2.5">
          <AvatarImage src={recipientAvatar || undefined} />
          <AvatarFallback className="bg-primary text-white text-xs">{getInitials(recipientName)}</AvatarFallback>
        </Avatar>
        <h2 className="font-bold text-foreground text-[15px]">{recipientName}</h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto flex flex-col p-4 gap-2 no-scrollbar">
        <div className="mt-auto" />

        {sorted.length === 0 && !isLoading && (
          <div className="text-center py-10">
            <Avatar className="h-20 w-20 mx-auto mb-4">
              <AvatarImage src={recipientAvatar || undefined} />
              <AvatarFallback className="bg-primary text-white text-2xl">{getInitials(recipientName)}</AvatarFallback>
            </Avatar>
            <h2 className="text-xl font-bold text-foreground">This is the beginning of your DM with {recipientName}</h2>
            <p className="text-muted-foreground mt-1 text-sm">Say hi!</p>
          </div>
        )}

        {sorted.map((msg, index) => {
          const showHeader = index === 0 || sorted[index - 1].authorId !== msg.authorId ||
            (new Date(msg.createdAt).getTime() - new Date(sorted[index - 1].createdAt).getTime() > 5 * 60000);

          return (
            <div key={msg.id} className={`group flex ${showHeader ? 'mt-4' : 'mt-0.5'} hover:bg-black/5 p-1 -mx-4 px-4 rounded-sm`}>
              {showHeader ? (
                <Avatar className="h-10 w-10 mr-4 shrink-0">
                  <AvatarImage src={msg.author.avatarUrl || undefined} />
                  <AvatarFallback className="bg-primary text-white">
                    {getInitials(msg.author.displayName || msg.author.username)}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <div className="w-14 shrink-0 text-right pr-4 text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 flex items-center justify-end">
                  {format(new Date(msg.createdAt), 'h:mm a')}
                </div>
              )}
              <div className="flex flex-col min-w-0 flex-1">
                {showHeader && (
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="font-medium text-base text-indigo-400">{msg.author.displayName || msg.author.username}</span>
                    <span className="text-xs text-muted-foreground">{format(new Date(msg.createdAt), 'MM/dd/yyyy h:mm a')}</span>
                  </div>
                )}
                <div className="text-foreground text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                  {msg.content}
                </div>
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="flex flex-col gap-2 mt-2">
                    {msg.attachments.map((att: any) => {
                      const isImage = att.contentType.startsWith('image/');
                      const url = `/api/storage${att.objectPath}`;
                      if (isImage) {
                        return (
                          <a key={att.id} href={url} target="_blank" rel="noopener noreferrer"
                            className="inline-block max-w-[400px] rounded-xl overflow-hidden border border-border/50 bg-black/20 cursor-zoom-in hover:opacity-90 transition-opacity">
                            <img src={url} alt={att.name} className="block max-w-full max-h-[350px] object-contain" loading="lazy" />
                          </a>
                        );
                      }
                      return (
                        <a key={att.id} href={url} download target="_blank" rel="noreferrer"
                          className="flex items-center gap-3 p-3 bg-secondary border border-border/50 rounded-lg hover:bg-secondary/80 transition-colors w-72">
                          <div className="bg-primary/20 p-2 rounded-md"><FileText className="text-primary" size={24} /></div>
                          <div className="flex flex-col overflow-hidden">
                            <span className="text-sm font-medium text-primary hover:underline truncate">{att.name}</span>
                            <span className="text-xs text-muted-foreground">{formatBytes(att.size)}</span>
                          </div>
                          <Download className="ml-auto text-muted-foreground hover:text-foreground" size={18} />
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="px-4 pb-6 pt-2 bg-[#313338]">
        <div className="bg-[#383A40] rounded-lg flex items-end px-4 py-2 shadow-sm focus-within:ring-1 focus-within:ring-primary/50">
          <button className="p-1 mr-2 mb-[2px] text-muted-foreground hover:text-foreground hover:bg-secondary rounded-full transition-colors shrink-0">
            <PlusCircle size={22} className="fill-muted-foreground/20" />
          </button>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              resizeTextarea(e.target);
            }}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${recipientName}`}
            className="flex-1 bg-transparent border-0 focus:ring-0 resize-none text-foreground placeholder:text-muted-foreground py-2 min-h-[44px] max-h-[200px] overflow-y-auto leading-normal"
            rows={1}
            style={{ height: '44px' }}
          />
          <div className="flex items-center gap-1 ml-2 mb-[2px] shrink-0">
            <button className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors">
              <Smile size={22} />
            </button>
            <button
              onClick={handleSend}
              disabled={!content.trim()}
              className={`p-1.5 rounded-md transition-colors ${content.trim() ? 'text-primary hover:bg-primary/20' : 'text-muted-foreground/40 cursor-not-allowed'}`}
              title="Send message"
            >
              <SendHorizonal size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Spacer so voice panel doesn't cover the composer */}
      {voicePanelHeight > 0 && (
        <div style={{ height: voicePanelHeight }} className="shrink-0" />
      )}
    </div>
  );
}
