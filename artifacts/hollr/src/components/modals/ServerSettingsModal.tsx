import { useState, useEffect } from 'react';
import { X, Save, Loader2, Server } from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import { useGetServer, useUpdateServer, getGetServerQueryKey, getListMyServersQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { getInitials } from '@/lib/utils';
import { ImageCropUploader } from '@/components/shared/ImageCropUploader';

export function ServerSettingsModal() {
  const { serverSettingsModalOpen, setServerSettingsModalOpen, activeServerId } = useAppStore();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: server } = useGetServer(activeServerId || '', {
    query: { queryKey: getGetServerQueryKey(activeServerId || ''), enabled: !!activeServerId && serverSettingsModalOpen },
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [iconUrl, setIconUrl] = useState('');

  useEffect(() => {
    if (server) {
      setName(server.name || '');
      setDescription(server.description || '');
      setIconUrl(server.iconUrl || '');
    }
  }, [server, serverSettingsModalOpen]);

  const { mutate: updateServer, isPending } = useUpdateServer();

  const handleSave = () => {
    if (!activeServerId || !name.trim()) return;
    updateServer(
      {
        serverId: activeServerId,
        data: {
          name: name.trim(),
          description: description.trim() || undefined,
          iconUrl: iconUrl || undefined,
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetServerQueryKey(activeServerId) });
          qc.invalidateQueries({ queryKey: getListMyServersQueryKey() });
          toast({ title: 'Server settings saved' });
          setServerSettingsModalOpen(false);
        },
        onError: () => toast({ title: 'Failed to save settings', variant: 'destructive' }),
      }
    );
  };

  if (!serverSettingsModalOpen || !activeServerId) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={() => setServerSettingsModalOpen(false)}
    >
      <div
        className="bg-[#313338] rounded-xl shadow-2xl w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/10">
          <div className="flex items-center gap-2.5">
            <Server size={20} className="text-primary" />
            <h2 className="text-lg font-bold text-foreground">Server Settings</h2>
          </div>
          <button
            onClick={() => setServerSettingsModalOpen(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Server Icon */}
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
              Server Icon
            </label>
            <ImageCropUploader
              current={iconUrl}
              shape="square"
              onComplete={(url) => setIconUrl(url)}
              placeholder={
                <span className="text-foreground text-xl font-bold select-none">
                  {getInitials(name || 'S')}
                </span>
              }
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
              Server Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={100}
              className="w-full bg-[#1E1F22] text-foreground rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary border border-border/20"
              placeholder="My Awesome Server"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              className="w-full bg-[#1E1F22] text-foreground rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary border border-border/20 resize-none"
              placeholder="What's this server about?"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border/10">
          <button
            onClick={() => setServerSettingsModalOpen(false)}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isPending || !name.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-bold rounded-lg disabled:opacity-50 transition-colors"
          >
            {isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
