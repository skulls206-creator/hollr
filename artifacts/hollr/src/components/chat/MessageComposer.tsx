import { useState, useRef } from 'react';
import { PlusCircle, Smile, FileText, Image as ImageIcon } from 'lucide-react';
import { useSendMessage, useRequestUploadUrl, getListMessagesQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { cn, formatBytes } from '@/lib/utils';

export function MessageComposer({ channelId }: { channelId: string }) {
  const [content, setContent] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { mutate: sendMessage, isPending: isSending } = useSendMessage();
  const { mutateAsync: requestUpload } = useRequestUploadUrl();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleSend = () => {
    if (!content.trim() && !isUploading) return;
    
    sendMessage({ channelId, data: { content: content.trim() } }, {
      onSuccess: () => {
        setContent('');
        // Optimistic update could go here, but use-realtime handles the WS event
        queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(channelId) });
      },
      onError: () => toast({ title: "Failed to send", variant: "destructive" })
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
    setUploadProgress(10); // Fake initial progress

    try {
      // 1. Get presigned URL
      const { uploadURL, objectPath } = await requestUpload({
        data: { name: file.name, size: file.size, contentType: file.type }
      });
      setUploadProgress(40);

      // 2. Upload directly to GCS via PUT
      const uploadRes = await fetch(uploadURL, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type }
      });

      if (!uploadRes.ok) throw new Error("Upload failed");
      setUploadProgress(100);

      // 3. Send message with attachment
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
    <div className="px-4 pb-6 pt-2 w-full bg-[#313338]">
      <div className="bg-[#383A40] rounded-lg flex items-center px-4 py-2 relative overflow-hidden shadow-sm focus-within:ring-1 focus-within:ring-primary/50">
        
        {isUploading && (
          <div className="absolute top-0 left-0 h-1 bg-primary transition-all duration-300 ease-out" style={{ width: `${uploadProgress}%` }} />
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
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message...`}
          className="flex-1 bg-transparent border-0 focus:ring-0 resize-none text-foreground placeholder:text-muted-foreground py-2 h-[44px] min-h-[44px] max-h-[50vh] overflow-y-auto leading-normal"
          rows={1}
        />

        <div className="flex items-center gap-2 ml-2 shrink-0">
          <button className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors">
            <Smile size={22} />
          </button>
        </div>
      </div>
    </div>
  );
}
