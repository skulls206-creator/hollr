import { useEffect, useRef, useState } from 'react';
import { useListDmMessages, getListDmMessagesQueryKey, useSendDmMessage } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Smile } from 'lucide-react';

export function DmChatArea({ threadId, recipientName, recipientAvatar }: {
  threadId: string;
  recipientName: string;
  recipientAvatar?: string | null;
}) {
  const { data: messages = [], isLoading } = useListDmMessages(threadId);
  const { mutate: sendMessage } = useSendDmMessage();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [content, setContent] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!content.trim()) return;
    sendMessage({ threadId, data: { content: content.trim() } }, {
      onSuccess: () => {
        setContent('');
        queryClient.invalidateQueries({ queryKey: getListDmMessagesQueryKey(threadId) });
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

  const sorted = [...messages].reverse();

  return (
    <div className="flex-1 bg-[#313338] flex flex-col h-full min-w-0">
      {/* Header */}
      <div className="h-12 border-b border-border/10 flex items-center px-4 shrink-0 shadow-sm z-10 bg-[#313338]">
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
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="px-4 pb-6 pt-2 bg-[#313338]">
        <div className="bg-[#383A40] rounded-lg flex items-center px-4 py-2 shadow-sm focus-within:ring-1 focus-within:ring-primary/50">
          <button className="p-1 mr-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-full transition-colors shrink-0">
            <PlusCircle size={22} className="fill-muted-foreground/20" />
          </button>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${recipientName}`}
            className="flex-1 bg-transparent border-0 focus:ring-0 resize-none text-foreground placeholder:text-muted-foreground py-2 h-[44px] min-h-[44px] max-h-[50vh] overflow-y-auto leading-normal"
            rows={1}
          />
          <button className="p-1 ml-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors">
            <Smile size={22} />
          </button>
        </div>
      </div>
    </div>
  );
}
