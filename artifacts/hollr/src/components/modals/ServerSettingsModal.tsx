import { useState, useEffect } from 'react';
import { X, Save, Loader2, Server, Trash2, AlertTriangle } from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import { useGetServer, useUpdateServer, getGetServerQueryKey, getListMyServersQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@workspace/replit-auth-web';
import { getInitials } from '@/lib/utils';
import { ImageCropUploader } from '@/components/shared/ImageCropUploader';

const BASE = import.meta.env.BASE_URL;

export function ServerSettingsModal() {
  const { serverSettingsModalOpen, setServerSettingsModalOpen, activeServerId, setActiveServer } = useAppStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

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
  const isOwner = server?.ownerId === user?.id;

  const handleDeleteServer = async () => {
    if (!activeServerId || !server) return;
    if (!confirm(`Permanently delete "${server.name}"? All channels and messages will be lost. This cannot be undone.`)) return;
    try {
      const res = await fetch(`${BASE}api/servers/${activeServerId}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error();
      setActiveServer(null);
      qc.invalidateQueries({ queryKey: getListMyServersQueryKey() });
      toast({ title: `${server.name} deleted` });
      setServerSettingsModalOpen(false);
    } catch {
      toast({ title: 'Could not delete server', variant: 'destructive' });
    }
  };

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
      className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-[200] p-0 sm:p-4"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      onClick={() => setServerSettingsModalOpen(false)}
    >
      <div
        className="bg-surface-3 rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-md flex flex-col max-h-[92dvh] sm:max-h-[85dvh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle — mobile only */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-border/40" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 sm:px-6 sm:py-4 border-b border-border/10 shrink-0">
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

        {/* Body — scrollable */}
        <div className="px-5 py-5 sm:px-6 space-y-5 overflow-y-auto flex-1 min-h-0">
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
              className="w-full bg-surface-0 text-foreground rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary border border-border/20"
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
              className="w-full bg-surface-0 text-foreground rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary border border-border/20 resize-none"
              placeholder="What's this server about?"
            />
          </div>

          {/* Danger Zone — owner only */}
          {isOwner && (
            <div className="border border-destructive/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-destructive shrink-0" />
                <span className="text-xs font-bold text-destructive uppercase tracking-wider">Danger Zone</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">Delete this server</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Permanently removes this server and all its channels. This cannot be undone.</p>
                </div>
                <button
                  type="button"
                  onClick={handleDeleteServer}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-destructive/10 hover:bg-destructive/20 text-destructive text-xs font-bold rounded-lg border border-destructive/30 transition-colors"
                >
                  <Trash2 size={13} />
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer — sticky at bottom */}
        <div className="flex justify-end gap-3 px-5 py-4 sm:px-6 border-t border-border/10 shrink-0">
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
