import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, CheckCircle2, XCircle, MessageSquare, Search } from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import { useOpenDmThread } from '@workspace/api-client-react';
import { cn, getInitials } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { getListDmThreadsQueryKey } from '@workspace/api-client-react';

type LookupState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'found'; user: { id: string; username: string; displayName: string; avatarUrl?: string; status: string } }
  | { status: 'not_found'; message: string };

export function NewDmModal() {
  const { newDmModalOpen, setNewDmModalOpen, setActiveDmThread, setActiveServer } = useAppStore();
  const [query, setQuery] = useState('');
  const [lookup, setLookup] = useState<LookupState>({ status: 'idle' });
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qc = useQueryClient();

  const { mutateAsync: openThread } = useOpenDmThread();

  // Focus input on open
  useEffect(() => {
    if (newDmModalOpen) {
      setQuery('');
      setLookup({ status: 'idle' });
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [newDmModalOpen]);

  // Debounced lookup
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const q = query.trim();
    if (!q) {
      setLookup({ status: 'idle' });
      return;
    }

    setLookup({ status: 'loading' });

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/lookup?q=${encodeURIComponent(q)}`, { credentials: 'include' });
        if (res.ok) {
          const user = await res.json();
          setLookup({ status: 'found', user });
        } else {
          const body = await res.json().catch(() => ({}));
          setLookup({ status: 'not_found', message: body.error ?? 'User not found' });
        }
      } catch {
        setLookup({ status: 'not_found', message: 'Could not reach server' });
      }
    }, 500);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const handleStart = async () => {
    if (lookup.status !== 'found') return;
    setSubmitting(true);
    try {
      const thread = await openThread({ data: { userId: lookup.user.id } });
      await qc.invalidateQueries({ queryKey: getListDmThreadsQueryKey() });
      setActiveServer(null);
      setActiveDmThread((thread as any).id);
      setNewDmModalOpen(false);
    } catch {
      // silently keep modal open
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && lookup.status === 'found') handleStart();
    if (e.key === 'Escape') setNewDmModalOpen(false);
  };

  if (!newDmModalOpen) return null;

  return (
    <AnimatePresence>
      {newDmModalOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            className="fixed inset-0 bg-black/60 z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setNewDmModalOpen(false)}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            className="fixed inset-0 flex items-center justify-center z-[61] px-4 pointer-events-none"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            <div
              className="bg-surface-1 border border-border/20 rounded-2xl shadow-2xl shadow-black/50 w-full max-w-md pointer-events-auto"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center">
                    <MessageSquare size={16} className="text-primary" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-foreground leading-tight">New Direct Message</h2>
                    <p className="text-[11px] text-muted-foreground leading-tight">Enter a username or email address</p>
                  </div>
                </div>
                <button
                  onClick={() => setNewDmModalOpen(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-white/5"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Input */}
              <div className="px-5 pb-4">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="username or email@example.com"
                    className="w-full bg-background border border-border/30 rounded-xl pl-9 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
                  />
                  {/* Status icon inside input */}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {lookup.status === 'loading' && (
                      <Loader2 size={16} className="text-muted-foreground animate-spin" />
                    )}
                    {lookup.status === 'found' && (
                      <CheckCircle2 size={16} className="text-emerald-400" />
                    )}
                    {lookup.status === 'not_found' && (
                      <XCircle size={16} className="text-destructive" />
                    )}
                  </div>
                </div>

                {/* Result card */}
                <AnimatePresence mode="wait">
                  {lookup.status === 'found' && (
                    <motion.div
                      key="found"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.15 }}
                      className="mt-3 flex items-center gap-3 px-3 py-2.5 bg-emerald-500/8 border border-emerald-500/20 rounded-xl"
                    >
                      {/* Avatar */}
                      <div className="w-9 h-9 rounded-full overflow-hidden bg-secondary shrink-0 flex items-center justify-center text-xs font-bold">
                        {lookup.user.avatarUrl
                          ? <img src={lookup.user.avatarUrl} alt={lookup.user.displayName} className="w-full h-full object-cover" />
                          : <span>{getInitials(lookup.user.displayName)}</span>
                        }
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{lookup.user.displayName}</p>
                        <p className="text-[11px] text-muted-foreground truncate">@{lookup.user.username}</p>
                      </div>
                      <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                    </motion.div>
                  )}

                  {lookup.status === 'not_found' && query.trim() && (
                    <motion.div
                      key="not-found"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.15 }}
                      className="mt-3 flex items-center gap-3 px-3 py-2.5 bg-destructive/8 border border-destructive/20 rounded-xl"
                    >
                      <XCircle size={18} className="text-destructive shrink-0" />
                      <p className="text-sm text-destructive">{lookup.message}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2.5 px-5 pb-5">
                <button
                  onClick={() => setNewDmModalOpen(false)}
                  className="px-4 py-2 text-sm rounded-xl border border-border/30 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStart}
                  disabled={lookup.status !== 'found' || submitting}
                  className={cn(
                    'px-4 py-2 text-sm rounded-xl font-semibold transition-all',
                    lookup.status === 'found' && !submitting
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'
                      : 'bg-primary/30 text-primary-foreground/40 cursor-not-allowed'
                  )}
                >
                  {submitting ? (
                    <span className="flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Starting…</span>
                  ) : 'Start Conversation'}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
