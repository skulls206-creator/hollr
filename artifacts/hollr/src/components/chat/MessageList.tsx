import { useEffect, useRef } from 'react';
import { useListMessages } from '@workspace/api-client-react';
import { format } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials, formatBytes } from '@/lib/utils';
import { FileText, Download } from 'lucide-react';

export function MessageList({ channelId }: { channelId: string }) {
  const { data: messages = [], isLoading } = useListMessages(channelId);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground">Loading messages...</div>;
  }

  // Messages usually come newest-first from API, so reverse them for display
  const sortedMessages = [...messages].reverse();

  return (
    <div className="flex-1 overflow-y-auto flex flex-col p-4 gap-4 no-scrollbar">
      <div className="mt-auto" /> {/* Pushes content to bottom if few messages */}
      
      {sortedMessages.length === 0 && (
        <div className="text-center py-10">
          <h2 className="text-2xl font-bold text-foreground">Welcome to the channel!</h2>
          <p className="text-muted-foreground mt-2">This is the start of a beautiful conversation.</p>
        </div>
      )}

      {sortedMessages.map((msg, index) => {
        const showHeader = index === 0 || sortedMessages[index - 1].authorId !== msg.authorId || 
          (new Date(msg.createdAt).getTime() - new Date(sortedMessages[index - 1].createdAt).getTime() > 5 * 60000);

        return (
          <div key={msg.id} className={`group flex ${showHeader ? 'mt-4' : 'mt-0.5'} hover:bg-black/5 p-1 -mx-4 px-4 rounded-sm transition-colors`}>
            {showHeader ? (
              <Avatar className="h-10 w-10 mr-4 cursor-pointer hover:opacity-80 transition-opacity shrink-0">
                <AvatarImage src={msg.author.avatarUrl || undefined} />
                <AvatarFallback className="bg-primary text-white">{getInitials(msg.author.displayName || msg.author.username)}</AvatarFallback>
              </Avatar>
            ) : (
              <div className="w-14 shrink-0 text-right pr-4 text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 flex items-center justify-end">
                {format(new Date(msg.createdAt), 'h:mm a')}
              </div>
            )}
            
            <div className="flex flex-col min-w-0 flex-1">
              {showHeader && (
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="font-medium text-base text-indigo-400 hover:underline cursor-pointer tracking-wide">{msg.author.displayName || msg.author.username}</span>
                  <span className="text-xs text-muted-foreground">{format(new Date(msg.createdAt), 'MM/dd/yyyy h:mm a')}</span>
                </div>
              )}
              
              <div className="text-foreground text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                {msg.content}
              </div>

              {/* Attachments rendering */}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {msg.attachments.map(att => {
                    const isImage = att.contentType.startsWith('image/');
                    const url = `/api/storage${att.objectPath}`; // Construct serving URL as per docs
                    
                    if (isImage) {
                      return (
                        <div key={att.id} className="max-w-[400px] max-h-[400px] rounded-lg overflow-hidden border border-border/50 bg-black/20">
                          <img src={url} alt={att.name} className="object-contain w-full h-full" loading="lazy" />
                        </div>
                      );
                    }
                    
                    return (
                      <a key={att.id} href={url} download target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 bg-secondary border border-border/50 rounded-lg hover:bg-secondary/80 transition-colors w-72">
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
  );
}
