import { Ghost } from 'lucide-react';
import { useEffect } from 'react';

interface Props {
  content: string;
  onClose: () => void;
}

export function GhostRevealModal({ content, onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-surface-1 border border-border/40 rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6 flex flex-col items-center gap-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center">
            <Ghost size={24} className="text-primary" />
          </div>
          <h2 className="text-[15px] font-semibold text-foreground">Ghost Message</h2>
          <p className="text-[12px] text-muted-foreground/70 text-center">
            This message will self-destruct — it can't be revealed again.
          </p>
        </div>

        <div className="w-full bg-muted/30 rounded-xl px-4 py-3 text-[14px] text-foreground leading-relaxed whitespace-pre-wrap break-words border border-border/20">
          {content}
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all"
        >
          Got it — destroy message
        </button>
      </div>
    </div>
  );
}
