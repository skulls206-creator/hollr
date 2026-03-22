import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Users, ServerCrash, Loader2 } from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import { useQueryClient } from '@tanstack/react-query';
import { getListMyServersQueryKey } from '@workspace/api-client-react';

interface ServerPreview {
  id: string;
  name: string;
  memberCount: number;
  iconUrl: string | null;
  inviteCode: string;
}

export function JoinServer({ code }: { code: string }) {
  const [, setLocation] = useLocation();
  const [serverPreview, setServerPreview] = useState<ServerPreview | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'joining' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const { setActiveServer } = useAppStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    const fetchPreview = async () => {
      try {
        const res = await fetch(`/api/invite/${code}`);
        if (!res.ok) throw new Error('Invalid or expired invite link.');
        const data = await res.json();
        setServerPreview(data);
        setStatus('ready');
      } catch (err: any) {
        setErrorMsg(err.message || 'Unknown error');
        setStatus('error');
      }
    };
    fetchPreview();
  }, [code]);

  const handleJoin = async () => {
    setStatus('joining');
    try {
      const res = await fetch(`/api/invite/${code}/join`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to join server.');
      const server = await res.json();
      queryClient.invalidateQueries({ queryKey: getListMyServersQueryKey() });
      setActiveServer(server.id);
      setLocation('/app');
    } catch (err: any) {
      setErrorMsg(err.message || 'Unknown error');
      setStatus('error');
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-surface-3 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading invite…</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-surface-3 flex items-center justify-center p-4">
        <div className="bg-surface-1 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl border border-border/20">
          <ServerCrash className="w-16 h-16 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Invite Invalid</h1>
          <p className="text-muted-foreground mb-6">{errorMsg}</p>
          <button
            onClick={() => setLocation('/app')}
            className="w-full py-3 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground font-medium transition-colors"
          >
            Go to hollr
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-3 flex items-center justify-center p-4">
      <div className="bg-surface-1 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl border border-border/20">
        {serverPreview?.iconUrl ? (
          <img
            src={serverPreview.iconUrl}
            alt={serverPreview.name}
            className="w-20 h-20 rounded-2xl mx-auto mb-4 object-cover border border-border/30"
          />
        ) : (
          <div className="w-20 h-20 rounded-2xl bg-primary mx-auto mb-4 flex items-center justify-center">
            <span className="text-3xl font-bold text-primary-foreground">
              {serverPreview?.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
        )}

        <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold mb-1">
          You've been invited to join
        </p>
        <h1 className="text-2xl font-bold text-foreground mb-2">{serverPreview?.name}</h1>
        <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground mb-8">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span>{serverPreview?.memberCount} Members</span>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleJoin}
            disabled={status === 'joining'}
            className="w-full py-3 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {status === 'joining' ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Joining…</>
            ) : (
              <>
                <Users size={20} />
                Accept Invite
              </>
            )}
          </button>
          <button
            onClick={() => setLocation('/app')}
            className="w-full py-3 rounded-lg bg-transparent hover:bg-secondary text-muted-foreground font-medium transition-colors"
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
